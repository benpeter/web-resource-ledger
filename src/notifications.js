/*
 * notifications.js -- Email notification preferences API handlers
 *
 * Endpoints:
 *   GET  /v1/account/notifications  -- read preferences (session-gated)
 *   PUT  /v1/account/notifications  -- partial update (session-gated, CSRF-gated)
 *
 * Auth: all routes require a valid session cookie (__Host-wrl_session).
 * The router verifies the session and attaches it to env._session before
 * calling these handlers. Handlers read tenantId from env._session.tenantId.
 *
 * Partial update semantics: PUT accepts any subset of { email, notifications }.
 * Only keys present in the request are written; absent keys are unchanged.
 * The notifications sub-object uses merge semantics (same rule applies).
 *
 * Changing email resets emailVerified to false and sets emailSource to 'manual'.
 * Setting email to null clears it.
 *
 * Notifications are suppressed when no verified email is configured -- this
 * is enforced by the dispatch pipeline, not this module.
 */ // tva

import { jsonResponse, problemResponse } from './responses.js';
import { getNotificationPreferences, upsertNotificationPreferences, setPendingEmail, clearPendingEmail, NOTIFICATION_TYPES } from './db.js';
import { log } from './log.js';
import { generateEmailVerifyToken } from './email-verify.js';
import { emailVerificationEmail } from './email/templates/email-verification.js';
import { dispatchNotification } from './email-dispatch.js';

const ACCOUNT_CACHE = { 'Cache-Control': 'private, no-store' };

/** Synthesised defaults returned when no notification_preferences row exists. */
const DEFAULT_PREFS = {
  email: null,
  emailVerified: false,
  emailSource: 'github',
  notifications: {
    capture_failure:   true,
    approaching_limit: true,
    limit_reached:     true,
    invoice_generated: true,
    payment_failure:   true,
    weekly_digest:     true,
  },
  updatedAt: null,
};

/**
 * CSRF check shared by all mutating handlers (POST, PUT, PATCH, DELETE).
 * Returns a 403 Response if the header is absent, otherwise null.
 *
 * @param {Request} request
 * @returns {Response|null}
 */
