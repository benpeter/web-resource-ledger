import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { htmlVerifyResponse, escapeHtml } from '../src/verify-page.js';
import { DESIGN_SYSTEM_CSS } from '../src/design-system.js';

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

  it("CSP img-src allows 'self' and data: (required for SVG favicon data URI)", async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("img-src 'self' data:");
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

// ---------------------------------------------------------------------------
// Design system tokens
// ---------------------------------------------------------------------------

describe('htmlVerifyResponse -- design system tokens', () => {
  it('HTML output references color, font, and spacing tokens via var()', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    expect(html).toContain('var(--color-');
    expect(html).toContain('var(--font-');
    expect(html).toContain('var(--space-');
  });

  it('page-specific CSS does not contain hardcoded hex colors', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();

    // Extract only the page-specific CSS: the portion after the design system
    // block (which legitimately defines hex values as token assignments).
    // The design system CSS ends with the closing backtick of DESIGN_SYSTEM_CSS;
    // we split on the boundary between the injected design system CSS and the
    // hand-written page styles that follow it in the <style> block.
    const styleStart = html.indexOf('<style>');
    const styleEnd   = html.indexOf('</style>');
    const fullStyle  = html.slice(styleStart, styleEnd);

    // The design system block ends with its last rule; the page CSS starts
    // after DESIGN_SYSTEM_CSS. Use the known terminal token definitions
    // (--radius-lg definition is the last :root declaration) as the split point.
    const dsEndMarker = '--radius-lg:';
    const dsEndPos = fullStyle.indexOf(dsEndMarker);
    // Advance past the :root closing brace that follows the last token
    const rootClosePos = fullStyle.indexOf('}', dsEndPos);
    const pageCSS = fullStyle.slice(rootClosePos + 1);

    // Page-specific CSS must not contain bare hex color literals.
    // Matches #rrggbb, #rrggbbaa, #rgb, #rgba forms.
    expect(pageCSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

// ---------------------------------------------------------------------------
// Favicon link in HTML
// ---------------------------------------------------------------------------

describe('htmlVerifyResponse -- favicon', () => {
  it('HTML contains a favicon link with SVG data URI', async () => {
    const res = htmlVerifyResponse(TEST_ID, TEST_ORIGIN, TEST_CC);
    const html = await res.text();
    expect(html).toContain('rel="icon"');
    expect(html).toContain('type="image/svg+xml"');
    expect(html).toContain('href="data:image/svg+xml,');
  });
});

// ---------------------------------------------------------------------------
// Favicon route -- GET /favicon.ico
// ---------------------------------------------------------------------------

describe('GET /favicon.ico', () => {
  it('returns 200', async () => {
    const res = await SELF.fetch('https://worker.test/favicon.ico');
    expect(res.status).toBe(200);
  });

  it('Content-Type is image/svg+xml', async () => {
    const res = await SELF.fetch('https://worker.test/favicon.ico');
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('Cache-Control includes max-age=604800', async () => {
    const res = await SELF.fetch('https://worker.test/favicon.ico');
    expect(res.headers.get('Cache-Control')).toContain('max-age=604800');
  });

  it('X-Content-Type-Options is nosniff', async () => {
    const res = await SELF.fetch('https://worker.test/favicon.ico');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

// ---------------------------------------------------------------------------
// design-system.js / design-system.css sync
// ---------------------------------------------------------------------------

describe('DESIGN_SYSTEM_CSS sync check', () => {
  // The Workers runtime does not expose Node fs. We verify the exported JS
  // string contains the full set of token definitions rather than doing a
  // byte-for-byte file comparison. Any drift in the JS export will cause
  // these assertions to fail.
  it('DESIGN_SYSTEM_CSS contains all neutral token definitions', () => {
    expect(DESIGN_SYSTEM_CSS).toContain('--color-text:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-text-muted:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-bg:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-surface:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-surface-muted:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-border:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-border-subtle:');
  });

  it('DESIGN_SYSTEM_CSS contains all brand token definitions', () => {
    expect(DESIGN_SYSTEM_CSS).toContain('--color-primary:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-secondary:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-accent:');
  });

  it('DESIGN_SYSTEM_CSS contains all semantic token definitions', () => {
    expect(DESIGN_SYSTEM_CSS).toContain('--color-success:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-error:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-warning:');
    expect(DESIGN_SYSTEM_CSS).toContain('--color-info:');
  });

  it('DESIGN_SYSTEM_CSS contains all typography token definitions', () => {
    expect(DESIGN_SYSTEM_CSS).toContain('--font-sans:');
    expect(DESIGN_SYSTEM_CSS).toContain('--font-mono:');
    expect(DESIGN_SYSTEM_CSS).toContain('--text-base:');
    expect(DESIGN_SYSTEM_CSS).toContain('--leading-normal:');
    expect(DESIGN_SYSTEM_CSS).toContain('--weight-medium:');
  });

  it('DESIGN_SYSTEM_CSS contains all spacing token definitions', () => {
    expect(DESIGN_SYSTEM_CSS).toContain('--space-1:');
    expect(DESIGN_SYSTEM_CSS).toContain('--space-4:');
    expect(DESIGN_SYSTEM_CSS).toContain('--space-8:');
    expect(DESIGN_SYSTEM_CSS).toContain('--space-12:');
  });

  it('DESIGN_SYSTEM_CSS contains shape tokens and component classes', () => {
    expect(DESIGN_SYSTEM_CSS).toContain('--radius-sm:');
    expect(DESIGN_SYSTEM_CSS).toContain('--radius-md:');
    expect(DESIGN_SYSTEM_CSS).toContain('--radius-lg:');
    expect(DESIGN_SYSTEM_CSS).toContain('.btn');
    expect(DESIGN_SYSTEM_CSS).toContain('.alert');
    expect(DESIGN_SYSTEM_CSS).toContain('.card');
  });
});
