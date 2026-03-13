/*
 * url-validation.js -- SSRF prevention boundary for Browser Rendering
 *
 * Trust boundary: untrusted caller-supplied URLs are validated before being
 * handed to headless Chromium. Every URL that passes returns a normalised
 * form and a verified public IP.
 *
 * Attack categories defended against:
 *   - SSRF via private/reserved IP addresses (direct and DNS-based)
 *   - Scheme-based injection (javascript:, data:, file:, etc.)
 *   - Credential smuggling in URLs
 *   - IPv4 encoding variants (hex, octal, decimal integer, shorthand)
 *   - IPv4-mapped IPv6 bypass (dotted-decimal and hex-group forms)
 *   - Double-encoding path traversal and injection sequences
 *
 * Tests: test/url-validation.test.js
 *
 * Known limitation (TOCTOU): Browser Rendering independently re-resolves DNS
 * at render time. The IP returned on success is informational only -- it does
 * not guarantee which address Chromium will actually connect to.
 */ // tva

import dns from 'node:dns';

// ---------------------------------------------------------------------------
// Default DNS resolvers (injected in tests to avoid real network calls)
// ---------------------------------------------------------------------------
const defaultResolvers = {
  resolve4: (hostname) => dns.promises.resolve4(hostname),
  resolve6: (hostname) => dns.promises.resolve6(hostname),
};

// ---------------------------------------------------------------------------
// Private / reserved IP blocklist
// Each entry: { cidr: 'prefix/bits', note: 'RFC / reason' } for IPv4,
// or equivalent structure for IPv6.
// NOT exported -- callers validate through isPrivateIP(), not raw ranges.
// ---------------------------------------------------------------------------

/**
 * @typedef {{ prefix: number, bits: number }} IPv4Range
 * @typedef {{ prefix: bigint, bits: number }} IPv6Range
 */

/** @type {Array<{ prefix: number, bits: number, note: string }>} */
const IPV4_BLOCKED_RANGES = [
  // RFC 1122 "this network" -- http://0 resolves to localhost on Linux
  { prefix: 0x00000000, bits: 8,  note: '0.0.0.0/8 -- "this network" RFC 1122' },
  // RFC 1918 private networks
  { prefix: 0x0a000000, bits: 8,  note: '10.0.0.0/8 -- RFC 1918 private' },
  // CGNAT / shared address space -- Cloudflare uses subsets internally
  { prefix: 0x64400000, bits: 10, note: '100.64.0.0/10 -- CGNAT RFC 6598' },
  // Loopback
  { prefix: 0x7f000000, bits: 8,  note: '127.0.0.0/8 -- loopback' },
  // Link-local -- includes cloud metadata endpoints (169.254.169.254)
  { prefix: 0xa9fe0000, bits: 16, note: '169.254.0.0/16 -- link-local RFC 3927' },
  // RFC 1918 private
  { prefix: 0xac100000, bits: 12, note: '172.16.0.0/12 -- RFC 1918 private' },
  // IETF protocol assignments
  { prefix: 0xc0000000, bits: 24, note: '192.0.0.0/24 -- IETF protocol assignments RFC 6890' },
  // TEST-NET-1 documentation range
  { prefix: 0xc0000200, bits: 24, note: '192.0.2.0/24 -- TEST-NET-1 RFC 5737' },
  // RFC 1918 private
  { prefix: 0xc0a80000, bits: 16, note: '192.168.0.0/16 -- RFC 1918 private' },
  // Benchmarking range
  { prefix: 0xc6120000, bits: 15, note: '198.18.0.0/15 -- benchmarking RFC 2544' },
  // TEST-NET-2 documentation range
  { prefix: 0xc6336400, bits: 24, note: '198.51.100.0/24 -- TEST-NET-2 RFC 5737' },
  // TEST-NET-3 documentation range
  { prefix: 0xcb007100, bits: 24, note: '203.0.113.0/24 -- TEST-NET-3 RFC 5737' },
  // Reserved / future use
  { prefix: 0xf0000000, bits: 4,  note: '240.0.0.0/4 -- reserved RFC 1112' },
  // Broadcast
  { prefix: 0xffffffff, bits: 32, note: '255.255.255.255/32 -- broadcast' },
];

