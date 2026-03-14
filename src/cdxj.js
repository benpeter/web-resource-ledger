/*
 * cdxj.js -- CDXJ index generation
 *
 * Builds a sorted CDXJ index from WARC record metadata.
 * Skips warcinfo records (no target URI).
 *
 * CDXJ line format:
 *   <SURT-URL> <14-digit-timestamp> <JSON-block>
 *
 * Tests: test/cdxj.test.js
 */ // tva

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a CDXJ index string from WARC record metadata.
 * Each entry in recordMeta must include a `ts14` field (14-digit timestamp).
 *
 * @param {Array<{ url: string, offset: number, length: number, mime: string,
 *                 digest: string, type: string, status: string, ts14: string }>} recordMeta
 * @param {string} filename WARC filename path (e.g. 'archive/data.warc')
 * @returns {string}
 */
export function buildCdxj(recordMeta, filename) {
  const lines = [];

  for (const record of recordMeta) {
    // Skip warcinfo records (no indexable target URI)
    if (record.type === 'warcinfo') continue;

    const surt = toSurt(record.url);
    const block = JSON.stringify({
      url: record.url,
      mime: record.mime,
      status: record.status,
      digest: record.digest,
      offset: record.offset,
      length: record.length,
      filename,
    });

    lines.push({ surt, line: `${surt} ${record.ts14} ${block}` });
  }

  // Sort lexicographically by SURT key
  lines.sort((a, b) => a.surt < b.surt ? -1 : a.surt > b.surt ? 1 : 0);

  return lines.map(l => l.line).join('\n') + (lines.length ? '\n' : '');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts a URL to SURT (Sort-friendly URI Reordering Transform) format.
 * https://example.com/path?q=1 -> com,example)/path?q=1
 *
 * @param {string} url
 * @returns {string}
 */
export function toSurt(url) {
  // Handle urn: URIs -- pass through as-is (no hostname to reverse)
  if (url.startsWith('urn:')) return url;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname; // e.g. www.example.com
    const parts = hostname.split('.').reverse(); // e.g. ['com', 'example', 'www']
    const surtHost = parts.join(','); // e.g. com,example,www
    const pathAndQuery = parsed.pathname + (parsed.search || '') + (parsed.hash || '');
    return `${surtHost})${pathAndQuery}`;
  } catch {
    // Fallback: return URL as-is if parsing fails
    return url;
  }
}

/**
 * Converts an ISO 8601 date string to 14-digit CDXJ timestamp (YYYYMMDDHHmmss).
 *
 * @param {string} isoDate
 * @returns {string}
 */
export function toTimestamp14(isoDate) {
  const d = new Date(isoDate);
  const pad = n => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}
