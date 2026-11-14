// tva
// Coralogix severities: 1 debug, 2 verbose, 3 info, 4 warning, 5 error, 6 critical.
// Telemetry such as capture.list was sent as 6 and showed up as Critical.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { cleanDb, seedApiKey } from './fixtures.js';

beforeEach(async () => {
  await cleanDb(env.DB);
});

describe('log severities', () => {
  it('logs capture.list as verbose (2), not critical (6)', async () => {
    const rawKey = 'wrl_live_' + 's'.repeat(43);
    await seedApiKey(env.DB, rawKey, { tenantId: 'severity-tenant' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    try {
      const testEnv = {
        ...env,
        CORALOGIX_ENDPOINT: 'https://ingress.test.coralogix.com/logs/v1/singles',
        CORALOGIX_SEND_KEY: 'test-send-key',
      };
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request('https://worker.test/v1/captures', {
        headers: { Authorization: `Bearer ${rawKey}`, 'CF-Connecting-IP': '10.9.9.9' },
      }), testEnv, ctx);
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(200);
      const entries = fetchSpy.mock.calls
        .filter(([url]) => String(url).includes('coralogix'))
        .map(([, init]) => JSON.parse(init.body)[0]);
      const listEntry = entries.find((e) => JSON.parse(e.text).event === 'capture.list');
      expect(listEntry, 'a capture.list log entry').toBeTruthy();
      expect(listEntry.severity).toBe(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
