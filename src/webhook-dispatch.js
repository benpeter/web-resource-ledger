/*
 * webhook-dispatch.js -- Outbound webhook dispatch, delivery, and queue handlers
 *
 * Three responsibilities:
 *   1. dispatchWebhooks() -- called after a capture reaches terminal state; fans
 *      out one queue message per matching (capture, webhook) pair.
 *   2. handleWebhookMessage() -- queue consumer; performs the actual HTTP POST
 *      with HMAC signing, retries, and structured logging.
 *   3. handleWebhookDlqMessage() -- DLQ consumer; logs exhausted deliveries.
 *
 * Delivery retry schedule (based on msg.attempts):
 *   Attempt 1 → retry after 60s
 *   Attempt 2 → retry after 300s (5 min)
 *   Attempt 3 → retry after 900s (15 min)
 *   After max_retries, message lands in DLQ.
 *
 * Non-retryable conditions:
 *   - 4xx responses (except 408, 429) -- caller rejected the payload permanently
 *   - SSRF re-validation failure at dispatch time
 *   - Webhook deleted since enqueue
 *
 * Security invariants:
 *   - Full webhook URL is NEVER logged -- targetHost (hostname only) only.
 *   - Webhook secrets are NEVER logged.
 *   - Payload JSON is serialized ONCE; the exact string is signed and delivered.
 *   - SSRF re-validation occurs at delivery time (belt-and-suspenders).
 *
 * Tests: test/webhook-dispatch.test.js
 */ // tva

import { getCapture, getActiveWebhooksForEvent, getWebhook } from './db.js';
import { log } from './log.js';
import { signWebhookPayload, SIGNATURE_HEADER, TIMESTAMP_HEADER } from './webhook-signing.js';
import { validateWebhookUrl } from './webhooks.js';

// ---------------------------------------------------------------------------
// Exported helpers (tested independently)
// ---------------------------------------------------------------------------

/**
 * Returns the retry delay in seconds for a given attempt number.
 * Schedule: [60, 300, 900] -- returns null if attempt exceeds schedule length.
 *
 * @param {number} attempt  1-based attempt number (from msg.attempts)
 * @returns {number|null}
 */
export function webhookRetryDelay(attempt) {
  const schedule = [60, 300, 900];
  return attempt <= schedule.length ? schedule[attempt - 1] : null;
}

/**
 * Classify a delivery error into a safe, non-leaking category string.
 * Uses httpStatus when available; falls back to error message inspection.
 *
 * Categories: http_5xx, http_4xx, timeout, dns, connection, tls
 *
 * @param {Error|null} err
 * @param {number|null} httpStatus
 * @returns {string}
 */
export function classifyDeliveryError(err, httpStatus) {
  if (httpStatus !== null) {
    return httpStatus >= 500 ? 'http_5xx' : 'http_4xx';
  }
  const msg = String(err?.message ?? '');
  if (err?.name === 'TimeoutError' || msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || msg.includes('DNS')) return 'dns';
  if (msg.includes('certificate') || msg.includes('TLS') || msg.includes('SSL') || msg.includes('CERT')) return 'tls';
  return 'connection';
}

// ---------------------------------------------------------------------------
// Payload construction
// ---------------------------------------------------------------------------

/**
 * Build the JSON event payload for a webhook delivery.
 *
 * Returns a pre-serialized JSON string. The caller MUST use this exact string
 * for both signing and the HTTP body -- do NOT parse and re-serialize.
 *
 * Fields included depend on event type:
 *   capture.complete: captureId, status, url, completedAt, verificationUrl
 *   capture.failed:   captureId, status, url, failedAt, error, retryable, verificationUrl
 *
 * Fields NEVER included: R2 keys, render metadata, hashed IPs, attempt count,
 * internal service names, artifacts paths.
 *
 * @param {string} eventType  "capture.complete" | "capture.failed"
 * @param {object} captureRecord  Canonical capture record from getCapture()
 * @param {object} env  Worker env (for VERIFICATION_BASE_URL derivation)
 * @returns {string}  JSON string -- serialize ONCE, use everywhere
 */
export function buildWebhookPayload(eventType, captureRecord, env) {
  const eventId = 'evt_' + crypto.randomUUID().replace(/-/g, '');

  // Construct the verification URL from a known-safe base.
  // Uses env.VERIFICATION_BASE_URL if set; otherwise uses the worker hostname.
  // The captureId is validated at creation time via route regex, so safe to include.
  const base = env?.VERIFICATION_BASE_URL
    ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
    : 'https://api.webresourceledger.com';
  const verificationUrl = `${base}/v1/verify/${captureRecord.captureId}`;

  const data = {
    captureId: captureRecord.captureId,
    status: captureRecord.status,
    url: captureRecord.url,
    verificationUrl,
  };

  if (eventType === 'capture.complete') {
    data.completedAt = captureRecord.completedAt;
  } else if (eventType === 'capture.failed') {
    data.failedAt = captureRecord.failedAt;
    // error is already sanitized by categorizeError() in the capture pipeline
    if (captureRecord.error) data.error = captureRecord.error;
    data.retryable = Boolean(captureRecord.retryable);
  } else if (eventType === 'capture.quarantined') {
    data.quarantineReason = captureRecord.quarantineReason ?? null;
    data.quarantinedAt = captureRecord.quarantinedAt ?? null;
  }

  return JSON.stringify({
    id: eventId,
    type: eventType,
    createdAt: new Date().toISOString(),
    data,
  });
}

