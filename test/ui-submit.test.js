// Unit tests for ui-submit.js -- safeUrl() URL normalization.
// Tests extract the safeUrl function from the SUBMIT_VIEW_JS string constant
// via the evalFromSource pattern. No DOM, no fetch, no document.

import { describe, it, expect } from 'vitest';
import { SUBMIT_VIEW_JS } from '../src/ui/ui-submit.js';

// ---------------------------------------------------------------------------
// evalFromSource -- extract and return a named function from a JS source string
// ---------------------------------------------------------------------------

function evalFromSource(source, functionName) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(source + '\nreturn ' + functionName + ';');
  return fn();
}

const safeUrl = evalFromSource(SUBMIT_VIEW_JS, 'safeUrl');

// ---------------------------------------------------------------------------
// Partition A -- safeUrl URL normalization
// ---------------------------------------------------------------------------

describe('safeUrl -- URL normalization', () => {
  it('A1: full https URL is returned with trailing slash unchanged', () => {
    expect(safeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('A2: full http URL is returned with trailing slash unchanged', () => {
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('A3: bare hostname gets https prepended and trailing slash added', () => {
    expect(safeUrl('example.com')).toBe('https://example.com/');
  });

  it('A4: bare hostname with path and query string gets https prepended', () => {
    expect(safeUrl('example.com/page?q=1')).toBe('https://example.com/page?q=1');
  });

  it('A5: URL with unrecognized scheme ("htt://") returns null -- has "://" so prepend is skipped', () => {
    expect(safeUrl('htt://example.com')).toBeNull();
  });

  it('A6: ftp:// URL returns null -- wrong scheme', () => {
    expect(safeUrl('ftp://example.com')).toBeNull();
  });

  it('A7: javascript: URL returns null -- dangerous scheme', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
  });

  it('A8: empty string returns null', () => {
    expect(safeUrl('')).toBeNull();
  });

  it('A9: gibberish with spaces returns null -- URL constructor rejects even after https prepend', () => {
    expect(safeUrl('not a url at all')).toBeNull();
  });

  it('A10: protocol-relative URL ("//example.com") gets https prepended -- no "://" present', () => {
    expect(safeUrl('//example.com')).toBe('https://example.com/');
  });

  it('A11: "example.com:8080" returns null -- URL constructor parses scheme as "example.com:" without throwing, so prepend path is never reached', () => {
    // new URL('example.com:8080') succeeds but yields protocol 'example.com:',
    // which is not http: or https:. The catch block is not entered, so the
    // prepend path is skipped and the function returns null.
    expect(safeUrl('example.com:8080')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// submit_quotaMessage -- text shown when a capture is refused with a quota 429
// ---------------------------------------------------------------------------

describe('submit_quotaMessage', () => {
  const submit_quotaMessage = (data) => evalFromSource(SUBMIT_VIEW_JS, 'submit_quotaMessage')(data);
  const resetsAt = '2026-11-01T00:00:00.000Z';
  const resetDate = new Date(resetsAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  it('names the storage limit and tells a free tenant to add a payment method', () => {
    const msg = submit_quotaMessage({
      limitType: 'quota',
      detail: `Storage quota reached (10.0 GB of 10.0 GB). Add a payment method to continue capturing. Resets ${resetsAt}.`,
      quota: { resource: 'storage', limit: 10737418240, used: 10737418240, resetsAt },
    });
    expect(msg).toContain('Monthly storage limit reached');
    expect(msg).not.toContain('capture limit');
    expect(msg).toContain('Add a payment method in Settings');
  });

  it('tells a free tenant at the capture limit to add a payment method', () => {
    const msg = submit_quotaMessage({
      limitType: 'quota',
      detail: `Free tier limit reached (200/200). Add a payment method to continue capturing. Resets ${resetsAt}.`,
      quota: { resource: 'captures', limit: 200, used: 200, resetsAt },
    });
    expect(msg).toContain('Monthly capture limit reached');
    expect(msg).toContain('Add a payment method in Settings');
  });

  it('reads the reset date from quota.resetsAt', () => {
    const msg = submit_quotaMessage({
      limitType: 'quota',
      detail: `Free tier limit reached (200/200). Add a payment method to continue capturing. Resets ${resetsAt}.`,
      quota: { resource: 'captures', limit: 200, used: 200, resetsAt },
    });
    expect(msg).toContain(resetDate);
  });

  it('points a tenant with a payment method to Settings without asking for one', () => {
    const msg = submit_quotaMessage({
      limitType: 'quota',
      detail: `Monthly capture quota reached (5/5). Resets ${resetsAt}. View usage in Settings.`,
      quota: { resource: 'captures', limit: 5, used: 5, resetsAt },
    });
    expect(msg).toContain('View usage in Settings');
    expect(msg).not.toContain('Add a payment method');
  });
});


// ---------------------------------------------------------------------------
// Bulk capture helpers (phase 0130)
// ---------------------------------------------------------------------------

describe('bulk_parseList -- pasted URL list', () => {
  const bulk_parseList = (text) => evalFromSource(SUBMIT_VIEW_JS, 'bulk_parseList')(text);

  it('normalises each line, drops blanks and duplicates', () => {
    const r = bulk_parseList('https://example.com/a\n\nexample.com/b\nhttps://example.com/a\n  https://example.com/c  ');
    expect(r.urls).toEqual(['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
    expect(r.invalid).toEqual([]);
    expect(r.capped).toBe(false);
  });

  it('reports lines that are not URLs', () => {
    const r = bulk_parseList('https://example.com/a\nnot a url\nftp://example.com/x');
    expect(r.urls).toEqual(['https://example.com/a']);
    expect(r.invalid).toEqual(['not a url', 'ftp://example.com/x']);
  });

  it('keeps at most 200 URLs', () => {
    const text = Array.from({ length: 250 }, (_, i) => `https://example.com/p${i}`).join('\n');
    const r = bulk_parseList(text);
    expect(r.urls).toHaveLength(200);
    expect(r.capped).toBe(true);
  });
});

describe('bulk_nextStep -- pacing batches by the rate-limit headers', () => {
  const bulk_nextStep = (headers) => evalFromSource(SUBMIT_VIEW_JS, 'bulk_nextStep')(headers);
  const h = (obj) => ({ get: (name) => (name in obj ? String(obj[name]) : null) });

  it('sends the next batch at once while the minute has room', () => {
    expect(bulk_nextStep(h({ 'X-RateLimit-Limit': 10, 'X-RateLimit-Remaining': 4, 'X-RateLimit-Reset': 30 })))
      .toEqual({ chunk: 4, waitSeconds: 0 });
  });

  it('waits for the reset when the minute is used up, then sends a full batch', () => {
    expect(bulk_nextStep(h({ 'X-RateLimit-Limit': 10, 'X-RateLimit-Remaining': 0, 'X-RateLimit-Reset': 42 })))
      .toEqual({ chunk: 10, waitSeconds: 42 });
  });

  it('never sends more than 20, the batch maximum', () => {
    expect(bulk_nextStep(h({ 'X-RateLimit-Limit': 50, 'X-RateLimit-Remaining': 50, 'X-RateLimit-Reset': 60 })))
      .toEqual({ chunk: 20, waitSeconds: 0 });
  });

  it('falls back to 10 a minute when the headers are missing', () => {
    expect(bulk_nextStep(h({}))).toEqual({ chunk: 10, waitSeconds: 0 });
  });
});
