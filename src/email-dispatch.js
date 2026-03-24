/*
 * email-dispatch.js -- Email notification dispatch, delivery, and queue handlers
 *
 * Three responsibilities:
 *   1. dispatchNotification() -- called by event triggers (billing, capture, cron);
 *      checks preferences, deduplicates, renders template, enqueues to EMAIL_QUEUE.
 *   2. handleEmailMessage()   -- queue consumer; POSTs to Resend API, retries on
 *      transient failures, acks permanently on 4xx.
 *   3. handleEmailDlqMessage() -- DLQ consumer; logs exhausted deliveries.
 *
 * Suppression logic:
 *   - No verified email configured           -> suppressed (no-op, logged)
 *   - Notification type opted out            -> suppressed (no-op, logged)
 *   - Threshold notifs already sent (period) -> suppressed (dedup, logged)
 *   - Capture failure: >3 per hour           -> suppressed (rate limit, logged)
 *
 * Retry schedule (based on msg.attempts):
 *   Attempt 1 -> retry after 60s
 *   Attempt 2 -> retry after 300s (5 min)
 *   Attempt 3 -> retry after 900s (15 min)
 *   After max_retries, message lands in DLQ.
 *
 * Non-retryable conditions:
 *   - 400/422 from Resend (permanent format/validation failure)
 *   - 401/403 from Resend (API key issue -- ack to avoid retrying invalid creds)
 *
 * Security invariants:
 *   - Email addresses are NEVER logged -- tenantId only.
 *   - Queue messages contain tenant email (PII). Never log msg.body.to.
 *   - Unsubscribe tokens are generated fresh per-dispatch.
 *
 * Tests: test/email-dispatch.test.js
 */ // tva

import { log } from './log.js';
import { getNotificationPreferences, checkNotificationSent, markNotificationSent } from './db.js';
import { generateUnsubscribeToken } from './unsubscribe.js';
import { captureFailureEmail } from './email/templates/capture-failure.js';
import { approachingLimitEmail } from './email/templates/approaching-limit.js';
import { limitReachedEmail } from './email/templates/limit-reached.js';
import { invoiceGeneratedEmail } from './email/templates/invoice-generated.js';
import { paymentFailureEmail } from './email/templates/payment-failure.js';
import { weeklyDigestEmail } from './email/templates/weekly-digest.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FROM_ADDRESS = 'WRL Notifications <notifications@webresourceledger.com>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Notification types that use period-based deduplication (sent at most once per YYYY-MM period).
 * The notification_sent schema enforces YYYY-MM format -- hourly or daily keys are not supported.
 * capture_failure is included here to limit alerts to one per billing month.
 */
const PERIOD_DEDUP_TYPES = new Set(['approaching_limit', 'limit_reached', 'capture_failure']);

/**
 * Retry delay schedule in seconds (1-indexed by attempt number).
 * Returns null when the attempt exceeds the schedule (message should ack to DLQ).
 *
 * @param {number} attempt  1-based attempt number
 * @returns {number|null}
 */
function emailRetryDelay(attempt) {
  const schedule = [60, 300, 900];
  return attempt <= schedule.length ? schedule[attempt - 1] : null;
}

/**
 * Classify an HTTP or network error for structured logging.
 * Mirrors classifyDeliveryError in webhook-dispatch.js.
 *
 * @param {Error|null} err
 * @param {number|null} httpStatus
 * @returns {string}
 */
function classifyEmailError(err, httpStatus) {
  if (httpStatus !== null) {
    return httpStatus >= 500 ? 'http_5xx' : 'http_4xx';
  }
  const msg = String(err?.message ?? '');
  if (err?.name === 'TimeoutError' || msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || msg.includes('DNS')) return 'dns';
  if (msg.includes('certificate') || msg.includes('TLS') || msg.includes('SSL') || msg.includes('CERT')) return 'tls';
  return 'connection';
}

/**
 * Build the full unsubscribe URL for the notification.
 *
 * @param {object} env
 * @param {string} tenantId
 * @param {string} notificationType
 * @returns {Promise<string>}
 */
async function buildUnsubscribeUrl(env, tenantId, notificationType) {
  const token = await generateUnsubscribeToken(env.SESSION_SECRET, tenantId, notificationType);
  const base = env.VERIFICATION_BASE_URL
    ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
    : 'https://api.webresourceledger.com';
  return `${base}/v1/notifications/unsubscribe?token=${token}`;
}

/**
 * Render the email HTML, text, and subject for a given notification type.
 *
 * @param {string} notificationType
 * @param {object} templateData
 * @param {string} unsubscribeUrl
 * @returns {{ html: string, text: string, subject: string }}
 */
