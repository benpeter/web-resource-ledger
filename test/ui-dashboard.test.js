// tva
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { htmlDashboard } from '../src/ui/ui-shell.js';
import { AUTH_JS } from '../src/ui/ui-auth.js';
import { SUBMIT_VIEW_JS } from '../src/ui/ui-submit.js';
import { DETAIL_VIEW_JS } from '../src/ui/ui-detail.js';
import { POLL_JS } from '../src/ui/ui-poll.js';
import { DESIGN_SYSTEM_CSS } from '../src/design-system.js';
import { UI_CSS } from '../src/ui/ui-css.js';

// ---------------------------------------------------------------------------
// htmlDashboard() -- response headers
// ---------------------------------------------------------------------------

describe('htmlDashboard -- response headers', () => {
  it('returns a Response with status 200', () => {
    const res = htmlDashboard();
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
  });

  it('Content-Type is text/html;charset=UTF-8', () => {
    const res = htmlDashboard();
    expect(res.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');
  });

  it('Cache-Control is no-store', () => {
    const res = htmlDashboard();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('CSP header is an exact match', () => {
    const res = htmlDashboard();
    const expected = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    expect(res.headers.get('Content-Security-Policy')).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// htmlDashboard() -- HTML structure
// ---------------------------------------------------------------------------

describe('htmlDashboard -- HTML structure', () => {
  it('contains <!DOCTYPE html>', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('contains <html lang="en">', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('<html lang="en">');
  });

  it('contains viewport meta tag', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('name="viewport"');
  });

  it('contains <div id="app">', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('<div id="app">');
  });

  it('contains <noscript> fallback', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('<noscript>');
    expect(html).toContain('JavaScript Required');
  });
});

// ---------------------------------------------------------------------------
// htmlDashboard() -- design system tokens
// ---------------------------------------------------------------------------

describe('htmlDashboard -- design system tokens', () => {
  it('includes --color-text token definition', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('--color-text:');
  });

  it('includes --color-primary token definition', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('--color-primary:');
  });

  it('includes --font-sans token definition', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('--font-sans:');
  });

  it('includes --space-4 token definition', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('--space-4:');
  });

  it('includes --radius-md token definition', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('--radius-md:');
  });
});

// ---------------------------------------------------------------------------
// htmlDashboard() -- no external resources
// ---------------------------------------------------------------------------

describe('htmlDashboard -- no external resources', () => {
  it('does not contain <script src=', async () => {
    const html = await htmlDashboard().text();
    expect(html).not.toContain('<script src=');
  });

  it('does not contain <link rel="stylesheet" href=', async () => {
    const html = await htmlDashboard().text();
    expect(html).not.toContain('<link rel="stylesheet" href=');
  });
});

// ---------------------------------------------------------------------------
// htmlDashboard() -- auth gate markup
// ---------------------------------------------------------------------------

describe('htmlDashboard -- auth gate markup', () => {
  it('contains renderAuthGate function', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('renderAuthGate');
  });

  it('contains auth-key-input (password input)', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('auth-key-input');
  });

  it('contains Connect button text', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain("'Connect'");
  });
});

// ---------------------------------------------------------------------------
// htmlDashboard() -- view function markers
// ---------------------------------------------------------------------------

describe('htmlDashboard -- view function markers', () => {
  it('contains renderCaptures function', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('function renderCaptures');
  });

  it('contains mountCaptures function', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('function mountCaptures');
  });

  it('contains renderDetail function', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('function renderDetail');
  });

  it('contains mountDetail function', async () => {
    const html = await htmlDashboard().text();
    expect(html).toContain('function mountDetail');
  });
});

// ---------------------------------------------------------------------------
// Security -- no innerHTML with variable data
// ---------------------------------------------------------------------------