// ---------------------------------------------------------------------------
// Dispatch entry point (called from capture pipeline via ctx.waitUntil)
// ---------------------------------------------------------------------------

/**
 * Fan-out dispatch: enqueue one message per matching (capture, webhook) pair.
 *
 * Called after a capture reaches terminal state. Designed to never throw --
 * webhook dispatch must not prevent capture status updates. All errors are
 * caught and logged as webhook.dispatch_error.
 *
 * No-op when no webhooks are registered (common case); only one D1 query.
 *
 * @param {object} env         Worker env bindings
 * @param {string} tenantId    Tenant identifier
 * @param {string} eventType   "capture.complete" | "capture.failed"
 * @param {object} captureRecord  Canonical capture record from getCapture()
 */
export async function dispatchWebhooks(env, tenantId, eventType, captureRecord) {
  let webhooks;
  try {
    webhooks = await getActiveWebhooksForEvent(env.DB, tenantId, eventType);
  } catch (err) {
    // D1 query failed -- log and give up, do not block capture pipeline
    const category = classifyDeliveryError(err, null);
    log(env, 4, 'webhook', {
      event: 'webhook.dispatch_error',
      tenantId,
      captureId: captureRecord.captureId,
      webhookEvent: eventType,
      phase: 'query_webhooks',
      errorCategory: category,
    });
    return;
  }

  if (!webhooks || webhooks.length === 0) return;

  // Build payload once -- the same string is signed and delivered to all webhooks.
  // eventId is intentionally shared across all webhooks for the same event (Stripe model).
  const payload = buildWebhookPayload(eventType, captureRecord, env);
  const eventId = JSON.parse(payload).id;

  for (const webhook of webhooks) {
    try {
      await env.WEBHOOK_QUEUE.send({
        webhookId: webhook.webhookId,
        tenantId,
        captureId: captureRecord.captureId,
        eventType,
        eventId,
        payload,
      });
    } catch (err) {
      const category = classifyDeliveryError(err, null);
      log(env, 4, 'webhook', {
        event: 'webhook.dispatch_error',
        webhookId: webhook.webhookId,
        tenantId,
        captureId: captureRecord.captureId,
        webhookEvent: eventType,
        phase: 'enqueue',
        errorCategory: category,
      });
      // Continue to next webhook -- one enqueue failure must not block others
    }
  }
}

// ---------------------------------------------------------------------------
// Queue consumer: WEBHOOK_QUEUE
// ---------------------------------------------------------------------------

/**
 * Deliver one webhook message from the queue.
 *
 * Flow:
 *   1. Look up webhook (may have been deleted since enqueue)
 *   2. Re-validate URL for SSRF (belt-and-suspenders)
 *   3. Sign payload with HMAC-SHA256
 *   4. POST to webhook URL with 10s timeout
 *   5. On 2xx: ack and log success
 *   6. On 4xx (non-retryable): ack and log failure
 *   7. Otherwise: retry with backoff schedule [60, 300, 900]
 *
 * @param {Message} msg
 * @param {object} env
 * @param {ExecutionContext} ctx
 */
