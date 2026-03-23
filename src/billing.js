/*
 * billing.js -- Stripe billing endpoint handlers
 *
 * Endpoints:
 *   POST /v1/billing/checkout  -- create a Stripe Checkout session (setup mode)
 *   POST /v1/billing/portal    -- create a Stripe Customer Portal session
 *   POST /v1/stripe/webhook    -- Stripe webhook handler (signature-verified)
 *
 * Checkout and portal require session auth (env._session).
 * The webhook endpoint is public but verifies Stripe-Signature.
 *
 * Tests: test/billing.test.js
 */ // tva

import { jsonResponse, problemResponse } from './responses.js';
import { log } from './log.js';
import { computeCip } from './ip-hash.js';
import {
  createCheckoutSession,
  createPortalSession,
  createCustomer,
  createSubscription,
} from './stripe.js';
import {
  verifyStripeSignature,
  isEventProcessed,
  markEventProcessed,
} from './stripe-webhook.js';
import {
  getTenantBilling,
  setStripeCustomerId,
  setPaymentMethodAdded,
  setBillingStatus,
  getTenantByStripeCustomerId,
} from './db.js';

const BILLING_CACHE = { 'Cache-Control': 'private, no-store' };

// Grace period duration: 7 days after payment failure
const GRACE_PERIOD_DAYS = 7;

// ---------------------------------------------------------------------------
// POST /v1/billing/checkout
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout session in setup mode.
 *
 * If the tenant doesn't have a Stripe customer yet, one is created first.
 * The Checkout session collects a payment method and creates a subscription
 * with the usage-based capture price.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleBillingCheckout(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);
  const { tenantId } = env._session;

  // Read current billing state
  const billing = await getTenantBilling(env.DB, tenantId);
  if (!billing) {
    return problemResponse(404, 'Tenant not found', BILLING_CACHE);
  }

  // Already has payment method -- direct to portal instead
  if (billing.paymentMethodAddedAt) {
    return problemResponse(409, 'Payment method already configured. Use the billing portal to manage your subscription.', BILLING_CACHE);
  }

  // Parse optional returnUrl from body
  let returnUrl = `${new URL(request.url).origin}/ui`;
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = await request.json();
      if (body.returnUrl && typeof body.returnUrl === 'string') {
        returnUrl = body.returnUrl;
      }
    } catch {
      // Empty body or invalid JSON is fine -- use default returnUrl
    }
  }

  try {
    // Create Stripe customer if needed
    let customerId = billing.stripeCustomerId;
    if (!customerId) {
      const customer = await createCustomer(env, {
        metadata: { tenantId, wrl: '1' },
      });
      customerId = customer.id;
      await setStripeCustomerId(env.DB, tenantId, customerId);
    }

    // Create Checkout session in subscription mode with usage-based price
    const session = await createCheckoutSession(env, {
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': env.STRIPE_CAPTURE_PRICE_ID,
      success_url: returnUrl,
      cancel_url: returnUrl,
    });

    ctx.waitUntil(log(env, 3, 'billing', {
      event: 'billing.checkout_created',
      cip,
      tenantId,
      stripeSessionId: session.id,
      responseStatus: 200,
    }) ?? Promise.resolve());

    return jsonResponse({ url: session.url }, 200, BILLING_CACHE);
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'billing', {
      event: 'billing.checkout_error',
      cip,
      tenantId,
      error: err.message,
      responseStatus: 500,
    }) ?? Promise.resolve());
    return problemResponse(500, 'Failed to create checkout session', BILLING_CACHE);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/billing/portal
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Customer Portal session for managing subscription/payment.
 *
 * Requires an existing Stripe customer ID (i.e., tenant must have gone
 * through checkout at least once).
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleBillingPortal(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);
  const { tenantId } = env._session;

  const billing = await getTenantBilling(env.DB, tenantId);
  if (!billing) {
    return problemResponse(404, 'Tenant not found', BILLING_CACHE);
  }

  if (!billing.stripeCustomerId) {
    return problemResponse(400, 'No billing account found. Complete checkout first.', BILLING_CACHE);
  }

  let returnUrl = `${new URL(request.url).origin}/ui`;
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = await request.json();
      if (body.returnUrl && typeof body.returnUrl === 'string') {
        returnUrl = body.returnUrl;
      }
    } catch {
      // Empty body is fine
    }
  }

  try {
    const session = await createPortalSession(env, {
      customer: billing.stripeCustomerId,
      return_url: returnUrl,
    });

    ctx.waitUntil(log(env, 3, 'billing', {
      event: 'billing.portal_created',
      cip,
      tenantId,
      responseStatus: 200,
    }) ?? Promise.resolve());

    return jsonResponse({ url: session.url }, 200, BILLING_CACHE);
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'billing', {
      event: 'billing.portal_error',
      cip,
      tenantId,
      error: err.message,
      responseStatus: 500,
    }) ?? Promise.resolve());
    return problemResponse(500, 'Failed to create portal session', BILLING_CACHE);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/stripe/webhook
// ---------------------------------------------------------------------------