function checkCsrf(request) {
  if (!request.headers.has('X-WRL-CSRF')) {
    return problemResponse(403, 'X-WRL-CSRF header is required', ACCOUNT_CACHE);
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /v1/account/notifications
// ---------------------------------------------------------------------------

/**
 * Return notification preferences for the authenticated tenant.
 * If no row exists, synthesises defaults (all subscribed, email null).
 *
 * @param {Request} _request
 * @param {object} env  env._session is set by the router (verified session)
 * @param {ExecutionContext} _ctx  unused
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleGetNotificationPreferences(_request, env, _ctx, _match) {
  const { tenantId } = env._session;

  const prefs = await getNotificationPreferences(env.DB, tenantId);

  if (!prefs) {
    return jsonResponse(DEFAULT_PREFS, 200, ACCOUNT_CACHE);
  }

  return jsonResponse({
    email: prefs.email,
    emailVerified: prefs.emailVerified,
    emailSource: prefs.emailSource,
    notifications: prefs.notifications,
    updatedAt: prefs.updatedAt,
    pendingEmail: prefs.pendingEmail,
    verificationSentAt: prefs.verificationSentAt,
  }, 200, ACCOUNT_CACHE);
}

// ---------------------------------------------------------------------------
// PUT /v1/account/notifications
// ---------------------------------------------------------------------------

/**
 * Partially update notification preferences for the authenticated tenant.
 *
 * Accepted top-level fields: email, notifications.
 * Both are optional -- at least one must be present.
 * Notification keys must be members of NOTIFICATION_TYPES.
 * Notification values must be booleans.
 *
 * Changing email resets emailVerified = false, emailSource = 'manual'.
 * Setting email = null clears the email address.
 *
 * @param {Request} request
 * @param {object} env  env._session is set by the router
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleUpdateNotificationPreferences(request, env, ctx, _match) {
  // CSRF defense in depth
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  // Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json', ACCOUNT_CACHE);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON', ACCOUNT_CACHE);
  }

  // Reject non-object or empty body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return problemResponse(400, 'Request body must be a JSON object', ACCOUNT_CACHE);
  }

  if (Object.keys(body).length === 0) {
    return problemResponse(400, 'Request body must not be empty', ACCOUNT_CACHE);
  }

  // Reject unknown top-level fields (same pattern as handleUpdateSettings)
  const ALLOWED_TOP_FIELDS = new Set(['email', 'notifications']);
  const unknownTop = Object.keys(body).filter(k => !ALLOWED_TOP_FIELDS.has(k));
  if (unknownTop.length > 0) {
    const field = unknownTop[0];
    return problemResponse(400, `Unknown field: '${field}'. Allowed fields: email, notifications`, ACCOUNT_CACHE);
  }

  // Validate email
  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    if (body.email !== null && typeof body.email !== 'string') {
      return problemResponse(400, "Field 'email' must be a string or null", ACCOUNT_CACHE);
    }
    if (body.email !== null) {
      if (body.email.length > 254) {
        return problemResponse(400, "Field 'email' must not exceed 254 characters", ACCOUNT_CACHE);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        return problemResponse(400, "Field 'email' must be a valid email address", ACCOUNT_CACHE);
      }
    }
  }

  // Validate notifications sub-object
  if (Object.prototype.hasOwnProperty.call(body, 'notifications')) {
    if (!body.notifications || typeof body.notifications !== 'object' || Array.isArray(body.notifications)) {
      return problemResponse(400, "Field 'notifications' must be an object", ACCOUNT_CACHE);
    }

    const VALID_NOTIF_TYPES = new Set(NOTIFICATION_TYPES);
    for (const [key, value] of Object.entries(body.notifications)) {
      if (!VALID_NOTIF_TYPES.has(key)) {
        return problemResponse(400, `Unknown notification type: '${key}'. Allowed types: ${NOTIFICATION_TYPES.join(', ')}`, ACCOUNT_CACHE);
      }
      if (typeof value !== 'boolean') {
        return problemResponse(400, `Notification value for '${key}' must be a boolean`, ACCOUNT_CACHE);
      }
    }
  }

  const { tenantId } = env._session;

  // Handle email change via pending-email flow
  const hasEmailChange = Object.prototype.hasOwnProperty.call(body, 'email');
  const hasNotificationsChange = Object.prototype.hasOwnProperty.call(body, 'notifications');

  let verificationEmailSent = false;
  let pendingEmailValue = undefined;

  if (hasEmailChange) {
    const newEmail = body.email ?? null;

    if (newEmail === null) {
      // Clearing email: also clear any pending verification
      await clearPendingEmail(env.DB, tenantId);
      // Also clear the primary email via upsert
      const clearResult = await upsertNotificationPreferences(env.DB, tenantId, { email: null });
      if (!clearResult.ok) {
        return problemResponse(400, clearResult.error, ACCOUNT_CACHE);
      }
    } else {
      // New email: rate-limit check before writing
      const currentPrefs = await getNotificationPreferences(env.DB, tenantId);
      if (currentPrefs?.verificationSentAt) {
        const sentAt = new Date(currentPrefs.verificationSentAt).getTime();
        const secondsSince = (Date.now() - sentAt) / 1000;
        if (secondsSince < 60) {
          return problemResponse(429, 'Please wait before requesting another verification email.', {
            ...ACCOUNT_CACHE,
            'Retry-After': '60',
          });
        }
      }

      // Store pending email and record send timestamp
      await setPendingEmail(env.DB, tenantId, newEmail);

      // Generate verification token and build URL
      const baseUrl = env.VERIFICATION_BASE_URL
        ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
        : 'https://api.webresourceledger.com';
      const token = await generateEmailVerifyToken(env.SESSION_SECRET, tenantId, newEmail);
      const verificationUrl = `${baseUrl}/v1/notifications/verify-email?token=${token}`;

      // Render and enqueue the transactional verification email
      const rendered = emailVerificationEmail({ verificationUrl });
      await env.EMAIL_QUEUE.send({
        tenantId,
        notificationType: 'email_verification',
        to: newEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      ctx.waitUntil(log(env, 3, 'email', {
        event: 'email.verify_send',
        tenantId,
      }) ?? Promise.resolve());

      verificationEmailSent = true;
      pendingEmailValue = newEmail;
    }
  }

  // Handle notifications-only update (or combined with email null clear)
  let notifPrefs = null;
  if (hasNotificationsChange) {
    const notifResult = await upsertNotificationPreferences(env.DB, tenantId, {
      notifications: body.notifications,
    });
    if (!notifResult.ok) {
      return problemResponse(400, notifResult.error, ACCOUNT_CACHE);
    }
    notifPrefs = notifResult.prefs;
  }

  // Read current prefs for response (always fresh from DB)
  const finalPrefs = await getNotificationPreferences(env.DB, tenantId);

  ctx.waitUntil(log(env, 3, 'oauth', {
    event: 'oauth.notification_prefs_update',
    tenantId,
    updatedFields: Object.keys(body),
    responseStatus: 200,
  }) ?? Promise.resolve());

  const responseBody = {
    email: finalPrefs?.email ?? null,
    emailVerified: finalPrefs?.emailVerified ?? false,
    emailSource: finalPrefs?.emailSource ?? 'github',
    notifications: finalPrefs?.notifications ?? notifPrefs?.notifications ?? null,
    updatedAt: finalPrefs?.updatedAt ?? null,
    pendingEmail: finalPrefs?.pendingEmail ?? null,
    verificationSentAt: finalPrefs?.verificationSentAt ?? null,
  };

  if (verificationEmailSent) {
    responseBody.verificationEmailSent = true;
    responseBody.pendingEmail = pendingEmailValue;
  }

  return jsonResponse(responseBody, 200, ACCOUNT_CACHE);
}

// ---------------------------------------------------------------------------
// POST /v1/account/notifications/resend-verification
// ---------------------------------------------------------------------------

/**
 * Resend the email verification message for the currently pending email address.
 * Session-gated and CSRF-gated.
 * Rate-limited: 429 with Retry-After: 60 if a send occurred less than 60s ago.
 *
 * @param {Request} request
 * @param {object} env  env._session is set by the router
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleResendVerification(request, env, ctx, _match) {
  // CSRF defense in depth
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  const { tenantId } = env._session;

  const prefs = await getNotificationPreferences(env.DB, tenantId);

  if (!prefs?.pendingEmail) {
    return problemResponse(400, 'No pending email verification found.', ACCOUNT_CACHE);
  }

  // Rate limit: reject if last send was less than 60 seconds ago
  if (prefs.verificationSentAt) {
    const sentAt = new Date(prefs.verificationSentAt).getTime();
    const secondsSince = (Date.now() - sentAt) / 1000;
    if (secondsSince < 60) {
      ctx.waitUntil(log(env, 4, 'email', {
        event: 'email.verify_rate_limit',
        tenantId,
      }) ?? Promise.resolve());
      return problemResponse(429, 'Please wait before requesting another verification email.', {
        ...ACCOUNT_CACHE,
        'Retry-After': '60',
      });
    }
  }

  const pendingEmail = prefs.pendingEmail;

  // Update verification_sent_at by calling setPendingEmail again with the same address
  await setPendingEmail(env.DB, tenantId, pendingEmail);

  // Generate new token and build URL
  const baseUrl = env.VERIFICATION_BASE_URL
    ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
    : 'https://api.webresourceledger.com';
  const token = await generateEmailVerifyToken(env.SESSION_SECRET, tenantId, pendingEmail);
  const verificationUrl = `${baseUrl}/v1/notifications/verify-email?token=${token}`;

  // Render and enqueue
  const rendered = emailVerificationEmail({ verificationUrl });
  await env.EMAIL_QUEUE.send({
    tenantId,
    notificationType: 'email_verification',
    to: pendingEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  ctx.waitUntil(log(env, 3, 'email', {
    event: 'email.verify_send',
    tenantId,
  }) ?? Promise.resolve());

  return jsonResponse({ sent: true }, 200, ACCOUNT_CACHE);
}

// ---------------------------------------------------------------------------
// Weekly digest cron handler
// ---------------------------------------------------------------------------

/** Maximum tenants processed per weekly digest invocation. */
const WEEKLY_DIGEST_TENANT_LIMIT = 50;

/**
 * Send weekly digest emails to all eligible tenants.
 *
 * Eligible tenants must:
 *   - Have at least one active (non-paused) schedule
 *   - Have notify_weekly_digest = 1 in notification_preferences
 *   - Have email_verified = 1 in notification_preferences
 *
 * Skips tenants with zero captures in the last 7 days.
 * Limited to WEEKLY_DIGEST_TENANT_LIMIT tenants per invocation.
 * Deduplication uses notification_sent with YYYY-MM period key.
 *
 * @param {object} env  Worker env bindings
 */
export async function handleWeeklyDigest(env) {
  const now = new Date();
  const periodEnd = now.toISOString();
  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // YYYY-MM period key for deduplication (monthly, matching notification_sent CHECK constraint)
  const dedupPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const baseUrl = env.VERIFICATION_BASE_URL
    ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
    : 'https://api.webresourceledger.com';

  // Query tenants with active schedules + digest preference + verified email.
  // Uses DISTINCT to avoid duplicates when a tenant has multiple active schedules.
  let tenantRows;
  try {
    const result = await env.DB.prepare(`
      SELECT DISTINCT np.tenant_id
      FROM notification_preferences np
      INNER JOIN schedules s ON s.tenant_id = np.tenant_id AND s.paused = 0
      WHERE np.notify_weekly_digest = 1
        AND np.email_verified = 1
      LIMIT ?
    `).bind(WEEKLY_DIGEST_TENANT_LIMIT).all();
    tenantRows = result.results ?? [];
  } catch (err) {
    log(env, 4, 'email', {
      event: 'email.digest_error',
      phase: 'tenant_query',
      error: err?.message,
    });
    return;
  }

  if (tenantRows.length === WEEKLY_DIGEST_TENANT_LIMIT) {
    log(env, 4, 'email', {
      event: 'email.digest_limit_hit',
      limit: WEEKLY_DIGEST_TENANT_LIMIT,
    });
  }

  log(env, 3, 'email', {
    event: 'email.digest_start',
    tenantCount: tenantRows.length,
    periodStart,
    periodEnd,
  });

  for (const row of tenantRows) {
    const tenantId = row.tenant_id;
    try {
      await sendWeeklyDigestForTenant(env, tenantId, periodStart, periodEnd, dedupPeriod, baseUrl);
    } catch (err) {
      log(env, 4, 'email', {
        event: 'email.dispatch_error',
        error: err?.message,
        tenantId,
      });
    }
  }
}

/**
 * Query schedule execution results and dispatch digest for one tenant.
 *
 * @param {object} env
 * @param {string} tenantId
 * @param {string} periodStart  ISO timestamp
 * @param {string} periodEnd    ISO timestamp
 * @param {string} dedupPeriod  YYYY-MM string for notification_sent
 * @param {string} baseUrl
 */
async function sendWeeklyDigestForTenant(env, tenantId, periodStart, periodEnd, dedupPeriod, baseUrl) {
  // Query captures for this tenant in the period, grouped by schedule URL
  const captureResult = await env.DB.prepare(`
    SELECT s.url, COUNT(c.id) AS total,
           SUM(CASE WHEN c.status = 'complete' THEN 1 ELSE 0 END) AS succeeded,
           SUM(CASE WHEN c.status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM schedules s
    LEFT JOIN captures c ON c.schedule_id = s.id
      AND c.created_at >= ?
      AND c.created_at < ?
    WHERE s.tenant_id = ? AND s.paused = 0
    GROUP BY s.id, s.url
  `).bind(periodStart, periodEnd, tenantId).all();

  const schedules = (captureResult.results ?? []).map(r => ({
    url: r.url,
    total: r.total ?? 0,
    succeeded: r.succeeded ?? 0,
    failed: r.failed ?? 0,
  }));

  // Skip if no captures at all in the period
  const totalCaptures = schedules.reduce((sum, s) => sum + s.total, 0);
  if (totalCaptures === 0) {
    log(env, 3, 'email', {
      event: 'email.dispatch_suppressed',
      tenantId,
      notificationType: 'weekly_digest',
      suppressionReason: 'no_captures_in_period',
    });
    return;
  }

  await dispatchNotification(env, tenantId, 'weekly_digest', {
    periodStart,
    periodEnd,
    schedules,
    dashboardUrl: `${baseUrl}/ui`,
  });
}