export async function handleWebhookMessage(msg, env, ctx) {
  const { webhookId, tenantId, captureId, eventType, eventId, payload } = msg.body ?? {};

  // Look up the webhook -- it may have been deleted since the message was enqueued
  let webhook;
  try {
    webhook = await getWebhook(env.DB, webhookId, tenantId, { includeSecret: true });
  } catch (err) {
    const category = classifyDeliveryError(err, null);
    ctx.waitUntil(log(env, 4, 'webhook', {
      event: 'webhook.deliver_fail',
      webhookId,
      tenantId,
      captureId,
      webhookEvent: eventType,
      attempt: msg.attempts,
      httpStatus: null,
      durationMs: 0,
      errorCategory: category,
      retryDelaySeconds: null,
    }) ?? Promise.resolve());
    // D1 error is retryable
    const delay = webhookRetryDelay(msg.attempts);
    if (delay !== null) {
      msg.retry({ delaySeconds: delay });
    } else {
      msg.ack();
    }
    return;
  }

  if (!webhook) {
    // Webhook was deleted after the message was enqueued -- ack silently, no retry
    ctx.waitUntil(log(env, 3, 'webhook', {
      event: 'webhook.deliver_fail',
      webhookId,
      tenantId,
      captureId,
      webhookEvent: eventType,
      attempt: msg.attempts,
      httpStatus: null,
      durationMs: 0,
      errorCategory: 'webhook_deleted',
      retryDelaySeconds: null,
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  const targetHost = new URL(webhook.url).hostname;

  // Belt-and-suspenders SSRF re-validation at delivery time.
  // The URL was validated at registration, but re-validate to catch DNS rebinding
  // or any future changes to the SSRF blocklist applied retroactively.
  const urlCheck = await validateWebhookUrl(webhook.url);
  if (!urlCheck.ok) {
    ctx.waitUntil(log(env, 5, 'webhook', {
      event: 'webhook.deliver_ssrf_block',
      webhookId,
      tenantId,
      targetHost,
      captureId,
      webhookEvent: eventType,
      attempt: msg.attempts,
      ssrfDetail: urlCheck.detail,
    }) ?? Promise.resolve());
    // Non-retryable: ack immediately, do not retry
    msg.ack();
    return;
  }

  // Sign the payload. Use the exact payload string -- do NOT re-serialize.
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signWebhookPayload(webhook.secret, timestamp, payload);

  // Deliver
  const start = Date.now();
  let httpStatus = null;
  let deliveryErr = null;

  try {
    const resp = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WRL-Webhook/1.0',
        'X-WRL-Event': eventType,
        'X-WRL-Delivery': eventId,
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: `t=${timestamp},v1=${signature}`,
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });
    httpStatus = resp.status;
  } catch (err) {
    deliveryErr = err;
  }

  const durationMs = Date.now() - start;

  // 2xx: success
  if (httpStatus !== null && httpStatus >= 200 && httpStatus < 300) {
    ctx.waitUntil(log(env, 3, 'webhook', {
      event: 'webhook.deliver',
      webhookId,
      tenantId,
      targetHost,
      webhookEvent: eventType,
      captureId,
      attempt: msg.attempts,
      httpStatus,
      durationMs,
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  // Determine if retryable
  // 4xx except 408 (Request Timeout) and 429 (Too Many Requests) are non-retryable:
  // the caller rejected the payload permanently (wrong format, auth rejected, etc.)
  const isNonRetryable4xx =
    httpStatus !== null &&
    httpStatus >= 400 &&
    httpStatus < 500 &&
    httpStatus !== 408 &&
    httpStatus !== 429;

  const errorCategory = classifyDeliveryError(deliveryErr, httpStatus);

  if (isNonRetryable4xx) {
    ctx.waitUntil(log(env, 4, 'webhook', {
      event: 'webhook.deliver_fail',
      webhookId,
      tenantId,
      targetHost,
      webhookEvent: eventType,
      captureId,
      attempt: msg.attempts,
      httpStatus,
      durationMs,
      errorCategory,
      retryDelaySeconds: null,
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  // Retryable: 5xx, 408, 429, network errors, timeouts
  const delay = webhookRetryDelay(msg.attempts);

  ctx.waitUntil(log(env, 4, 'webhook', {
    event: 'webhook.deliver_fail',
    webhookId,
    tenantId,
    targetHost,
    webhookEvent: eventType,
    captureId,
    attempt: msg.attempts,
    httpStatus,
    durationMs,
    errorCategory,
    retryDelaySeconds: delay,
  }) ?? Promise.resolve());

  if (delay !== null) {
    msg.retry({ delaySeconds: delay });
  } else {
    // Schedule exhausted -- ack here (DLQ handles via dead_letter_queue config)
    msg.ack();
  }
}

// ---------------------------------------------------------------------------
// DLQ consumer: WEBHOOK_DLQ
// ---------------------------------------------------------------------------

/**
 * Terminal handler for webhook messages that exhausted all retries.
 * Logs at severity 5 (error) and acks -- no further action.
 *
 * @param {Message} msg
 * @param {object} env
 * @param {ExecutionContext} ctx
 */
export async function handleWebhookDlqMessage(msg, env, ctx) {
  const { webhookId, tenantId, captureId, eventType } = msg.body ?? {};

  // targetHost is not stored on queue messages (only IDs and payload).
  // Per-delivery logs (webhook.deliver_fail) carry targetHost and are queryable
  // in Coralogix by webhookId to reconstruct the full delivery history.

  ctx.waitUntil(log(env, 5, 'webhook', {
    event: 'webhook.deliver_dlq',
    webhookId: webhookId ?? null,
    tenantId: tenantId ?? null,
    targetHost: null,
    webhookEvent: eventType ?? null,
    captureId: captureId ?? null,
    totalAttempts: msg.attempts,
    // lastHttpStatus and lastErrorCategory are not available from the queue message body;
    // they were logged on each deliver_fail attempt and are queryable in Coralogix by webhookId.
    lastHttpStatus: null,
    lastErrorCategory: null,
  }) ?? Promise.resolve());

  msg.ack();
}

