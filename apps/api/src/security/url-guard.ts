import type { Marketplace } from '@affiliate/shared';
import { AppError } from '../lib/errors';
import { isIpLiteral } from './ip';
import { detectMarketplace, normalizeHost } from './marketplaces';

export const MAX_URL_LENGTH = 2048;

/**
 * Structural URL checks that apply to the user-submitted URL and to every redirect hop.
 * Throws AppError(INVALID_URL) on violation.
 */
export function assertSafeUrlShape(url: URL): void {
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new AppError('INVALID_URL', `URL scheme "${url.protocol}" is not allowed`);
	}
	if (url.username || url.password) {
		throw new AppError('INVALID_URL', 'URLs with embedded credentials are not allowed');
	}
	const defaultPort = url.protocol === 'https:' ? '443' : '80';
	if (url.port && url.port !== defaultPort) {
		throw new AppError('INVALID_URL', 'Non-standard ports are not allowed');
	}
	const host = normalizeHost(url.hostname);
	if (!host || isIpLiteral(host)) {
		throw new AppError('INVALID_URL', 'IP address hosts are not allowed');
	}
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
		throw new AppError('INVALID_URL', 'Local hostnames are not allowed');
	}
}

export interface ValidatedUrl {
	url: URL;
	marketplace: Marketplace;
}

/** Validates the raw user input and detects the marketplace from the allowlist. */
export function validateAffiliateUrl(input: unknown): ValidatedUrl {
	if (typeof input !== 'string') throw new AppError('INVALID_URL', 'URL must be a string');
	const raw = input.trim();
	if (!raw) throw new AppError('INVALID_URL', 'URL is required');
	if (raw.length > MAX_URL_LENGTH) throw new AppError('INVALID_URL', `URL exceeds ${MAX_URL_LENGTH} characters`);
	// Reject control characters and whitespace inside the URL (header-injection / parser confusion)
	if (/[\u0000-\u001f\u007f\s]/.test(raw)) throw new AppError('INVALID_URL', 'URL contains invalid characters');

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new AppError('INVALID_URL', 'URL is not a valid absolute URL');
	}
	assertSafeUrlShape(url);

	const marketplace = detectMarketplace(url.hostname);
	if (!marketplace) {
		throw new AppError('UNSUPPORTED_MARKETPLACE', `Host "${url.hostname}" is not a supported Shopee or Lazada domain`);
	}
	url.hash = '';
	return { url, marketplace };
}
