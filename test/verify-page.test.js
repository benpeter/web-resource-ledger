import { describe, it, expect } from 'vitest';
import { htmlVerifyResponse, escapeHtml } from '../src/verify-page.js';

const TEST_ID       = 'cap_' + 'f'.repeat(32);
const TEST_ORIGIN   = 'https://worker.test';
const TEST_CC       = 'public, max-age=86400, stale-while-revalidate=604800';

// ---------------------------------------------------------------------------
// htmlVerifyResponse -- response headers
// ---------------------------------------------------------------------------

describe('htmlVerifyResponse -- response headers', () => {
  it('returns a Response with status 200', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
  });

  it('Content-Type is text/html; charset=utf-8', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });

  it('Cache-Control matches the provided parameter', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    expect(res.headers.get('Cache-Control')).toBe(TEST_CC);
  });

  it('CSP header is present with default-src \'none\'', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'none'");
  });

  it('X-Frame-Options: DENY is present', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('Vary: Accept is present', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    expect(res.headers.get('Vary')).toBe('Accept');
  });
});

// ---------------------------------------------------------------------------
// htmlVerifyResponse -- HTML content
// ---------------------------------------------------------------------------

describe('htmlVerifyResponse -- HTML content', () => {
  it('contains <!DOCTYPE html> and <html lang="en">', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
  });

  it('contains the capture ID in the noscript block', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    const noscriptStart = html.indexOf('<noscript>');
    const noscriptEnd   = html.indexOf('</noscript>');
    expect(noscriptStart).toBeGreaterThan(-1);
    const noscript = html.slice(noscriptStart, noscriptEnd);
    expect(noscript).toContain(TEST_ID);
  });

  it('contains a link to the JSON API endpoint in noscript: /v1/verify/{captureId}', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    const noscriptStart = html.indexOf('<noscript>');
    const noscriptEnd   = html.indexOf('</noscript>');
    const noscript = html.slice(noscriptStart, noscriptEnd);
    expect(noscript).toContain(`/v1/verify/${TEST_ID}`);
  });

  it('contains a <noscript> tag', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    expect(html).toContain('<noscript>');
  });

  it('contains the API fetch URL pattern with the captureId', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    expect(html).toContain(`/v1/verify/${TEST_ID}`);
  });

  it('contains inline <style> and <script> tags (no external resources)', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
  });

  it('does NOT contain <link rel="stylesheet" or <script src="', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).not.toContain('<script src="');
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes < to &lt;', () => {
    expect(escapeHtml('<')).toBe('&lt;');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('>')).toBe('&gt;');
  });

  it('escapes & to &amp;', () => {
    expect(escapeHtml('&')).toBe('&amp;');
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('"')).toBe('&quot;');
  });

  it("escapes ' to &#x27;", () => {
    expect(escapeHtml("'")).toBe('&#x27;');
  });

  it('returns empty string for non-string input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('');
    expect(escapeHtml({})).toBe('');
  });

  it('returns the same string if no special characters', () => {
    const plain = 'Hello world 123';
    expect(escapeHtml(plain)).toBe(plain);
  });
});

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

describe('security', () => {
  it('the capture ID in the HTML is HTML-escaped in noscript', async () => {
    const maliciousId = 'cap_<script>alert(1)</script>aaaaaaaaaaaaaaa';
    const res = htmlVerifyResponse(maliciousId, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    const noscriptStart = html.indexOf('<noscript>');
    const noscriptEnd   = html.indexOf('</noscript>');
    const noscript = html.slice(noscriptStart, noscriptEnd);
    expect(noscript).not.toContain('<script>alert(1)</script>');
    expect(noscript).toContain('&lt;script&gt;');
  });

  it('the origin in the noscript block is HTML-escaped', async () => {
    const maliciousOrigin = 'https://evil.test"><img src=x onerror=alert(1)>';
    const res = htmlVerifyResponse(TEST_ID, maliciousOrigin, TEST_CC);
    const html = await res.text();
    const noscriptStart = html.indexOf('<noscript>');
    const noscriptEnd   = html.indexOf('</noscript>');
    const noscript = html.slice(noscriptStart, noscriptEnd);
    expect(noscript).not.toContain('<img src=x');
    expect(noscript).toContain('&gt;');
  });

  it('HTML template contains URL scheme validation (http: and https: checks)', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    expect(html).toContain('http:');
    expect(html).toContain('https:');
  });

  it('HTML template sets Accept: application/json on the fetch call', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    expect(html).toContain('application/json');
  });
});