function renderTemplate(notificationType, templateData, unsubscribeUrl) {
  const data = { ...templateData, unsubscribeUrl };

  switch (notificationType) {
    case 'capture_failure':   return captureFailureEmail(data);
    case 'approaching_limit': return approachingLimitEmail(data);
    case 'limit_reached':     return limitReachedEmail(data);
    case 'invoice_generated': return invoiceGeneratedEmail(data);
    case 'payment_failure':   return paymentFailureEmail(data);
    case 'weekly_digest':     return weeklyDigestEmail(data);
    default:
      throw new Error(`Unknown notification type: ${notificationType}`);
  }
}

// ---------------------------------------------------------------------------
// Dispatch entry point
// ---------------------------------------------------------------------------

/**
 * Check preferences, deduplicate, render template, enqueue to EMAIL_QUEUE.
 *
 * NEVER THROWS. All errors are caught and logged. Callers use
 * ctx.waitUntil(dispatchNotification(...)) and must be able to rely on this.
 *
 * All deduplication uses the notification_sent table with YYYY-MM period keys.
 * This limits capture_failure, approaching_limit, and limit_reached to one email
 * per tenant per billing month. invoice_generated, payment_failure, and
 * weekly_digest are not deduplicated (callers control dispatch frequency).
 *
 * @param {object} env
 * @param {string} tenantId
 * @param {string} notificationType  Must match a NOTIFICATION_TYPES member
 * @param {object} templateData      Type-specific data object passed to the template
 */
export async function dispatchNotification(env, tenantId, notificationType, templateData) {
  try {
    // 1. Load notification preferences
    let prefs;
    try {
      prefs = await getNotificationPreferences(env.DB, tenantId);
    } catch (err) {
      log(env, 4, 'email', {
        event: 'email.dispatch_error',
        tenantId,
        notificationType,
        phase: 'load_prefs',
        errorCategory: classifyEmailError(err, null),
      });
      return;
    }

    // 2. Check email configured and verified
    if (!prefs || !prefs.email || !prefs.emailVerified) {
      log(env, 3, 'email', {
        event: 'email.dispatch_suppressed',
        tenantId,
        notificationType,
        suppressionReason: !prefs || !prefs.email ? 'no_email_configured' : 'email_not_verified',
      });
      return;
    }

    // 3. Check opt-in for this notification type
    const optedIn = prefs.notifications && prefs.notifications[notificationType];
    if (!optedIn) {
      log(env, 3, 'email', {
        event: 'email.dispatch_suppressed',
        tenantId,
        notificationType,
        suppressionReason: 'opted_out',
      });
      return;
    }

    // 4. Period-based deduplication for threshold notifications
    if (PERIOD_DEDUP_TYPES.has(notificationType)) {
      // period key: YYYY-MM (once per billing month)
      const now = new Date();
      const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      let alreadySent;
      try {
        alreadySent = await checkNotificationSent(env.DB, tenantId, period, notificationType);
      } catch (err) {
        log(env, 4, 'email', {
          event: 'email.dispatch_error',
          tenantId,
          notificationType,
          phase: 'check_dedup',
          errorCategory: classifyEmailError(err, null),
        });
        return;
      }

      if (alreadySent) {
        log(env, 3, 'email', {
          event: 'email.dispatch_suppressed',
          tenantId,
          notificationType,
          suppressionReason: 'already_sent_this_period',
          period,
        });
        return;
      }

      // Record BEFORE enqueuing to prevent races
      try {
        await markNotificationSent(env.DB, tenantId, period, notificationType);
      } catch (err) {
        log(env, 4, 'email', {
          event: 'email.dispatch_error',
          tenantId,
          notificationType,
          phase: 'mark_sent',
          errorCategory: classifyEmailError(err, null),
        });
        return;
      }
    }

    // 5. Generate unsubscribe URL and render template
    let unsubscribeUrl;
    try {
      unsubscribeUrl = await buildUnsubscribeUrl(env, tenantId, notificationType);
    } catch (err) {
      log(env, 4, 'email', {
        event: 'email.dispatch_error',
        tenantId,
        notificationType,
        phase: 'build_unsubscribe_url',
        errorCategory: classifyEmailError(err, null),
      });
      return;
    }

    let rendered;
    try {
      rendered = renderTemplate(notificationType, templateData, unsubscribeUrl);
    } catch (err) {
      log(env, 4, 'email', {
        event: 'email.dispatch_error',
        tenantId,
        notificationType,
        phase: 'render_template',
        errorCategory: 'template_error',
      });
      return;
    }

    // 6. Enqueue the email message
    try {
      await env.EMAIL_QUEUE.send({
        tenantId,
        notificationType,
        to: prefs.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        unsubscribeUrl,
      });
    } catch (err) {
      log(env, 4, 'email', {
        event: 'email.dispatch_error',
        tenantId,
        notificationType,
        phase: 'enqueue',
        errorCategory: classifyEmailError(err, null),
      });
      return;
    }

    log(env, 3, 'email', {
      event: 'email.dispatch',
      tenantId,
      notificationType,
    });

  } catch (err) {
    // Outer safety net -- should not be reached, but ensures the function never throws
    log(env, 5, 'email', {
      event: 'email.dispatch_error',
      tenantId,
      notificationType,
      phase: 'unexpected',
      errorCategory: classifyEmailError(err, null),
    });
  }
}

