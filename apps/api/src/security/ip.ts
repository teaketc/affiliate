import ipaddr from 'ipaddr.js';

/** Well-known cloud metadata endpoints, blocked explicitly in addition to range checks. */
const METADATA_IPS = new Set(['169.254.169.254', '169.254.170.2', '100.100.100.200', 'fd00:ec2::254']);

export function isIpLiteral(host: string): boolean {
	const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
	return ipaddr.isValid(bare);
}

/**
 * Only globally routable unicast addresses are allowed. This rejects loopback,
 * private (RFC1918 / ULA), link-local (incl. cloud metadata), CGNAT, multicast,
 * broadcast, unspecified, reserved, benchmarking, NAT64/6to4/Teredo transition
 * ranges and IPv4-mapped IPv6 pointing at any of the above.
 */
export function isPublicIp(address: string): boolean {
	if (!ipaddr.isValid(address)) return false;
	let parsed = ipaddr.parse(address);
	if (parsed.kind() === 'ipv6') {
		const v6 = parsed as ipaddr.IPv6;
		if (v6.isIPv4MappedAddress()) parsed = v6.toIPv4Address();
	}
	const normalized = parsed.toString();
	if (METADATA_IPS.has(normalized)) return false;
	return parsed.range() === 'unicast';
}