/** @type {Array<{ prefix: bigint, bits: number, note: string }>} */
const IPV6_BLOCKED_RANGES = [
  // Unspecified address -- exact match
  { prefix: 0n, bits: 128, note: ':: -- unspecified address' },
  // Loopback
  { prefix: 1n, bits: 128, note: '::1/128 -- loopback' },
  // IPv4-mapped -- handled specially; extract and re-check IPv4 portion
  { prefix: 0x0000_0000_0000_0000_0000_ffff_0000_0000n, bits: 96, note: '::ffff:0:0/96 -- IPv4-mapped RFC 4291' },
  // Unique local (ULA) -- includes fd00::/8
  { prefix: 0xfc00_0000_0000_0000_0000_0000_0000_0000n, bits: 7,  note: 'fc00::/7 -- unique local ULA RFC 4193' },
  // Link-local
  { prefix: 0xfe80_0000_0000_0000_0000_0000_0000_0000n, bits: 10, note: 'fe80::/10 -- link-local RFC 4291' },
  // Multicast
  { prefix: 0xff00_0000_0000_0000_0000_0000_0000_0000n, bits: 8,  note: 'ff00::/8 -- multicast RFC 4291' },
  // Documentation range
  { prefix: 0x2001_0db8_0000_0000_0000_0000_0000_0000n, bits: 32, note: '2001:db8::/32 -- documentation RFC 3849' },
  // Discard prefix
  { prefix: 0x0100_0000_0000_0000_0000_0000_0000_0000n, bits: 64, note: '100::/64 -- discard prefix RFC 6666' },
];

// ---------------------------------------------------------------------------
// IPv4 parsing -- handles all WHATWG URL spec encoding variants
// ---------------------------------------------------------------------------

/**
 * Parses a hostname as an IPv4 address, handling all WHATWG URL spec
 * encoding variants: dotted decimal, hex, octal, decimal integer, mixed,
 * shorthand (e.g. 127.1), and bare zero.
 *
 * Leverages the WHATWG URL constructor for normalization -- `new URL()` follows
 * the spec and normalizes hex/octal/shorthand to dotted decimal. If the
 * constructor normalizes the hostname to a dotted-decimal form, we accept it.
 *
 * @param {string} hostname
 * @returns {string|null} Dotted-decimal IPv4 string, or null if not an IPv4 address
 */
export function parseIPv4(hostname) {
  // SECURITY: Use the WHATWG URL constructor to normalize all IPv4 encoding
  // variants (hex 0x7f000001, octal 0177.0.0.1, decimal integer 2130706433,
  // shorthand 127.1). The spec mandates normalization to dotted-decimal.
  try {
    const normalized = new URL('http://' + hostname).hostname;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
      return normalized;
    }
  } catch {
    // Not parseable as a URL host
  }
  return null;
}

// ---------------------------------------------------------------------------
// IPv4 integer conversion
// ---------------------------------------------------------------------------

/**
 * Converts a dotted-decimal IPv4 string to a 32-bit unsigned integer.
 * @param {string} ip Dotted-decimal string e.g. "192.168.1.1"
 * @returns {number}
 */
function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// ---------------------------------------------------------------------------
// IPv6 parsing
// ---------------------------------------------------------------------------

/**
 * Converts a dotted-decimal IPv4 string into two 16-bit hex group strings
 * for use when building a full IPv6 group array.
 * Returns null if the input is not dotted-decimal.
 *
 * @param {string} dotted e.g. "127.0.0.1"
 * @returns {[string, string]|null}
 */
function ipv4DottedToTwoGroups(dotted) {
  const parts = dotted.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return [
    ((parts[0] << 8) | parts[1]).toString(16),
    ((parts[2] << 8) | parts[3]).toString(16),
  ];
}

/**
 * Parses an IPv6 address string (without brackets) into a 128-bit BigInt.
 * Returns null if parsing fails.
 *
 * Handles IPv4-mapped dotted-decimal form (e.g. ::ffff:127.0.0.1) by
 * converting the trailing IPv4 portion to two 16-bit hex groups before
 * numeric conversion. Without this, parseInt() truncates at the '.' and
 * produces a silently wrong bigint, allowing ::ffff:127.0.0.1 to bypass
 * the IPv4-mapped check.
 *
 * @param {string} addr IPv6 address string
 * @returns {bigint|null}
 */
