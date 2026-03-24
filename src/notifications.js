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
import { getNotificationPreferences, upsertNotificationPreferences, NOTIFICATION_TYPES } from './db.js';
import { log } from './log.js';

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

  // Build the fields object for the db layer
  const fields = {};
  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    fields.email = body.email ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notifications')) {
    fields.notifications = body.notifications;
  }

  const result = await upsertNotificationPreferences(env.DB, tenantId, fields);

  if (!result.ok) {
    return problemResponse(400, result.error, ACCOUNT_CACHE);
  }

  ctx.waitUntil(log(env, 3, 'oauth', {
    event: 'oauth.notification_prefs_update',
    tenantId,
    updatedFields: Object.keys(body),
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse({
    email: result.prefs.email,
    emailVerified: result.prefs.emailVerified,
    emailSource: result.prefs.emailSource,
    notifications: result.prefs.notifications,
    updatedAt: result.prefs.updatedAt,
  }, 200, ACCOUNT_CACHE);
}