/**
 * Stripe webhook handler. Verifies signature, deduplicates events, and
 * dispatches to event-specific handlers.
 *
 * Supported events:
 *   - checkout.session.completed  → mark payment method added, activate billing
 *   - invoice.payment_failed     → start grace period
 *   - invoice.paid               → clear grace period, reactivate
 *   - customer.subscription.deleted → block captures
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleStripeWebhook(request, env, ctx) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('Stripe-Signature');

  // Verify signature
  let event;
  try {
    event = await verifyStripeSignature(
      rawBody,
      signatureHeader,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    ctx.waitUntil(log(env, 4, 'billing', {
      event: 'billing.webhook_signature_failed',
      error: err.message,
      responseStatus: 400,
    }) ?? Promise.resolve());
    return problemResponse(400, 'Webhook signature verification failed');
  }

  // Event dedup
  if (await isEventProcessed(env.KV, event.id)) {
    return jsonResponse({ received: true, deduplicated: true });
  }

  // Dispatch by event type
  try {
    await dispatchWebhookEvent(event, env, ctx);
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'billing', {
      event: 'billing.webhook_handler_error',
      stripeEventType: event.type,
      stripeEventId: event.id,
      error: err.message,
      responseStatus: 500,
    }) ?? Promise.resolve());
    // Return 500 so Stripe retries
    return problemResponse(500, 'Webhook handler failed');
  }

  // Mark processed after successful handling
  ctx.waitUntil(markEventProcessed(env.KV, event.id));

  return jsonResponse({ received: true });
}

/**
 * Route a Stripe webhook event to its handler.
 */
async function dispatchWebhookEvent(event, env, ctx) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event, env, ctx);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event, env, ctx);
      break;
    case 'invoice.paid':
      await handleInvoicePaid(event, env, ctx);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event, env, ctx);
      break;
    default:
      // Unhandled event types are silently acknowledged
      ctx.waitUntil(log(env, 3, 'billing', {
        event: 'billing.webhook_unhandled',
        stripeEventType: event.type,
        stripeEventId: event.id,
      }) ?? Promise.resolve());
      break;
  }
}

/**
 * checkout.session.completed: tenant has added a payment method via Checkout.
 * Record payment_method_added_at and ensure billing is active.
 */
async function handleCheckoutCompleted(event, env, ctx) {
  const session = event.data?.object;
  const customerId = session?.customer;
  if (!customerId) return;

  const tenant = await getTenantByStripeCustomerId(env.DB, customerId);
  if (!tenant) {
    // Customer might have been created outside WRL -- log and skip
    ctx.waitUntil(log(env, 4, 'billing', {
      event: 'billing.webhook_tenant_not_found',
      stripeEventType: event.type,
      stripeCustomerId: customerId,
    }) ?? Promise.resolve());
    return;
  }

  await setPaymentMethodAdded(env.DB, tenant.id);

  // If tenant was in grace period or blocked, reactivate
  if (tenant.billingStatus !== 'active') {
    await setBillingStatus(env.DB, tenant.id, 'active');
  }

  ctx.waitUntil(log(env, 3, 'billing', {
    event: 'billing.checkout_completed',
    tenantId: tenant.id,
    stripeCustomerId: customerId,
  }) ?? Promise.resolve());
}

/**
 * invoice.payment_failed: start a 7-day grace period.
 * If already in grace period, do nothing (idempotent).
 */
async function handleInvoicePaymentFailed(event, env, ctx) {
  const invoice = event.data?.object;
  const customerId = invoice?.customer;
  if (!customerId) return;

  const tenant = await getTenantByStripeCustomerId(env.DB, customerId);
  if (!tenant) return;

  // Only transition from active to grace_period
  if (tenant.billingStatus === 'active') {
    const gracePeriodEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await setBillingStatus(env.DB, tenant.id, 'grace_period', gracePeriodEnd);

    ctx.waitUntil(log(env, 4, 'billing', {
      event: 'billing.grace_period_started',
      tenantId: tenant.id,
      stripeCustomerId: customerId,
      gracePeriodEnd,
    }) ?? Promise.resolve());
  }
}

/**
 * invoice.paid: payment succeeded. Clear any grace period and reactivate.
 */
async function handleInvoicePaid(event, env, ctx) {
  const invoice = event.data?.object;
  const customerId = invoice?.customer;
  if (!customerId) return;

  const tenant = await getTenantByStripeCustomerId(env.DB, customerId);
  if (!tenant) return;

  if (tenant.billingStatus !== 'active') {
    await setBillingStatus(env.DB, tenant.id, 'active');

    ctx.waitUntil(log(env, 3, 'billing', {
      event: 'billing.reactivated',
      tenantId: tenant.id,
      stripeCustomerId: customerId,
      previousStatus: tenant.billingStatus,
    }) ?? Promise.resolve());
  }
}

/**
 * customer.subscription.deleted: subscription cancelled.
 * Block captures immediately.
 */
async function handleSubscriptionDeleted(event, env, ctx) {
  const subscription = event.data?.object;
  const customerId = subscription?.customer;
  if (!customerId) return;

  const tenant = await getTenantByStripeCustomerId(env.DB, customerId);
  if (!tenant) return;

  // Transition to grace_period first (setBillingStatus requires this path)
  // then to blocked, OR if already in grace_period, go to blocked
  if (tenant.billingStatus === 'active') {
    // Set a zero-length grace period so the blocked transition works
    await setBillingStatus(env.DB, tenant.id, 'grace_period', new Date().toISOString());
  }
  if (tenant.billingStatus !== 'blocked') {
    await setBillingStatus(env.DB, tenant.id, 'blocked');
  }

  ctx.waitUntil(log(env, 4, 'billing', {
    event: 'billing.subscription_deleted',
    tenantId: tenant.id,
    stripeCustomerId: customerId,
  }) ?? Promise.resolve());
}
