// Integration tests for src/billing.js
// Tests the billing endpoints via the Worker fetch handler.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { cleanDb, createTestSession, seedGithubUser } from './fixtures.js';
import { setStripeCustomerId, setPaymentMethodAdded, setBillingStatus } from '../src/db.js';

beforeEach(async () => {
  await cleanDb(env.DB);
});

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupSessionAndTenant(db, envBindings, opts = {}) {
  const session = await createTestSession(db, envBindings, opts);
  // Accept ToS so billing endpoints are accessible
  await db.prepare(
    `UPDATE github_users SET tos_accepted_at = ?, tos_version = ? WHERE github_id = ?`,
  ).bind(new Date().toISOString(), '1.0', session.githubId).run();
  return session;
}

/**
 * Compute a valid Stripe webhook signature.
 */
async function computeStripeSignature(rawBody, secret, timestampOverride) {
  const timestamp = timestampOverride ?? Math.floor(Date.now() / 1000);
  const keyBytes = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const sigBytes = await crypto.subtle.sign(
    'HMAC', cryptoKey, new TextEncoder().encode(signedPayload),
  );
  const hex = Array.from(new Uint8Array(sigBytes), b => b.toString(16).padStart(2, '0')).join('');
  return { header: `t=${timestamp},v1=${hex}`, timestamp };
}

// ---------------------------------------------------------------------------
// POST /v1/billing/checkout
// ---------------------------------------------------------------------------