describe('security -- innerHTML usage', () => {
  // Extract all innerHTML assignment RHS expressions from a JS string.
  // Matches:  someEl.innerHTML = <rhs>;
  function innerHtmlAssignments(source) {
    const matches = [];
    const re = /\.innerHTML\s*=\s*([^;]+)/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      matches.push(m[1].trim());
    }
    return matches;
  }

  it('AUTH_JS: innerHTML only assigned the empty string', () => {
    const assignments = innerHtmlAssignments(AUTH_JS);
    for (const rhs of assignments) {
      expect(rhs, `innerHTML assignment "${rhs}" uses variable data`).toMatch(/^(?:''|"")$/);
    }
  });

  it('SUBMIT_VIEW_JS: innerHTML only assigned the empty string', () => {
    const assignments = innerHtmlAssignments(SUBMIT_VIEW_JS);
    for (const rhs of assignments) {
      expect(rhs, `innerHTML assignment "${rhs}" uses variable data`).toMatch(/^(?:''|"")$/);
    }
  });

  it('DETAIL_VIEW_JS: innerHTML only assigned the empty string', () => {
    const assignments = innerHtmlAssignments(DETAIL_VIEW_JS);
    for (const rhs of assignments) {
      expect(rhs, `innerHTML assignment "${rhs}" uses variable data`).toMatch(/^(?:''|"")$/);
    }
  });

  it('POLL_JS: does not use innerHTML at all', () => {
    expect(POLL_JS).not.toContain('innerHTML');
  });
});

// ---------------------------------------------------------------------------
// Polling module guards (via POLL_JS exported string)
// ---------------------------------------------------------------------------

describe('ui-poll.js -- polling guards', () => {
  it('uses setTimeout for scheduling polls', () => {
    expect(POLL_JS).toContain('setTimeout');
  });

  it('does not use setInterval for the poll loop', () => {
    expect(POLL_JS).not.toContain('setInterval');
  });

  it('references Retry-After header', () => {
    expect(POLL_JS).toContain('Retry-After');
  });

  it('references visibilityState for tab visibility pausing', () => {
    expect(POLL_JS).toContain('visibilityState');
  });

  it('defines a 120000ms (120-second) timeout constant', () => {
    expect(POLL_JS).toContain('120000');
  });
});

// ---------------------------------------------------------------------------
// GET /ui route -- SELF.fetch() integration tests
// ---------------------------------------------------------------------------

describe('GET /ui', () => {
  it('returns 200', async () => {
    const res = await SELF.fetch('https://worker.test/ui');
    expect(res.status).toBe(200);
  });

  it('Content-Type is text/html;charset=UTF-8', async () => {
    const res = await SELF.fetch('https://worker.test/ui');
    expect(res.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');
  });

  it('Cache-Control is no-store', async () => {
    const res = await SELF.fetch('https://worker.test/ui');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('CSP header is exact', async () => {
    const res = await SELF.fetch('https://worker.test/ui');
    const expected = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    expect(res.headers.get('Content-Security-Policy')).toBe(expected);
  });

  it('response body is HTML', async () => {
    const res = await SELF.fetch('https://worker.test/ui');
    const html = await res.text();
    expect(html).toContain('<!DOCTYPE html>');
  });
});

// ---------------------------------------------------------------------------
// Non-GET methods on /ui
// ---------------------------------------------------------------------------

describe('POST /ui and other methods', () => {
  it('POST /ui does not return 200', async () => {
    const res = await SELF.fetch('https://worker.test/ui', { method: 'POST' });
    // The router should not serve the dashboard for non-GET requests.
    expect(res.status).not.toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Regression: Fix A -- design token sync (#211)
// ---------------------------------------------------------------------------

describe('design system -- color-text-muted token sync', () => {
  it('DESIGN_SYSTEM_CSS contains #595550 for --color-text-muted', () => {
    expect(DESIGN_SYSTEM_CSS).toContain('--color-text-muted: #595550');
  });

  it('UI_CSS does not hardcode the old muted value #6e6a66', () => {
    expect(UI_CSS).not.toContain('#6e6a66');
  });

  it('DESIGN_SYSTEM_CSS and AUTH_JS agree on --color-text-muted value', () => {
    // Both the CSS file and the JS export must contain the same token value.
    expect(DESIGN_SYSTEM_CSS).toContain('#595550');
    expect(AUTH_JS).not.toContain('#6e6a66');
  });
});

// ---------------------------------------------------------------------------
// Regression: Fix C -- docs link in nav (#210)
// ---------------------------------------------------------------------------

describe('AUTH_JS -- docs link in nav', () => {
  it('contains docs.webresourceledger.com', () => {
    expect(AUTH_JS).toContain('docs.webresourceledger.com');
  });

  it('contains screen reader text "(opens in new tab)"', () => {
    expect(AUTH_JS).toContain('(opens in new tab)');
  });

  it('uses nav-link--external class', () => {
    expect(AUTH_JS).toContain('nav-link--external');
  });

  it('UI_CSS contains .nav-link--external rule', () => {
    expect(UI_CSS).toContain('.nav-link--external');
  });

  it('UI_CSS contains .sr-only utility class', () => {
    expect(UI_CSS).toContain('.sr-only');
  });
});
