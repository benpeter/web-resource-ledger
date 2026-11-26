// tva
/*
 * resend-webhook.js -- bounces and spam complaints reported by Resend (backlog #63)
 *
 * Resend signs webhooks the Svix way: HMAC-SHA256 over "${svix-id}.${svix-timestamp}.${body}",
 * keyed with the base64 part of the whsec_* secret, sent as space-separated
 * "v1,<base64>" values in svix-signature (several during secret rotation).
 *
 * - email.bounced with bounce.type "Permanent": mail to that address can't
 *   arrive, so the notification address stops counting as verified. No more
 *   notification email goes there, and email sign-in with it stops, since
 *   its link couldn't arrive either. Verifying the address again undoes it.
 * - email.complained: the recipient marked a WRL email as spam, so every
 *   notification type is turned off. The address stays verified.
 * - Everything else is acknowledged and ignored.
 *
 * Tests: test/resend-webhook.test.js
 */

import { markNotificationEmailBounced, turnOffNotificationsForEmail } from './db.js';
import { log } from './log.js';
import { jsonResponse, problemResponse } from './responses.js';

const TOLERANCE_SEC = 300;
const DEDUP_TTL_SEC = 604800; // 7 days, as for Stripe events

async function timingSafeEqual(a, b) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

/**
 * Verify a Svix-signed Resend webhook and return the parsed event.
 *
 * @param {string} rawBody  Raw request body, before any JSON parsing
 * @param {{ id: string|null, timestamp: string|null, signature: string|null }} headers
 *   svix-id, svix-timestamp and svix-signature
 * @param {string} secret   whsec_* signing secret from the Resend webhook
 * @returns {Promise<object>}
 */
export async function verifySvixSignature(rawBody, headers, secret, toleranceSec = TOLERANCE_SEC) {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) throw new Error('Missing svix-id, svix-timestamp or svix-signature header');
  if (!secret?.startsWith('whsec_')) throw new Error('RESEND_WEBHOOK_SECRET is not set');
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSec) throw new Error('Resend webhook timestamp out of tolerance');

  const keyBytes = Uint8Array.from(atob(secret.slice('whsec_'.length)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',');
    if (version === 'v1' && value && await timingSafeEqual(expected, value)) return JSON.parse(rawBody);
  }
  throw new Error('Resend webhook signature verification failed');
}

/**
 * POST /v1/resend/webhook
 */
export async function handleResendWebhook(request, env, ctx) {
  const rawBody = await request.text();
  const headers = {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  };

  let event;
  try {
    event = await verifySvixSignature(rawBody, headers, env.RESEND_WEBHOOK_SECRET);
  } catch (err) {
    ctx.waitUntil(log(env, 4, 'email', { event: 'email.webhook_signature_failed', error: err.message, responseStatus: 400 }) ?? Promise.resolve());
    return problemResponse(400, 'Webhook signature verification failed');
  }

  const dedupKey = `resend_evt:${headers.id}`;
  if (await env.KV.get(dedupKey) !== null) return jsonResponse({ received: true, deduplicated: true });

  const recipients = Array.isArray(event.data?.to) ? event.data.to : [];
  if (event.type === 'email.bounced' && event.data?.bounce?.type === 'Permanent') {
    let tenants = 0;
    for (const address of recipients) tenants += await markNotificationEmailBounced(env.DB, address);
    await log(env, 4, 'email', { event: 'email.bounced', bounceSubType: event.data.bounce.subType ?? null, tenants, emailId: event.data.email_id ?? null });
  } else if (event.type === 'email.bounced') {
    await log(env, 3, 'email', { event: 'email.bounced_transient', bounceSubType: event.data?.bounce?.subType ?? null, emailId: event.data?.email_id ?? null });
  } else if (event.type === 'email.complained') {
    let tenants = 0;
    for (const address of recipients) tenants += await turnOffNotificationsForEmail(env.DB, address);
    await log(env, 4, 'email', { event: 'email.complained', tenants, emailId: event.data?.email_id ?? null });
  }

  await env.KV.put(dedupKey, '1', { expirationTtl: DEDUP_TTL_SEC });
  return jsonResponse({ received: true });
}
