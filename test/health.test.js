import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GET /health', () => {
  it('returns 200 with status ok and legal URLs', async () => {
    const response = await SELF.fetch('https://example.com/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = await response.json();
    expect(body).toMatchObject({ status: 'ok' });
    expect(body.legal).toBeDefined();
    expect(body.legal.terms).toContain('TERMS.md');
    expect(body.legal.policy).toContain('CONTENT-POLICY.md');
  });

  it('with trailing slash returns 200', async () => {
    const response = await SELF.fetch('https://example.com/health/');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = await response.json();
    expect(body).toMatchObject({ status: 'ok' });
  });

  it('POST returns 404', async () => {
    // Intentionally 404 (not 405): method dispatch is out of scope for Step 1.
    // This tests the fallback dispatcher behavior when no route matches.
    const response = await SELF.fetch('https://example.com/health', { method: 'POST' });
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/problem+json');
    const body = await response.json();
    expect(body).toHaveProperty('type');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('detail');
  });
});

describe('GET /nonexistent', () => {
  it('returns 404 with RFC 9457 problem shape', async () => {
    const response = await SELF.fetch('https://example.com/nonexistent');
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/problem+json');
    const body = await response.json();
    expect(body).toHaveProperty('type');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('detail');
  });
});
