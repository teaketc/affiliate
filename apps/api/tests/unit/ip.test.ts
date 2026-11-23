import { describe, expect, test } from 'bun:test';
import { isIpLiteral, isPublicIp } from '../../src/security/ip';

describe('isPublicIp', () => {
	test.each([
		'127.0.0.1', '10.0.0.5', '172.16.3.4', '192.168.1.1', '169.254.169.254', '100.100.100.200', '0.0.0.0',
		'100.64.0.1', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd00:ec2::254',
		'::ffff:127.0.0.1', '::ffff:10.0.0.1', '198.18.0.1', 'not-an-ip'
	])('rejects %s', (ip) => expect(isPublicIp(ip)).toBe(false));

	test.each(['8.8.8.8', '104.20.23.154', '2606:4700::6810:84e5'])('accepts %s', (ip) => expect(isPublicIp(ip)).toBe(true));
});

test('isIpLiteral', () => {
	expect(isIpLiteral('1.2.3.4')).toBe(true);
	expect(isIpLiteral('[::1]')).toBe(true);
	expect(isIpLiteral('shopee.co.th')).toBe(false);
});