// ---------------------------------------------------------------------------
// Queue consumer: EMAIL_QUEUE
// ---------------------------------------------------------------------------

/**
 * Deliver one email message from the queue via the Resend API.
 *
 * Uses direct fetch() -- the Resend npm SDK is NOT used.
 *
 * Flow:
 *   1. POST to https://api.resend.com/emails
 *   2. On 2xx: ack and log success
 *   3. On 400/422 (permanent format failure): ack and log failure (no retry)
 *   4. On 401/403 (API key issue): ack at severity 5 (no retry -- bad key won't fix itself)
 *   5. On 429 or 5xx: retry with backoff
 *   6. On network error: retry
 *
 * NOTE: Queue messages contain tenant email (PII). Never log msg.body.to.
 *
 * @param {object} msg    Cloudflare Queue message
 * @param {object} env
 * @param {ExecutionContext} ctx
 */
export async function handleEmailMessage(msg, env, ctx) {
  // NOTE: Queue messages contain tenant email (PII). Never log msg.body.to.
  const { tenantId, notificationType, to, subject, html, text, unsubscribeUrl } = msg.body ?? {};

  const start = Date.now();
  let httpStatus = null;
  let deliveryErr = null;
  let emailId = null;

  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html,
        text,
        headers: {
          // RFC 8058 one-click unsubscribe headers
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    httpStatus = resp.status;

    if (httpStatus >= 200 && httpStatus < 300) {
      try {
        const body = await resp.json();
        emailId = body?.id ?? null;
      } catch {
        // Non-fatal: response parse failure does not affect ack decision
      }
    }
  } catch (err) {
    deliveryErr = err;
  }

  const durationMs = Date.now() - start;

  // 2xx: success
  if (httpStatus !== null && httpStatus >= 200 && httpStatus < 300) {
    ctx.waitUntil(log(env, 3, 'email', {
      event: 'email.send',
      tenantId,
      notificationType,
      emailId,
      durationMs,
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  const errorCategory = classifyEmailError(deliveryErr, httpStatus);

  // 400/422: permanent format/validation failure -- ack, do not retry
  if (httpStatus === 400 || httpStatus === 422) {
    ctx.waitUntil(log(env, 4, 'email', {
      event: 'email.send_fail',
      tenantId,
      notificationType,
      httpStatus,
      durationMs,
      errorCategory,
      retryDelaySeconds: null,
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  // 401/403: API key issue -- ack at severity 5, do not retry
  if (httpStatus === 401 || httpStatus === 403) {
    ctx.waitUntil(log(env, 5, 'email', {
      event: 'email.send_fail',
      tenantId,
      notificationType,
      httpStatus,
      durationMs,
      errorCategory,
      retryDelaySeconds: null,
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  // 429, 5xx, network errors: retryable
  const delay = emailRetryDelay(msg.attempts);

  ctx.waitUntil(log(env, 4, 'email', {
    event: 'email.send_fail',
    tenantId,
    notificationType,
    httpStatus,
    durationMs,
    errorCategory,
    retryDelaySeconds: delay,
  }) ?? Promise.resolve());

  if (delay !== null) {
    msg.retry({ delaySeconds: delay });
  } else {
    // Schedule exhausted -- ack (DLQ handles via dead_letter_queue config)
    msg.ack();
  }
}

// ---------------------------------------------------------------------------
// DLQ consumer: EMAIL_DLQ
// ---------------------------------------------------------------------------

/**
 * Terminal handler for email messages that exhausted all retries.
 * Logs at severity 5 and acks -- no further action.
 *
 * @param {object} msg
 * @param {object} env
 * @param {ExecutionContext} ctx
 */
export async function handleEmailDlqMessage(msg, env, ctx) {
  // NOTE: Queue messages contain tenant email (PII). Never log msg.body.to.
  const { tenantId, notificationType } = msg.body ?? {};

  ctx.waitUntil(log(env, 5, 'email', {
    event: 'email.send_dlq',
    tenantId: tenantId ?? null,
    notificationType: notificationType ?? null,
    totalAttempts: msg.attempts,
  }) ?? Promise.resolve());

  msg.ack();
}