function parseIPv6ToBigInt(addr) {
  try {
    // Expand :: shorthand
    let full = addr;
    if (full.includes('::')) {
      const [left, right] = full.split('::');
      const leftGroups = left ? left.split(':') : [];
      let rightGroups = right ? right.split(':') : [];
      // SECURITY: Handle dotted-decimal IPv4 suffix (e.g. ::ffff:127.0.0.1).
      // parseInt() silently truncates at '.' producing wrong values; convert
      // to two hex groups first.
      if (rightGroups.length > 0) {
        const last = rightGroups[rightGroups.length - 1];
        if (/^\d+\.\d+\.\d+\.\d+$/.test(last)) {
          const converted = ipv4DottedToTwoGroups(last);
          if (converted) {
            rightGroups = [...rightGroups.slice(0, -1), ...converted];
          }
        }
      }
      const missing = 8 - leftGroups.length - rightGroups.length;
      const middle = Array(missing).fill('0');
      full = [...leftGroups, ...middle, ...rightGroups].join(':');
    }
    const groups = full.split(':');
    if (groups.length !== 8) return null;
    let result = 0n;
    for (const g of groups) {
      result = (result << 16n) | BigInt(parseInt(g, 16));
    }
    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Private IP check
// ---------------------------------------------------------------------------

/**
 * Checks whether an IP address string falls within any private or reserved
 * range. Handles both IPv4 and IPv6, including IPv4-mapped IPv6 in both
 * dotted-decimal (::ffff:127.0.0.1) and hex-group (::ffff:7f00:1) forms.
 *
 * Prevents SSRF via private network access (CWE-918).
 *
 * @param {string} ipString
 * @returns {boolean} true if the IP is private/reserved
 */
export function isPrivateIP(ipString) {
  // Try IPv4 first
  const v4 = parseIPv4(ipString);
  if (v4 !== null) {
    return isPrivateIPv4(ipv4ToInt(v4));
  }

  // Try IPv6
  const v6 = parseIPv6ToBigInt(ipString);
  if (v6 !== null) {
    return isPrivateIPv6(v6);
  }

  // Unrecognised format -- treat as private (fail closed)
  return true;
}

/**
 * Checks a 32-bit IPv4 integer against the blocked ranges.
 * @param {number} ipInt
 * @returns {boolean}
 */
function isPrivateIPv4(ipInt) {
  for (const { prefix, bits } of IPV4_BLOCKED_RANGES) {
    const mask = bits === 32 ? 0xffffffff : (~(0xffffffff >>> bits)) >>> 0;
    if ((ipInt & mask) >>> 0 === prefix >>> 0) return true;
  }
  return false;
}

/**
 * Checks a 128-bit IPv6 BigInt against blocked ranges.
 * Handles IPv4-mapped addresses in both dotted-decimal and hex-group forms.
 *
 * @param {bigint} v6
 * @returns {boolean}
 */
function isPrivateIPv6(v6) {
  // SECURITY: Check for IPv4-mapped IPv6 (::ffff:0:0/96) in both forms.
  // The WHATWG URL constructor may retain hex-group form (::ffff:7f00:1)
  // instead of normalizing to dotted-decimal. Extract the embedded IPv4
  // address from the low 32 bits and re-check against the IPv4 blocklist.
  // Without this, http://[::ffff:7f00:1]/ bypasses localhost blocking.
  const IPV4_MAPPED_PREFIX = 0x0000_0000_0000_0000_0000_ffff_0000_0000n;
  const IPV4_MAPPED_MASK   = 0xffff_ffff_ffff_ffff_ffff_ffff_0000_0000n;
  if ((v6 & IPV4_MAPPED_MASK) === IPV4_MAPPED_PREFIX) {
    const embeddedIPv4Int = Number(v6 & 0xffffffffn) >>> 0;
    return isPrivateIPv4(embeddedIPv4Int);
  }

  for (const { prefix, bits } of IPV6_BLOCKED_RANGES) {
    if (bits === 128) {
      if (v6 === prefix) return true;
    } else {
      const mask = bits === 0 ? 0n : ((1n << BigInt(128 - bits)) - 1n) ^ 0xffff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn;
      if ((v6 & mask) === prefix) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Validates a URL for safe use with Browser Rendering (headless Chromium).
 *
 * Defends against:
 *   - SSRF via private/reserved IP addresses (CWE-918)
 *   - Scheme injection (javascript:, data:, file:, etc.)
 *   - Credential leakage via embedded userinfo
 *   - Double-encoding attacks in path and query (CWE-116)
 *
 * Returns a discriminated result object; NEVER throws for validation failures.
 *
 * @param {string} rawUrl The untrusted URL from the caller
 * @param {{ resolve4: Function, resolve6: Function }} resolvers DNS resolver
 *   functions (injectable for testing)
 * @returns {Promise<
 *   { ok: true, url: string, ip: string } |
 *   { ok: false, status: number, detail: string }
 * >}
 */
export async function validateUrl(rawUrl, { resolve4, resolve6 } = defaultResolvers) {
  // Step 1: Length check
  if (rawUrl.length > 2048) {
    return { ok: false, status: 400, detail: 'URL exceeds 2048 character limit' };
  }

  // Step 2: Parse with WHATWG URL constructor
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    // SECURITY: Do not reflect rawUrl in the error message (CWE-209)
    return { ok: false, status: 400, detail: 'URL is not valid' };
  }

  // Step 3: Scheme allowlist
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      status: 400,
      detail: `URL scheme '${parsed.protocol}' is not allowed; use http or https`,
    };
  }

  // Step 4: Reject embedded credentials
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, status: 422, detail: 'URLs with embedded credentials are not allowed' };
  }

  // Step 5: Hostname extraction and IP detection
  const hostname = parsed.hostname;

  // Remove brackets from IPv6 hostnames (e.g. [::1] -> ::1)
  const rawHostname = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // Check if hostname is a directly-supplied IPv4 address
  const directIPv4 = parseIPv4(rawHostname);
  // Check if hostname is a directly-supplied IPv6 address
  const directIPv6 = !directIPv4 ? parseIPv6ToBigInt(rawHostname) : null;

  if (directIPv4 !== null) {
    // Step 7 (direct IP path): Check private ranges
    // SECURITY: Never include the actual IP in rejection messages (network topology leak)
    if (isPrivateIPv4(ipv4ToInt(directIPv4))) {
      return { ok: false, status: 422, detail: 'Host resolves to a private IP address' };
    }
    // Skip to double-encoding check (step 8)
    return finalizeResult(parsed, directIPv4);
  }

  if (directIPv6 !== null) {
    // Step 7 (direct IPv6 path)
    if (isPrivateIPv6(directIPv6)) {
      return { ok: false, status: 422, detail: 'Host resolves to a private IP address' };
    }
    return finalizeResult(parsed, rawHostname);
  }

  // Step 6: DNS resolution
  let v4results = [];
  let v6results = [];
  let v4error = null;
  let v6error = null;

  const [v4, v6] = await Promise.all([
    resolve4(hostname).catch((e) => { v4error = e; return []; }),
    resolve6(hostname).catch((e) => { v6error = e; return []; }),
  ]);
  v4results = v4;
  v6results = v6;

  if ((v4results.length === 0 && v6results.length === 0) || (v4error && v6error)) {
    return { ok: false, status: 422, detail: 'Could not resolve hostname' };
  }

  const allIPs = [...v4results, ...v6results];
  if (allIPs.length === 0) {
    return { ok: false, status: 422, detail: 'Could not resolve hostname' };
  }

  // Step 7: IP classification -- check EVERY resolved address
  for (const ip of allIPs) {
    // SECURITY: Never include the actual IP in rejection messages (network topology leak)
    if (isPrivateIP(ip)) {
      return { ok: false, status: 422, detail: 'Host resolves to a private IP address' };
    }
  }

  // Prefer IPv4 for the returned informational IP
  const firstPublicIP = v4results.length > 0 ? v4results[0] : v6results[0];
  return finalizeResult(parsed, firstPublicIP);
}

/**
 * Performs the double-encoding check (step 8) and returns the success result.
 *
 * @param {URL} parsed
 * @param {string} ip The first public IP to include in the success result
 * @returns {{ ok: true, url: string, ip: string } | { ok: false, status: number, detail: string }}
 */
function finalizeResult(parsed, ip) {
  // Step 8: Double-encoding detection in both pathname AND query string
  // SECURITY: Attackers can smuggle double-encoded path traversal or injection
  // sequences (%2500 = double-encoded NUL, %252f = double-encoded slash) in
  // either the path or query. Check both. (CWE-116)
  const toCheck = parsed.pathname + (parsed.search || '');
  if (/%25[0-9a-fA-F]{2}/i.test(toCheck)) {
    return { ok: false, status: 422, detail: 'URL contains double-encoded characters' };
  }

  // Step 9: Return success
  // SECURITY: Return parsed.href (re-serialized by WHATWG URL), not raw input,
  // so downstream consumers receive exactly the validated form.
  // NOTE: Browser Rendering independently re-resolves DNS at render time --
  // the returned ip is informational only and subject to a TOCTOU race.
  return { ok: true, url: parsed.href, ip };
}
