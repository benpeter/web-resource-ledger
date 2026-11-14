import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GET /health', () => {
  it('returns 200 with status ok and legal URLs', async () => {
    const response = await SELF.fetch('https://example.com/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({ status: 'ok' });
    expect(body.legal).toBeDefined();
    expect(body.legal.terms).toContain('TERMS.md');
    expect(body.legal.policy).toContain('CONTENT-POLICY.md');
    expect(body.build).toBeUndefined();
  });

  it('with trailing slash returns 200', async () => {
    const response = await SELF.fetch('https://example.com/health/');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
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

describe('HEAD /health', () => {
  // Link checkers and uptime monitors send HEAD, and it got a 404 on every route.
  it('answers like GET, without a body', async () => {
    const get = await SELF.fetch('https://example.com/health');
    await get.text();
    const head = await SELF.fetch('https://example.com/health', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Type')).toBe(get.headers.get('Content-Type'));
    expect(head.headers.get('Strict-Transport-Security')).toBe(get.headers.get('Strict-Transport-Security'));
    expect(await head.text()).toBe('');
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

describe('GET /health -- X-RateLimit headers', () => {
  it('does NOT return X-RateLimit-Limit (health endpoint is not rate-limited)', async () => {
    const response = await SELF.fetch('https://example.com/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
  });
});

describe('POST /v1/webhooks/coralogix (removed in phase 0110)', () => {
  it('returns 404 even with the old bearer secret and a valid alert payload', async () => {
    const response = await SELF.fetch('https://wrl.test/v1/webhooks/coralogix', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-coralogix-webhook-secret-for-vitest',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        alert_id: 'test-alert-removed',
        alert_name: '[WRL] Capture Failures',
        alert_action: 'triggered',
        application_name: 'wrl',
      }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/problem+json');
  });
});
