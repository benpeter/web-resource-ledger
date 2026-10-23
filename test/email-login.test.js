/**
 * Sign in with an emailed link (phase 0131).
 *
 * POST /auth/email sends a single-use link. GET /auth/email/verify shows
 * a page with a button (so mail scanners that open links don't use the token),
 * and POST /auth/email/verify signs in: an existing email user, a tenant
 * whose verified notification email matches, or a new tenant.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  handleEmailLoginRequest,
  handleEmailLoginPage,
  handleEmailLoginConfirm,
  normalizeEmail,
  LOGIN_TOKEN_TTL_SECONDS,
} from '../src/email-login.js';
import { handleAuthSession } from '../src/oauth.js';
import { verifySession } from '../src/session.js';
import { cleanDb, createTestSession } from './fixtures.js';

const ORIGIN = 'https://wrl.test';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

let resendCalls;

function stubResend({ status = 200 } = {}) {
  resendCalls = [];
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = String(input?.url ?? input);
    if (url.startsWith('https://api.resend.com/')) {
      resendCalls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'email_1' }), { status });
    }
    // Analytics and anything else: accept and ignore.
    return new Response('{}', { status: 202 });
  }));
}

async function requestLink(email, { ip = '198.51.100.10', from } = {}) {
  const ctx = createExecutionContext();
  const res = await handleEmailLoginRequest(
    new Request(`${ORIGIN}/auth/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, 'User-Agent': UA },
      body: JSON.stringify(from ? { email, from } : { email }),
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

function tokenFromLastEmail() {
  const last = resendCalls[resendCalls.length - 1];
  const m = last.text.match(/token=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

async function confirm(token, { origin = ORIGIN } = {}) {
  const ctx = createExecutionContext();
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, 'CF-Connecting-IP': '198.51.100.10' };
  if (origin) headers.Origin = origin;
  const res = await handleEmailLoginConfirm(
    new Request(`${ORIGIN}/auth/email/verify`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ token }).toString(),
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

function cookieFrom(res) {
  return (res.headers.get('Set-Cookie') || '').split(';')[0];
}

let savedResendKey;
beforeEach(async () => {
  await cleanDb(env.DB);
  stubResend();
  savedResendKey = env.RESEND_API_KEY;
  env.RESEND_API_KEY = 're_test_key_for_vitest';
});

afterEach(() => {
  vi.unstubAllGlobals();
  env.RESEND_API_KEY = savedResendKey;
});

describe('normalizeEmail', () => {
  it('trims and lower-cases a valid address', () => {
    expect(normalizeEmail('  Ann.Lee@Example.ORG ')).toBe('ann.lee@example.org');
  });

  it('rejects things that are not one plain address', () => {
    for (const bad of ['', 'ann', 'ann@', '@example.org', 'a b@example.org', 'ann@example', 'a@b.c\nBcc: x@y.z', `${'a'.repeat(250)}@example.org`, null, 42]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe('POST /auth/email', () => {
  it('sends a single-use link and stores only the token hash', async () => {
    const res = await requestLink('Ann@Example.org');
    expect(res.status).toBe(202);
    expect(resendCalls).toHaveLength(1);
    expect(resendCalls[0].to).toEqual(['ann@example.org']);
    const token = tokenFromLastEmail();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(resendCalls[0].text).toContain(`${ORIGIN}/auth/email/verify?token=${token}`);

    const rows = await env.DB.prepare('SELECT token_hash, email, expires_at, used_at FROM login_tokens').all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].email).toBe('ann@example.org');
    expect(rows.results[0].token_hash).not.toContain(token);
    expect(rows.results[0].used_at).toBeNull();
    const ttl = (Date.parse(rows.results[0].expires_at) - Date.now()) / 1000;
    expect(ttl).toBeGreaterThan(LOGIN_TOKEN_TTL_SECONDS - 60);
    expect(ttl).toBeLessThanOrEqual(LOGIN_TOKEN_TTL_SECONDS);
  });

  it('answers 400 for an invalid address and sends nothing', async () => {
    const res = await requestLink('not-an-address');
    expect(res.status).toBe(400);
    expect(resendCalls).toHaveLength(0);
  });

  it('limits links per address to 3 an hour', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await requestLink('ann@example.org', { ip: `198.51.100.${20 + i}` })).status).toBe(202);
    }
    const res = await requestLink('ann@example.org', { ip: '198.51.100.40' });
    expect(res.status).toBe(429);
    expect(resendCalls).toHaveLength(3);
  });

  it('limits link requests per IP address to 10 an hour', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await requestLink(`user${i}@example.org`)).status).toBe(202);
    }
    expect((await requestLink('user10@example.org')).status).toBe(429);
  });

  it('answers 502 when the email can not be sent', async () => {
    stubResend({ status: 500 });
    const res = await requestLink('ann@example.org');
    expect(res.status).toBe(502);
  });
});

describe('GET /auth/email/verify', () => {
  it('shows a sign-in button and does not use the token', async () => {
    await requestLink('ann@example.org');
    const token = tokenFromLastEmail();
    const res = await handleEmailLoginPage(new Request(`${ORIGIN}/auth/email/verify?token=${token}`), env, createExecutionContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    const html = await res.text();
    expect(html).toContain('method="post"');
    expect(html).toContain(`value="${token}"`);
    const row = await env.DB.prepare('SELECT used_at FROM login_tokens').first();
    expect(row.used_at).toBeNull();
  });

  it('explains a link without a token', async () => {
    const res = await handleEmailLoginPage(new Request(`${ORIGIN}/auth/email/verify`), env, createExecutionContext());
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('not valid');
  });
});

describe('POST /auth/email/verify', () => {
  it('creates a new account with a first key and signs in', async () => {
    await requestLink('new@example.org', { from: 'landing' });
    const res = await confirm(tokenFromLastEmail());
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/ui?flow=welcome');
    expect(cookieFrom(res)).toMatch(/^__Host-wrl_session=/);

    const user = await env.DB.prepare('SELECT tenant_id FROM email_users WHERE email = ?').bind('new@example.org').first();
    expect(user.tenant_id).toMatch(/^em-[0-9a-f]{16}$/);
    expect(await env.KV.get(`first_key:${user.tenant_id}`)).toMatch(/^wrl_live_/);
    const prefs = await env.DB.prepare('SELECT email, email_verified FROM notification_preferences WHERE tenant_id = ?').bind(user.tenant_id).first();
    expect(prefs.email).toBe('new@example.org');
    expect(prefs.email_verified).toBe(1);
  });

  it('uses a token only once', async () => {
    await requestLink('ann@example.org');
    const token = tokenFromLastEmail();
    expect((await confirm(token)).status).toBe(302);
    const again = await confirm(token);
    expect(again.status).toBe(302);
    expect(again.headers.get('Location')).toBe('/ui?error=login_link_invalid');
    expect(again.headers.get('Set-Cookie')).toBeNull();
  });

  it('refuses an expired token', async () => {
    await requestLink('ann@example.org');
    await env.DB.prepare("UPDATE login_tokens SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    const res = await confirm(tokenFromLastEmail());
    expect(res.headers.get('Location')).toBe('/ui?error=login_link_invalid');
  });

  it('refuses a POST from another site (login CSRF)', async () => {
    await requestLink('ann@example.org');
    const res = await confirm(tokenFromLastEmail(), { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare('SELECT used_at FROM login_tokens').first();
    expect(row.used_at).toBeNull();
  });

  it('signs a returning email user into the same account', async () => {
    await requestLink('ann@example.org');
    await confirm(tokenFromLastEmail());
    const first = await env.DB.prepare('SELECT tenant_id FROM email_users').first();

    await requestLink('ANN@example.org');
    const res = await confirm(tokenFromLastEmail());
    expect(res.headers.get('Location')).toBe('/ui');
    const users = await env.DB.prepare('SELECT tenant_id FROM email_users').all();
    expect(users.results).toHaveLength(1);
    expect(users.results[0].tenant_id).toBe(first.tenant_id);
  });

  it('signs into an existing GitHub account whose verified email matches', async () => {
    await createTestSession(env.DB, env, { githubId: 4242 });
    await env.DB.prepare(
      `INSERT INTO notification_preferences (tenant_id, email, email_verified, email_source) VALUES ('gh-4242', 'dev@example.org', 1, 'github')`,
    ).run();

    await requestLink('dev@example.org');
    const res = await confirm(tokenFromLastEmail());
    expect(res.headers.get('Location')).toBe('/ui');
    const user = await env.DB.prepare('SELECT tenant_id FROM email_users WHERE email = ?').bind('dev@example.org').first();
    expect(user.tenant_id).toBe('gh-4242');
  });

  it('does not link to an account whose matching email is unverified', async () => {
    await createTestSession(env.DB, env, { githubId: 4343 });
    await env.DB.prepare(
      `INSERT INTO notification_preferences (tenant_id, email, email_verified, email_source) VALUES ('gh-4343', 'dev2@example.org', 0, 'manual')`,
    ).run();

    await requestLink('dev2@example.org');
    await confirm(tokenFromLastEmail());
    const user = await env.DB.prepare('SELECT tenant_id FROM email_users WHERE email = ?').bind('dev2@example.org').first();
    expect(user.tenant_id).not.toBe('gh-4343');
    expect(user.tenant_id).toMatch(/^em-/);
  });
});

describe('sessions of email users', () => {
  async function signIn(email) {
    await requestLink(email);
    const res = await confirm(tokenFromLastEmail());
    return cookieFrom(res);
  }

  it('verifySession returns the email as display name', async () => {
    const cookie = await signIn('ann@example.org');
    const auth = await verifySession(new Request(`${ORIGIN}/v1/account`, { headers: { Cookie: cookie } }), env);
    expect(auth.ok).toBe(true);
    expect(auth.githubId).toBeNull();
    expect(auth.email).toBe('ann@example.org');
    expect(auth.displayName).toBe('ann@example.org');
    expect(auth.tenantId).toMatch(/^em-/);
  });

  it('GET /auth/session describes an email user', async () => {
    const cookie = await signIn('ann@example.org');
    const res = await handleAuthSession(new Request(`${ORIGIN}/auth/session`, { headers: { Cookie: cookie } }), env, createExecutionContext());
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.displayName).toBe('ann@example.org');
    expect(body.user.email).toBe('ann@example.org');
    expect(body.user.githubLogin).toBeNull();
    expect(body.user.tosAcceptedAt).toBeNull();
  });

  it('GitHub sessions still work and show the GitHub login', async () => {
    const { cookie } = await createTestSession(env.DB, env, { githubId: 5150 });
    const auth = await verifySession(new Request(`${ORIGIN}/v1/account`, { headers: { Cookie: cookie } }), env);
    expect(auth.ok).toBe(true);
    expect(auth.githubId).toBe(5150);
    expect(auth.email).toBeNull();
    expect(auth.displayName).toBe(auth.githubLogin);
  });
});
