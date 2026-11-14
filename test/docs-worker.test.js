/**
 * Docs site Worker (site/src/index.js): a failed static asset fetch is logged,
 * and /.well-known/security.txt redirects to the landing site.
 */
import { describe, it, expect, vi } from 'vitest';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import docs from '../site/src/index.js';

describe('docs Worker -- static asset failure', () => {
  it('answers 500 and logs the error when the assets binding throws', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    try {
      const env = {
        CORALOGIX_ENDPOINT: 'https://ingress.test.coralogix.com/logs/v1/singles',
        CORALOGIX_SEND_KEY: 'test-send-key',
        ASSETS: { fetch: async () => { throw new Error('assets unavailable'); } },
      };
      const ctx = createExecutionContext();
      const res = await docs.fetch(new Request('https://docs.webresourceledger.com/mcp/'), env, ctx);
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(500);
      const logCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('coralogix'));
      expect(logCall, 'a Coralogix log request').toBeTruthy();
      const [entry] = JSON.parse(logCall[1].body);
      expect(entry.severity).toBe(5);
      expect(JSON.parse(entry.text)).toMatchObject({
        event: 'docs.assets_fail',
        path: '/mcp/',
        errorMessage: 'assets unavailable',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('docs Worker -- security.txt', () => {
  it('redirects /.well-known/security.txt to the landing site without reading the assets', async () => {
    const env = { ASSETS: { fetch: async () => { throw new Error('assets must not be read'); } } };
    const ctx = createExecutionContext();
    const res = await docs.fetch(new Request('https://docs.webresourceledger.com/.well-known/security.txt'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://webresourceledger.com/.well-known/security.txt');
  });
});
