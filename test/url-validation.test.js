import { validateUrl, isPrivateIP, parseIPv4 } from '../src/url-validation.js';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Resolver stubs (injected to avoid real DNS calls)
// ---------------------------------------------------------------------------

const publicResolver = {
  resolve4: async () => ['93.184.216.34'],
  resolve6: async () => ['2606:2800:220:1:248:1893:25c8:1946'],
};

const loopbackResolver = {
  resolve4: async () => ['127.0.0.1'],
  resolve6: async () => ['::1'],
};

const failingResolver = {
  resolve4: async () => { throw new Error('ENOTFOUND'); },
  resolve6: async () => { throw new Error('ENOTFOUND'); },
};

const emptyResolver = {
  resolve4: async () => [],
  resolve6: async () => [],
};

// ---------------------------------------------------------------------------
// Valid URLs (positive cases)
// ---------------------------------------------------------------------------

describe('valid URLs (positive cases)', () => {
  it('accepts http:// URL with public IP resolution', async () => {
    const result = await validateUrl('http://example.com/', publicResolver);
    expect(result.ok).toBe(true);
  });

  it('accepts https:// URL with public IP resolution', async () => {
    const result = await validateUrl('https://example.com/', publicResolver);
    expect(result.ok).toBe(true);
  });

  it('returns normalized URL in result', async () => {
    const result = await validateUrl('HTTP://Example.COM/Path?A=1', publicResolver);
    expect(result.ok).toBe(true);
    expect(result.url).toBe('http://example.com/Path?A=1');
    expect(result.url).not.toBe('HTTP://Example.COM/Path?A=1');
  });

  it('returns first resolved IP in result', async () => {
    const result = await validateUrl('https://example.com/', publicResolver);
    expect(result.ok).toBe(true);
    expect(result.ip).toBe('93.184.216.34');
  });

  it('accepts URL with path and query string', async () => {
    const result = await validateUrl('https://example.com/some/path?foo=bar&baz=qux', publicResolver);
    expect(result.ok).toBe(true);
  });

  it('accepts URL at exactly 2048 characters', async () => {
    const base = 'https://example.com/';
    const padding = 'a'.repeat(2048 - base.length);
    const url = base + padding;
    expect(url.length).toBe(2048);
    const result = await validateUrl(url, publicResolver);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// URL length limit
// ---------------------------------------------------------------------------

describe('URL length limit', () => {
  it('rejects URL exceeding 2048 characters', async () => {
    const base = 'https://example.com/';
    const padding = 'a'.repeat(2048 - base.length + 1);
    const url = base + padding;
    expect(url.length).toBe(2049);
    const result = await validateUrl(url, publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

describe('URL parsing', () => {
  it('rejects unparseable URL', async () => {
    const result = await validateUrl('not a url at all !!', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('rejects empty string', async () => {
    const result = await validateUrl('', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('rejects relative URL without scheme', async () => {
    const result = await validateUrl('/relative/path', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Scheme allowlist
// ---------------------------------------------------------------------------

describe('scheme allowlist', () => {
  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<h1>test</h1>'],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://example.com/file'],
    ['blob:', 'blob:https://example.com/uuid'],
    ['ws:', 'ws://example.com/socket'],
    ['wss:', 'wss://example.com/socket'],
    ['chrome:', 'chrome://settings'],
    ['about:', 'about:blank'],
    ['gopher:', 'gopher://example.com/'],
    ['ldap:', 'ldap://example.com/dc=example'],
  ])('rejects %s scheme', async (scheme, url) => {
    const result = await validateUrl(url, publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('allows http: scheme', async () => {
    const result = await validateUrl('http://example.com/', publicResolver);
    expect(result.ok).toBe(true);
  });

  it('allows https: scheme', async () => {
    const result = await validateUrl('https://example.com/', publicResolver);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Embedded credentials
// ---------------------------------------------------------------------------

describe('embedded credentials', () => {
  it('rejects URL with username', async () => {
    const result = await validateUrl('https://user@example.com/', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('rejects URL with username and password', async () => {
    const result = await validateUrl('https://user:pass@example.com/', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// IPv4 address obfuscation
// ---------------------------------------------------------------------------

describe('IPv4 address obfuscation', () => {
  it.each([
    ['dotted decimal loopback', 'http://127.0.0.1/'],
    ['hex encoded loopback', 'http://0x7f000001/'],
    ['octal encoded loopback', 'http://0177.0.0.1/'],
    ['decimal integer loopback', 'http://2130706433/'],
    ['mixed hex/octal loopback', 'http://0x7f.0.0.1/'],
    ['shorthand loopback (127.1)', 'http://127.1/'],
    ['bare zero (0.0.0.0)', 'http://0/'],
    ['dotted hex parts (0xc0.0xa8.0x01.0x01)', 'http://0xc0.0xa8.0x01.0x01/'],
    ['RFC 1918 10.x', 'http://10.0.0.1/'],
    ['RFC 1918 172.16.x', 'http://172.16.0.1/'],
    ['RFC 1918 192.168.x', 'http://192.168.1.1/'],
    ['CGNAT 100.64.0.1', 'http://100.64.0.1/'],
    ['link-local 169.254.x', 'http://169.254.169.254/'],
    ['link-local metadata endpoint', 'http://169.254.169.254/latest/meta-data/'],
  ])('rejects %s', async (description, url) => {
    const result = await validateUrl(url, publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// IPv6 private ranges
// ---------------------------------------------------------------------------

describe('IPv6 private ranges', () => {
  it.each([
    ['::1 (loopback)', 'http://[::1]/'],
    ['::ffff:127.0.0.1 (IPv4-mapped dotted-decimal loopback)', 'http://[::ffff:127.0.0.1]/'],
    ['::ffff:10.0.0.1 (IPv4-mapped dotted-decimal RFC 1918)', 'http://[::ffff:10.0.0.1]/'],
    ['::ffff:7f00:1 (IPv4-mapped hex-group loopback bypass)', 'http://[::ffff:7f00:1]/'],
    ['fc00::1 (ULA)', 'http://[fc00::1]/'],
    ['fd00::1 (ULA fd)', 'http://[fd00::1]/'],
    ['fe80::1 (link-local)', 'http://[fe80::1]/'],
    ['ff02::1 (multicast)', 'http://[ff02::1]/'],
    [':: (unspecified)', 'http://[::]/'],
    ['2001:db8::1 (documentation)', 'http://[2001:db8::1]/'],
  ])('rejects %s', async (description, url) => {
    const result = await validateUrl(url, publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// parseIPv4 — direct unit tests
// ---------------------------------------------------------------------------

describe('parseIPv4', () => {
  it.each([
    ['dotted decimal', '127.0.0.1', '127.0.0.1'],
    ['hex integer', '0x7f000001', '127.0.0.1'],
    ['octal', '0177.0.0.1', '127.0.0.1'],
    ['decimal integer', '2130706433', '127.0.0.1'],
    ['shorthand (127.1)', '127.1', '127.0.0.1'],
    ['bare zero', '0', '0.0.0.0'],
    ['hex zero', '0x0', '0.0.0.0'],
    ['mixed hex/octal (0xc0.0xa8.1.1)', '0xc0.0xa8.1.1', '192.168.1.1'],
  ])('parses %s to dotted decimal', (description, input, expected) => {
    expect(parseIPv4(input)).toBe(expected);
  });

  it.each([
    ['example.com', 'example.com'],
    ['localhost', 'localhost'],
    ['::1', '::1'],
    ['empty string', ''],
  ])('returns null for non-IPv4 input: %s', (description, input) => {
    expect(parseIPv4(input)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isPrivateIP — IPv4 blocklist completeness
// ---------------------------------------------------------------------------

describe('isPrivateIP — IPv4 blocklist completeness', () => {
  it.each([
    // [range description, firstAddr, lastAddr]
    ['0.0.0.0/8 (this network)', '0.0.0.0', '0.255.255.255'],
    ['10.0.0.0/8 (RFC 1918)', '10.0.0.0', '10.255.255.255'],
    ['100.64.0.0/10 (CGNAT)', '100.64.0.0', '100.127.255.255'],
    ['127.0.0.0/8 (loopback)', '127.0.0.0', '127.255.255.255'],
    ['169.254.0.0/16 (link-local)', '169.254.0.0', '169.254.255.255'],
    ['172.16.0.0/12 (RFC 1918)', '172.16.0.0', '172.31.255.255'],
    ['192.0.0.0/24 (IETF protocol)', '192.0.0.0', '192.0.0.255'],
    ['192.0.2.0/24 (TEST-NET-1)', '192.0.2.0', '192.0.2.255'],
    ['192.168.0.0/16 (RFC 1918)', '192.168.0.0', '192.168.255.255'],
    ['198.18.0.0/15 (benchmarking)', '198.18.0.0', '198.19.255.255'],
    ['198.51.100.0/24 (TEST-NET-2)', '198.51.100.0', '198.51.100.255'],
    ['203.0.113.0/24 (TEST-NET-3)', '203.0.113.0', '203.0.113.255'],
    ['240.0.0.0/4 (reserved)', '240.0.0.0', '255.255.255.254'],
    ['255.255.255.255/32 (broadcast)', '255.255.255.255', '255.255.255.255'],
  ])('blocks entire %s range: first and last address', (range, firstAddr, lastAddr) => {
    expect(isPrivateIP(firstAddr)).toBe(true);
    expect(isPrivateIP(lastAddr)).toBe(true);
  });

  it.each([
    ['8.8.8.8', false],
    ['93.184.216.34', false],
  ])('allows public IP %s', (ip, expected) => {
    expect(isPrivateIP(ip)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// isPrivateIP — IPv6 ranges
// ---------------------------------------------------------------------------

describe('isPrivateIP — IPv6 ranges', () => {
  it.each([
    ['::1 (loopback)', '::1', true],
    ['fc00::1 (ULA)', 'fc00::1', true],
    ['fd00::1 (ULA fd)', 'fd00::1', true],
    ['fe80::1 (link-local)', 'fe80::1', true],
    ['ff02::1 (multicast)', 'ff02::1', true],
    ['::ffff:127.0.0.1 (IPv4-mapped dotted-decimal)', '::ffff:127.0.0.1', true],
    ['::ffff:10.0.0.1 (IPv4-mapped RFC 1918)', '::ffff:10.0.0.1', true],
    ['::ffff:7f00:1 (IPv4-mapped hex-group loopback bypass)', '::ffff:7f00:1', true],
    ['2001:db8::1 (documentation)', '2001:db8::1', true],
    [':: (unspecified)', '::', true],
    ['100::1 (discard prefix)', '100::1', true],
  ])('%s returns %s', (description, ip, expected) => {
    expect(isPrivateIP(ip)).toBe(expected);
  });

  it('returns false for public IPv6 2606:2800:220:1:248:1893:25c8:1946', () => {
    expect(isPrivateIP('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DNS resolution
// ---------------------------------------------------------------------------

describe('DNS resolution', () => {
  it('blocks hostname resolving to loopback 127.0.0.1', async () => {
    const resolver = { resolve4: async () => ['127.0.0.1'], resolve6: async () => [] };
    const result = await validateUrl('https://internal.example.com/', resolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('blocks hostname resolving to RFC 1918 10.x', async () => {
    const resolver = { resolve4: async () => ['10.0.0.5'], resolve6: async () => [] };
    const result = await validateUrl('https://internal.example.com/', resolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('blocks hostname resolving to IPv6 ULA fc00::', async () => {
    const resolver = { resolve4: async () => [], resolve6: async () => ['fc00::1'] };
    const result = await validateUrl('https://internal.example.com/', resolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('blocks when ANY resolved IP is private (mixed results)', async () => {
    const resolver = {
      resolve4: async () => ['93.184.216.34', '10.0.0.1'],
      resolve6: async () => [],
    };
    const result = await validateUrl('https://example.com/', resolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('passes when all resolved IPs are public', async () => {
    const result = await validateUrl('https://example.com/', publicResolver);
    expect(result.ok).toBe(true);
  });

  it('rejects when both resolve4 and resolve6 fail', async () => {
    const result = await validateUrl('https://example.com/', failingResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('rejects when both resolvers return empty arrays', async () => {
    const result = await validateUrl('https://example.com/', emptyResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('passes when resolve6 fails but resolve4 returns public IP', async () => {
    const resolver = {
      resolve4: async () => ['93.184.216.34'],
      resolve6: async () => { throw new Error('ENOTFOUND'); },
    };
    const result = await validateUrl('https://example.com/', resolver);
    expect(result.ok).toBe(true);
  });

  it('passes when resolve4 fails but resolve6 returns public IP', async () => {
    const resolver = {
      resolve4: async () => { throw new Error('ENOTFOUND'); },
      resolve6: async () => ['2606:2800:220:1:248:1893:25c8:1946'],
    };
    const result = await validateUrl('https://example.com/', resolver);
    expect(result.ok).toBe(true);
  });

  it('passes when resolve4 returns public IP and resolve6 throws', async () => {
    const resolver = {
      resolve4: async () => ['93.184.216.34'],
      resolve6: async () => { throw new Error('AAAA lookup failed'); },
    };
    const result = await validateUrl('https://example.com/', resolver);
    expect(result.ok).toBe(true);
  });

  it('passes when resolve6 returns public IPv6 and resolve4 throws', async () => {
    const resolver = {
      resolve4: async () => { throw new Error('A lookup failed'); },
      resolve6: async () => ['2606:2800:220:1:248:1893:25c8:1946'],
    };
    const result = await validateUrl('https://example.com/', resolver);
    expect(result.ok).toBe(true);
  });

  it('filters CNAME entries from resolver results (Cloudflare DNS quirk)', async () => {
    const resolver = {
      resolve4: async () => ['d37f4yd25mfj02.cloudfront.net.', '99.86.91.38', '99.86.91.17'],
      resolve6: async () => ['d37f4yd25mfj02.cloudfront.net.', '2600:9000:2117:7e00:6:bb5d:fc80:93a1'],
    };
    const result = await validateUrl('https://www.sueddeutsche.de/', resolver);
    expect(result.ok).toBe(true);
  });

  it('rejects when resolver returns only CNAMEs and no IPs', async () => {
    const resolver = {
      resolve4: async () => ['cdn.example.net.'],
      resolve6: async () => [],
    };
    const result = await validateUrl('https://example.com/', resolver);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe('Could not resolve hostname');
  });
});

// ---------------------------------------------------------------------------
// Double-encoded paths
// ---------------------------------------------------------------------------

describe('double-encoded paths', () => {
  it('rejects double-encoded slash in path: %252F', async () => {
    const result = await validateUrl('https://example.com/path%252Ftraversal', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('rejects double-encoded dot in path: %252E', async () => {
    const result = await validateUrl('https://example.com/%252E%252E/etc', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('rejects double-encoded null byte: %2500', async () => {
    const result = await validateUrl('https://example.com/file%2500.txt', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('rejects double-encoded dot-dot traversal: %252e%252e', async () => {
    const result = await validateUrl('https://example.com/%252e%252e/secret', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('rejects double-encoded slash in query string: ?q=%252F', async () => {
    const result = await validateUrl('https://example.com/search?q=%252Fetc%252Fpasswd', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it('allows single-encoded characters (not double-encoded)', async () => {
    const result = await validateUrl('https://example.com/path%2Fwith%20spaces?q=hello%20world', publicResolver);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error message safety
// ---------------------------------------------------------------------------

describe('error message safety', () => {
  it('rejection detail for private IP does not contain the actual IP', async () => {
    const result = await validateUrl('http://127.0.0.1/', publicResolver);
    expect(result.ok).toBe(false);
    expect(result.detail).not.toContain('127.0.0.1');
    expect(result.detail).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it('rejection detail for unparseable URL does not reflect the raw input', async () => {
    const maliciousInput = 'not-a-url-<script>alert(1)</script>';
    const result = await validateUrl(maliciousInput, publicResolver);
    expect(result.ok).toBe(false);
    expect(result.detail).not.toContain(maliciousInput);
    expect(result.detail).not.toContain('<script>');
  });
});

// ---------------------------------------------------------------------------
// Untestable vectors (documented)
// ---------------------------------------------------------------------------

// Vectors requiring integration/staging environments:
// - DNS rebinding (requires controlled DNS with TTL manipulation)
// - TOCTOU gap (Browser Rendering re-resolves DNS independently)
// - Cloud metadata DNS aliases (only resolve inside cloud networks)
// - CNAME chains that ultimately resolve to private IPs: the resolvers
//   return only final A/AAAA records, so CNAME bypasses are covered by
//   the IP check, but only if the DNS resolver follows the chain to
//   completion. Custom resolver stubs in production must not
//   short-circuit CNAME resolution.
//
// Acceptance criteria deferred to Step 3 (redirect orchestration):
// - "DNS-to-loopback redirect blocked"
// - "Redirect to private IP after initial validation blocked"
// These require redirect chain following, which this module does not do.
// This module validates single URLs; it will be called per-hop by the
// redirect orchestrator in Step 3.
