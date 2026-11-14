// tva
// PATCH /v1/account/settings: every account may turn qualified timestamps on.
// The first 50 a month are free and billing happens at capture time, so no
// payment method is needed; the handler's comment said one was (402).
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanDb, createTestSession } from './fixtures.js';

const SETTINGS_URL = 'https://worker.test/v1/account/settings';

async function createTosSession() {
  const session = await createTestSession(env.DB, env);
  await env.DB.prepare(
    "UPDATE github_users SET tos_accepted_at = '2026-01-01T00:00:00.000Z', tos_version = '1.0' WHERE github_id = ?",
  ).bind(session.githubId).run();
  return session;
}

function patchSettings(cookie, body) {
  return SELF.fetch(SETTINGS_URL, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-WRL-CSRF': '1', 'CF-Connecting-IP': '10.0.9.1' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await cleanDb(env.DB);
});

describe('PATCH /v1/account/settings -- qualified timestamps', () => {
  it('turns them on for an account without a payment method', async () => {
    const { cookie, tenantId } = await createTosSession();
    const res = await patchSettings(cookie, { qualifiedTimestamps: true });
    expect(res.status).toBe(200);
    expect((await res.json()).qualifiedTimestamps).toBe(true);
    const row = await env.DB.prepare('SELECT eidas_qualified, payment_method_added_at FROM tenants WHERE id = ?')
      .bind(tenantId).first();
    expect(row).toEqual({ eidas_qualified: 1, payment_method_added_at: null });
  });

  it('turns them off again', async () => {
    const { cookie, tenantId } = await createTosSession();
    await patchSettings(cookie, { qualifiedTimestamps: true });
    const res = await patchSettings(cookie, { qualifiedTimestamps: false });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT eidas_qualified FROM tenants WHERE id = ?').bind(tenantId).first();
    expect(row.eidas_qualified).toBe(0);
  });
});
