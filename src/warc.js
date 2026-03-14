/*
 * warc.js -- WARC/1.1 record construction
 *
 * Builds WARC records manually from capture artifacts (screenshot, HTML, headers).
 * Records are uncompressed (STORE mode) -- no gzip wrapping.
 *
 * Record order:
 *   1. warcinfo   (software metadata)
 *   2. resource   (rendered HTML)
 *   3. metadata   (HTTP headers, if present)
 *   4. resource   (screenshot PNG)
 *
 * Tests: test/warc.test.js
 */ // tva

import { toTimestamp14 } from './cdxj.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a WARC byte array from capture artifacts.
 *
 * @param {string} url Captured URL
 * @param {Date|string} captureDate ISO 8601 date string or Date object
 * @param {{ screenshot: Uint8Array, html: string, headers: object|null }} artifacts
 * @returns {Promise<{ warcBytes: Uint8Array, recordMeta: Array }>}
 */
export async function buildWarc(url, captureDate, artifacts) {
  const isoDate = typeof captureDate === 'string' ? captureDate : captureDate.toISOString();
  const ts14 = toTimestamp14(isoDate);
  const { screenshot, html, headers } = artifacts;

  const htmlBytes = enc.encode(html);
  const headersBytes = headers ? enc.encode(JSON.stringify(headers)) : null;

  const warcinfoId = `<urn:uuid:${crypto.randomUUID()}>`;
  const htmlRecordId = `<urn:uuid:${crypto.randomUUID()}>`;
  const headersRecordId = headersBytes ? `<urn:uuid:${crypto.randomUUID()}>` : null;
  const screenshotRecordId = `<urn:uuid:${crypto.randomUUID()}>`;

  const warcinfoBody = enc.encode('software: WRL/0.1\r\nformat: WARC/1.1\r\n');

  const chunks = [];
  const recordMeta = [];
  let offset = 0;

  // 1. warcinfo record (no target URI, not indexed in CDXJ)
  const warcinfoChunk = buildRecord({
    type: 'warcinfo',
    recordId: warcinfoId,
    date: isoDate,
    contentType: 'application/warc-fields',
    body: warcinfoBody,
  });
  chunks.push(warcinfoChunk);
  offset += warcinfoChunk.length;

  // 2. resource record: rendered HTML
  const htmlDigest = await sha256(htmlBytes);
  const htmlChunk = buildRecord({
    type: 'resource',
    recordId: htmlRecordId,
    targetUri: url,
    date: isoDate,
    contentType: 'text/html; charset=utf-8',
    body: htmlBytes,
  });
  const htmlOffset = offset;
  chunks.push(htmlChunk);
  offset += htmlChunk.length;
  recordMeta.push({
    url,
    offset: htmlOffset,
    length: htmlChunk.length,
    mime: 'text/html',
    digest: htmlDigest,
    type: 'resource',
    status: '200',
    ts14,
  });

  // 3. metadata record: HTTP headers (optional)
  if (headersBytes && headersRecordId) {
    const headersDigest = await sha256(headersBytes);
    const headersChunk = buildRecord({
      type: 'metadata',
      recordId: headersRecordId,
      targetUri: url,
      date: isoDate,
      contentType: 'application/json',
      body: headersBytes,
      refersTo: htmlRecordId,
    });
    const headersOffset = offset;
    chunks.push(headersChunk);
    offset += headersChunk.length;
    recordMeta.push({
      url,
      offset: headersOffset,
      length: headersChunk.length,
      mime: 'application/json',
      digest: headersDigest,
      type: 'metadata',
      status: '-',
      ts14,
    });
  }

  // 4. resource record: screenshot PNG
  const screenshotDigest = await sha256(screenshot);
  const screenshotUri = `urn:wrl:screenshot:${url}`;
  const screenshotChunk = buildRecord({
    type: 'resource',
    recordId: screenshotRecordId,
    targetUri: screenshotUri,
    date: isoDate,
    contentType: 'image/png',
    body: screenshot,
  });
  const screenshotOffset = offset;
  chunks.push(screenshotChunk);
  recordMeta.push({
    url: screenshotUri,
    offset: screenshotOffset,
    length: screenshotChunk.length,
    mime: 'image/png',
    digest: screenshotDigest,
    type: 'resource',
    status: '200',
    ts14,
  });

  // Concatenate all chunks into a single Uint8Array
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const warcBytes = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    warcBytes.set(chunk, pos);
    pos += chunk.length;
  }

  return { warcBytes, recordMeta };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a single WARC/1.1 record as a Uint8Array.
 *
 * @param {{ type: string, recordId: string, targetUri?: string, date: string,
 *           contentType: string, body: Uint8Array, refersTo?: string }} opts
 * @returns {Uint8Array}
 */
function buildRecord({ type, recordId, targetUri, date, contentType, body, refersTo }) {
  const headerLines = [
    'WARC/1.1',
    `WARC-Type: ${type}`,
    `WARC-Record-ID: ${recordId}`,
  ];
  if (targetUri) headerLines.push(`WARC-Target-URI: ${targetUri}`);
  headerLines.push(`WARC-Date: ${date}`);
  if (refersTo) headerLines.push(`WARC-Refers-To: ${refersTo}`);
  headerLines.push(`Content-Type: ${contentType}`);
  headerLines.push(`Content-Length: ${body.byteLength}`);

  const headerStr = headerLines.join('\r\n') + '\r\n\r\n';
  const headerBytes = enc.encode(headerStr);
  const trailer = enc.encode('\r\n\r\n');

  const record = new Uint8Array(headerBytes.length + body.length + trailer.length);
  record.set(headerBytes, 0);
  record.set(body, headerBytes.length);
  record.set(trailer, headerBytes.length + body.length);
  return record;
}

/**
 * Computes SHA-256 digest of payload bytes formatted as `sha256:{hex}`.
 *
 * @param {Uint8Array} data
 * @returns {Promise<string>}
 */
export async function sha256(data) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return 'sha256:' + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

