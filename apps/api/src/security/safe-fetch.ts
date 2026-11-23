import dns from 'node:dns/promises';
import tls from 'node:tls';
import { AppError } from '../lib/errors';
import { isPublicIp } from './ip';
import { normalizeHost } from './marketplaces';
import { assertSafeUrlShape } from './url-guard';

export interface DnsResolver {
	resolve(hostname: string): Promise<string[]>;
}

export const systemResolver: DnsResolver = {
	async resolve(hostname) {
		const records = await dns.lookup(hostname, { all: true, verbatim: true });
		return records.map((r) => r.address);
	}
};

export interface TransportRequest {
	url: URL;
	/** Pre-validated IP the connection must be made to (DNS-rebinding protection). */
	ip: string;
	headers: Record<string, string>;
	signal: AbortSignal;
}

/** Performs exactly one HTTP request, never following redirects. */
export type Transport = (req: TransportRequest) => Promise<Response>;

/**
 * Connects to the pinned IP, sends the original Host header, uses the original
 * hostname for SNI and verifies the certificate against that hostname.
 */
export const pinnedIpTransport: Transport = async ({ url, ip, headers, signal }) => {
	const hostname = normalizeHost(url.hostname);
	const ipHost = ip.includes(':') ? `[${ip}]` : ip;
	const target = `${url.protocol}//${ipHost}${url.pathname}${url.search}`;
	return fetch(target, {
		method: 'GET',
		redirect: 'manual',
		signal,
		headers: { ...headers, host: url.host },
		tls: {
			serverName: hostname,
			rejectUnauthorized: true,
			checkServerIdentity: (_host: string, cert: tls.PeerCertificate) => tls.checkServerIdentity(hostname, cert)
		}
	});
};

export interface SafeFetchOptions {
	timeoutMs: number;
	maxRedirects: number;
	maxResponseBytes: number;
	/** Every hop's host must pass this check (marketplace allowlist). */
	isAllowedHost: (host: string) => boolean;
	userAgent?: string;
}

export interface SafeFetchResult {
	finalUrl: string;
	status: number;
	contentType: string | null;
	body: string;
	redirectChain: string[];
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_UA = 'AffiliateProductExtractor/1.0 (metadata reader)';

async function resolvePublicIp(host: string, resolver: DnsResolver, isFirstHop: boolean): Promise<string> {
	let addresses: string[];
	try {
		addresses = await resolver.resolve(host);
	} catch (cause) {
		throw new AppError(isFirstHop ? 'INVALID_AFFILIATE_URL' : 'REDIRECT_FAILED', `Host "${host}" could not be resolved`, {
			cause
		});
	}
	if (addresses.length === 0) {
		throw new AppError(isFirstHop ? 'INVALID_AFFILIATE_URL' : 'REDIRECT_FAILED', `Host "${host}" has no addresses`);
	}
	// Strict: if ANY resolved address is non-public, refuse (prevents mixed-record tricks).
	const blocked = addresses.find((a) => !isPublicIp(a));
	if (blocked) {
		throw new AppError('INVALID_URL', `Host "${host}" resolves to a non-public address`);
	}
	return addresses[0] as string;
}

async function readLimitedBody(res: Response, maxBytes: number): Promise<string> {
	const declared = Number(res.headers.get('content-length') ?? '0');
	if (declared > maxBytes) {
		await res.body?.cancel();
		throw new AppError('EXTRACTION_FAILED', `Response exceeds ${maxBytes} bytes`);
	}
	if (!res.body) return '';
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new AppError('EXTRACTION_FAILED', `Response exceeds ${maxBytes} bytes`);
		}
		chunks.push(value);
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		merged.set(c, offset);
		offset += c.byteLength;
	}
	return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/**
 * SSRF-safe GET:
 * - scheme / credentials / port / IP-literal checks on every hop
 * - marketplace host allowlist on every hop
 * - DNS resolved by us, every address must be public, connection pinned to that IP
 * - manual redirects with depth limit, overall timeout, streamed response size limit
 */
export async function safeFetch(
	input: string,
	options: SafeFetchOptions,
	deps: { resolver?: DnsResolver; transport?: Transport } = {}
): Promise<SafeFetchResult> {
	const resolver = deps.resolver ?? systemResolver;
	const transport = deps.transport ?? pinnedIpTransport;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), options.timeoutMs);
	const redirectChain: string[] = [];

	try {
		let current = new URL(input);
		for (let hop = 0; ; hop++) {
			assertSafeUrlShape(current);
			const host = normalizeHost(current.hostname);
			if (!options.isAllowedHost(host)) {
				throw new AppError(
					hop === 0 ? 'UNSUPPORTED_MARKETPLACE' : 'REDIRECT_FAILED',
					hop === 0 ? `Host "${host}" is not allowed` : `Redirect to non-allowlisted host "${host}" was blocked`
				);
			}
			const ip = await resolvePublicIp(host, resolver, hop === 0);

			let res: Response;
			try {
				res = await transport({
					url: current,
					ip,
					signal: controller.signal,
					headers: {
						'user-agent': options.userAgent ?? DEFAULT_UA,
						accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
						'accept-language': 'th-TH,th;q=0.9,en;q=0.8'
					}
				});
			} catch (cause) {
				if (isAbortError(cause) || controller.signal.aborted) {
					throw new AppError('REQUEST_TIMEOUT', `Request timed out after ${options.timeoutMs}ms`, { cause });
				}
				throw new AppError(hop === 0 ? 'EXTRACTION_FAILED' : 'REDIRECT_FAILED', `Connection to "${host}" failed`, {
					cause
				});
			}

			if (REDIRECT_STATUSES.has(res.status)) {
				await res.body?.cancel();
				const location = res.headers.get('location');
				if (!location) throw new AppError('REDIRECT_FAILED', `Redirect from "${host}" without Location header`);
				if (hop >= options.maxRedirects) {
					throw new AppError('REDIRECT_FAILED', `Too many redirects (limit ${options.maxRedirects})`);
				}
				let next: URL;
				try {
					next = new URL(location, current);
				} catch {
					throw new AppError('REDIRECT_FAILED', 'Redirect Location header is not a valid URL');
				}
				next.hash = '';
				redirectChain.push(next.toString());
				current = next;
				continue;
			}

			const body = await readLimitedBody(res, options.maxResponseBytes);
			return {
				finalUrl: current.toString(),
				status: res.status,
				contentType: res.headers.get('content-type'),
				body,
				redirectChain
			};
		}
	} catch (error) {
		if (error instanceof AppError) throw error;
		if (isAbortError(error) || controller.signal.aborted) {
			throw new AppError('REQUEST_TIMEOUT', `Request timed out after ${options.timeoutMs}ms`, { cause: error });
		}
		throw new AppError('EXTRACTION_FAILED', 'Unexpected fetch failure', { cause: error });
	} finally {
		clearTimeout(timer);
	}
}
