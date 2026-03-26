// tva
// Lightweight UI tests for the /admin HTML shell.
// Uses SELF.fetch() for HTTP integration tests and direct import for unit tests.
// Follows the same pattern as ui-dashboard.test.js.

import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { htmlAdminDashboard } from '../src/admin/admin-shell.js';

// ---------------------------------------------------------------------------
// htmlAdminDashboard() -- response headers
// ---------------------------------------------------------------------------

describe('htmlAdminDashboard -- response headers', () => {
  it('returns a Response with status 200', () => {
    const res = htmlAdminDashboard();
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
  });

  it('Content-Type is text/html;charset=UTF-8', () => {
    const res = htmlAdminDashboard();
    expect(res.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');
  });

  it('Cache-Control is no-store', () => {
    const res = htmlAdminDashboard();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('CSP includes frame-ancestors none', () => {
    const res = htmlAdminDashboard();
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('X-Frame-Options is DENY', () => {
    const res = htmlAdminDashboard();
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

// ---------------------------------------------------------------------------
// htmlAdminDashboard() -- HTML structure
// ---------------------------------------------------------------------------

describe('htmlAdminDashboard -- HTML structure', () => {
  it('contains <!DOCTYPE html>', async () => {
    const html = await htmlAdminDashboard().text();
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('contains <html lang="en">', async () => {
    const html = await htmlAdminDashboard().text();
    expect(html).toContain('<html lang="en">');
  });

  it('contains <div id="admin-app">', async () => {
    const html = await htmlAdminDashboard().text();
    expect(html).toContain('<div id="admin-app">');
  });

  it('contains <noscript> fallback', async () => {
    const html = await htmlAdminDashboard().text();
    expect(html).toContain('<noscript>');
    expect(html).toContain('JavaScript Required');
  });
});

// ---------------------------------------------------------------------------
// htmlAdminDashboard() -- no external resources
// ---------------------------------------------------------------------------

describe('htmlAdminDashboard -- no external resources', () => {
  it('does not contain <script src=', async () => {
    const html = await htmlAdminDashboard().text();
    expect(html).not.toContain('<script src=');
  });

  it('does not contain <link rel="stylesheet" href=', async () => {
    const html = await htmlAdminDashboard().text();
    expect(html).not.toContain('<link rel="stylesheet" href=');
  });
});

// ---------------------------------------------------------------------------
// GET /admin -- SELF.fetch() integration tests
// ---------------------------------------------------------------------------

describe('GET /admin', () => {
  it('returns 200', async () => {
    const res = await SELF.fetch('https://worker.test/admin');
    expect(res.status).toBe(200);
  });

  it('Content-Type is text/html;charset=UTF-8', async () => {
    const res = await SELF.fetch('https://worker.test/admin');
    expect(res.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');
  });

  it('Cache-Control is no-store', async () => {
    const res = await SELF.fetch('https://worker.test/admin');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('CSP header includes frame-ancestors none', async () => {
    const res = await SELF.fetch('https://worker.test/admin');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('X-Frame-Options is DENY', async () => {
    const res = await SELF.fetch('https://worker.test/admin');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('response body contains <div id="admin-app">', async () => {
    const res = await SELF.fetch('https://worker.test/admin');
    const html = await res.text();
    expect(html).toContain('<div id="admin-app">');
  });
});
