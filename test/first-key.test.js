// Tests for the first API key shown after signup (phase 0114): how long it is
// kept, what a missing key tells the user, and the events that measure both.
import { env, SELF, fetchMock, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { cleanDb, createTestSession } from './fixtures.js';
import { handleAuthCallback, handleFirstKey, FIRST_KEY_TTL_SECONDS } from '../src/oauth.js';
import { WELCOME_JS } from '../src/ui/ui-welcome.js';

const UA = 'Mozilla/5.0 (Macintosh) FirstKeyTest';

beforeEach(async () => {
  await cleanDb(env.DB);
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  // Every expected Pirsch call must have happened, and nothing else was sent
  // (net connect is disabled, so an unexpected call finds no interceptor).
  fetchMock.assertNoPendingInterceptors();
  fetchMock.deactivate();
});

// Expect `count` Pirsch events; returns the array their bodies land in.
function pirschEvents(count) {
  const events = [];
  fetchMock.get('https://api.pirsch.io')
    .intercept({ path: '/api/v1/event', method: 'POST' })
    .reply(200, (req) => { events.push(JSON.parse(req.body)); return 'ok'; })
    .times(count);
  return events;
}

function getFirstKey(cookie) {
  return SELF.fetch('https://wrl.test/v1/account/first-key', {
    headers: { Cookie: cookie, 'User-Agent': UA, 'CF-Connecting-IP': '198.51.100.20' },
  });
}

describe('first key retention', () => {
  it('keeps the first key for 24 hours', () => {
    expect(FIRST_KEY_TTL_SECONDS).toBe(24 * 60 * 60);
  });

  it('stores the new user\'s first key with that retention', async () => {
    const githubFetch = async (url) => {
      const u = String(url);
      if (u.includes('login/oauth/access_token')) {
        return Response.json({ access_token: 'ghs_test', token_type: 'bearer' });
      }
      if (u.includes('api.github.com/user/emails')) return Response.json([]);
      if (u.includes('api.github.com/user')) return Response.json({ id: 88901, login: 'firstkeyuser' });
      throw new Error(`unexpected URL ${u}`);
    };
    const state = randomBytes(32).toString('hex');
    await env.KV.put(`oauth_state:${state}`, JSON.stringify({
      codeVerifier: randomBytes(64).toString('hex'), createdAt: new Date().toISOString(),
    }), { expirationTtl: 600 });

    const puts = [];
    const kv = {
      get: (...a) => env.KV.get(...a),
      delete: (...a) => env.KV.delete(...a),
      put: (key, value, opts) => { puts.push({ key, opts }); return env.KV.put(key, value, opts); },
    };
    const ctx = createExecutionContext();
    const res = await handleAuthCallback(
      new Request(`https://wrl.test/auth/callback?code=c&state=${state}`, { headers: { 'CF-Connecting-IP': '10.0.0.1' } }),
      { ...env, KV: kv, _githubFetch: githubFetch, PIRSCH_ACCESS_KEY: undefined },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(302);
    const firstKeyPut = puts.find((p) => p.key === 'first_key:gh-88901');
    expect(firstKeyPut).toBeDefined();
    expect(firstKeyPut.opts.expirationTtl).toBe(FIRST_KEY_TTL_SECONDS);
  });
});

describe('GET /v1/account/first-key', () => {
  it('returns the key once, then 404', async () => {
    pirschEvents(2);
    const { cookie, tenantId } = await createTestSession(env.DB, env, { githubId: 88902 });
    await env.KV.put(`first_key:${tenantId}`, 'wrl_live_testkey');

    const first = await getFirstKey(cookie);
    expect(first.status).toBe(200);
    expect((await first.json()).key).toBe('wrl_live_testkey');

    const second = await getFirstKey(cookie);
    expect(second.status).toBe(404);
  });

  it('says the key is kept for 24 hours and shown once when it is gone', async () => {
    pirschEvents(1);
    const { cookie } = await createTestSession(env.DB, env, { githubId: 88903 });
    const res = await getFirstKey(cookie);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toMatch(/24 hours/);
    expect(body.detail).toMatch(/shown once/);
  });

  it('sends First Key Shown with the visitor user agent and no account ids', async () => {
    const events = pirschEvents(1);
    const { cookie, tenantId } = await createTestSession(env.DB, env, { githubId: 88904 });
    await env.KV.put(`first_key:${tenantId}`, 'wrl_live_testkey2');

    await getFirstKey(cookie);

    expect(events.map((e) => e.event_name)).toEqual(['First Key Shown']);
    expect(events[0].user_agent).toBe(UA);
    expect(JSON.stringify(events[0])).not.toMatch(/gh-88904|wrl_live_/);
  });

  it('sends First Key Missing when the key is gone', async () => {
    const events = pirschEvents(1);
    const { cookie } = await createTestSession(env.DB, env, { githubId: 88905 });

    await getFirstKey(cookie);

    expect(events.map((e) => e.event_name)).toEqual(['First Key Missing']);
  });

  it('sends nothing for tenants excluded from analytics', async () => {
    const { cookie } = await createTestSession(env.DB, env, { githubId: 88906, tenantId: 'default' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const ctx = createExecutionContext();
      const res = await handleFirstKey(
        new Request('https://wrl.test/v1/account/first-key', {
          headers: { Cookie: cookie, 'User-Agent': UA, 'CF-Connecting-IP': '198.51.100.20' },
        }),
        env,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(404);
      const pirschCalls = fetchSpy.mock.calls.filter(([url]) => String(url?.url ?? url).includes('pirsch'));
      expect(pirschCalls).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('welcome screen without a first key', () => {
  const src = WELCOME_JS;

  it('offers to create a new key in place, through the account keys endpoint', () => {
    expect(src).toMatch(/Create a new key/);
    expect(src).toMatch(/apiFetch\('\/v1\/account\/keys'/);
    expect(src).toMatch(/name: 'primary'/);
  });

  it('explains that the first key is kept for 24 hours and shown once', () => {
    expect(src).toMatch(/24 hours/);
  });
});