describe('POST /v1/billing/checkout', () => {
  it('returns 401 without session', async () => {
    const res = await SELF.fetch('https://wrl.test/v1/billing/checkout', {
      method: 'POST',
      headers: { 'X-WRL-CSRF': '1' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 without CSRF header', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    const res = await SELF.fetch('https://wrl.test/v1/billing/checkout', {
      method: 'POST',
      headers: { Cookie: session.cookie },
    });
    expect(res.status).toBe(403);
  });

  it('returns 409 when payment method already exists', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    await setPaymentMethodAdded(env.DB, session.tenantId);

    const res = await SELF.fetch('https://wrl.test/v1/billing/checkout', {
      method: 'POST',
      headers: { Cookie: session.cookie, 'X-WRL-CSRF': '1' },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.detail).toContain('already configured');
  });

  it('calls Stripe and returns checkout URL on success', async () => {
    const session = await setupSessionAndTenant(env.DB, env);

    // Stub fetch to intercept Stripe API calls
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      const urlStr = url instanceof URL ? url.toString() : String(url);
      if (urlStr.includes('api.stripe.com/v1/customers')) {
        return new Response(JSON.stringify({ id: 'cus_test_123', object: 'customer' }), { status: 200 });
      }
      if (urlStr.includes('api.stripe.com/v1/checkout/sessions')) {
        return new Response(JSON.stringify({
          id: 'cs_test_abc',
          url: 'https://checkout.stripe.com/session/cs_test_abc',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${urlStr}`);
    }));

    const res = await SELF.fetch('https://wrl.test/v1/billing/checkout', {
      method: 'POST',
      headers: { Cookie: session.cookie, 'X-WRL-CSRF': '1' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://checkout.stripe.com/session/cs_test_abc');

    // Verify Stripe customer was created (customer API was called)
    const stripeCalls = fetch.mock.calls;
    const customerCall = stripeCalls.find(([u]) => String(u).includes('/v1/customers'));
    expect(customerCall).toBeDefined();
  });

  it('reuses existing Stripe customer ID', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    await setStripeCustomerId(env.DB, session.tenantId, 'cus_existing');

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('api.stripe.com/v1/checkout/sessions')) {
        return new Response(JSON.stringify({
          id: 'cs_test_reuse',
          url: 'https://checkout.stripe.com/session/cs_test_reuse',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${urlStr}`);
    }));

    const res = await SELF.fetch('https://wrl.test/v1/billing/checkout', {
      method: 'POST',
      headers: { Cookie: session.cookie, 'X-WRL-CSRF': '1' },
    });
    expect(res.status).toBe(200);

    // Should NOT have called /v1/customers -- reused existing
    const customerCall = fetch.mock.calls.find(([u]) => String(u).includes('/v1/customers'));
    expect(customerCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/billing/portal
// ---------------------------------------------------------------------------

describe('POST /v1/billing/portal', () => {
  it('returns 401 without session', async () => {
    const res = await SELF.fetch('https://wrl.test/v1/billing/portal', {
      method: 'POST',
      headers: { 'X-WRL-CSRF': '1' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when no Stripe customer exists', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    const res = await SELF.fetch('https://wrl.test/v1/billing/portal', {
      method: 'POST',
      headers: { Cookie: session.cookie, 'X-WRL-CSRF': '1' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('No billing account');
  });

  it('returns portal URL when Stripe customer exists', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    await setStripeCustomerId(env.DB, session.tenantId, 'cus_portal_test');

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('api.stripe.com/v1/billing_portal/sessions')) {
        return new Response(JSON.stringify({
          id: 'bps_test',
          url: 'https://billing.stripe.com/session/bps_test',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${urlStr}`);
    }));

    const res = await SELF.fetch('https://wrl.test/v1/billing/portal', {
      method: 'POST',
      headers: { Cookie: session.cookie, 'X-WRL-CSRF': '1' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://billing.stripe.com/session/bps_test');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/stripe/webhook
// ---------------------------------------------------------------------------

describe('POST /v1/stripe/webhook', () => {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  it('rejects requests without Stripe-Signature header', async () => {
    const res = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid signature', async () => {
    const res = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': 't=1234,v1=bad' },
      body: '{}',
    });
    expect(res.status).toBe(400);
  });

  it('processes checkout.session.completed and sets payment method', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    await setStripeCustomerId(env.DB, session.tenantId, 'cus_wh_test');

    const event = {
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_wh_test', mode: 'subscription' } },
    };
    const rawBody = JSON.stringify(event);
    const { header } = await computeStripeSignature(rawBody, webhookSecret);

    const res = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': header },
      body: rawBody,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);

    // Verify payment_method_added_at was set
    const row = await env.DB.prepare(
      'SELECT payment_method_added_at FROM tenants WHERE id = ?',
    ).bind(session.tenantId).first();
    expect(row.payment_method_added_at).not.toBeNull();
  });

  it('deduplicates events', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    await setStripeCustomerId(env.DB, session.tenantId, 'cus_dedup');

    const event = {
      id: 'evt_dedup_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_dedup' } },
    };
    const rawBody = JSON.stringify(event);
    const { header } = await computeStripeSignature(rawBody, webhookSecret);

    // First call
    const res1 = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': header },
      body: rawBody,
    });
    expect(res1.status).toBe(200);

    // Second call with same event ID
    const { header: header2 } = await computeStripeSignature(rawBody, webhookSecret);
    const res2 = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': header2 },
      body: rawBody,
    });
    expect(res2.status).toBe(200);
    const body = await res2.json();
    expect(body.deduplicated).toBe(true);
  });

  it('handles invoice.payment_failed and starts grace period', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    await setStripeCustomerId(env.DB, session.tenantId, 'cus_fail');
    await setPaymentMethodAdded(env.DB, session.tenantId);

    const event = {
      id: 'evt_fail_1',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_fail' } },
    };
    const rawBody = JSON.stringify(event);
    const { header } = await computeStripeSignature(rawBody, webhookSecret);

    const res = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': header },
      body: rawBody,
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      'SELECT billing_status, grace_period_end FROM tenants WHERE id = ?',
    ).bind(session.tenantId).first();
    expect(row.billing_status).toBe('grace_period');
    expect(row.grace_period_end).not.toBeNull();
  });

  it('handles invoice.paid and reactivates from grace period', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    await setStripeCustomerId(env.DB, session.tenantId, 'cus_paid');
    const gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await setBillingStatus(env.DB, session.tenantId, 'grace_period', gracePeriodEnd);

    const event = {
      id: 'evt_paid_1',
      type: 'invoice.paid',
      data: { object: { customer: 'cus_paid' } },
    };
    const rawBody = JSON.stringify(event);
    const { header } = await computeStripeSignature(rawBody, webhookSecret);

    const res = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': header },
      body: rawBody,
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      'SELECT billing_status, grace_period_end FROM tenants WHERE id = ?',
    ).bind(session.tenantId).first();
    expect(row.billing_status).toBe('active');
    expect(row.grace_period_end).toBeNull();
  });

  it('handles customer.subscription.deleted and blocks tenant', async () => {
    const session = await setupSessionAndTenant(env.DB, env);
    await setStripeCustomerId(env.DB, session.tenantId, 'cus_del');
    await setPaymentMethodAdded(env.DB, session.tenantId);

    const event = {
      id: 'evt_del_1',
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_del', id: 'sub_del' } },
    };
    const rawBody = JSON.stringify(event);
    const { header } = await computeStripeSignature(rawBody, webhookSecret);

    const res = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': header },
      body: rawBody,
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      'SELECT billing_status FROM tenants WHERE id = ?',
    ).bind(session.tenantId).first();
    expect(row.billing_status).toBe('blocked');
  });

  it('silently acknowledges unhandled event types', async () => {
    const event = {
      id: 'evt_unhandled_1',
      type: 'payment_method.attached',
      data: { object: { id: 'pm_xxx' } },
    };
    const rawBody = JSON.stringify(event);
    const { header } = await computeStripeSignature(rawBody, webhookSecret);

    const res = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': header },
      body: rawBody,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it('does not require session auth (public endpoint)', async () => {
    // Webhook should work without any Cookie header
    const event = {
      id: 'evt_noauth_1',
      type: 'payment_method.attached',
      data: { object: {} },
    };
    const rawBody = JSON.stringify(event);
    const { header } = await computeStripeSignature(rawBody, webhookSecret);

    const res = await SELF.fetch('https://wrl.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': header },
      body: rawBody,
    });
    // Should NOT be 401 (no session required)
    expect(res.status).toBe(200);
  });
});
