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
