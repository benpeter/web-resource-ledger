/*
 * schedules.js -- CRUD HTTP handlers for WRL scheduled capture registrations
 *
 * Endpoints:
 *   POST   /v1/schedules                        -- create a schedule
 *   GET    /v1/schedules                        -- list schedules for tenant
 *   GET    /v1/schedules/:scheduleId            -- get a single schedule
 *   DELETE /v1/schedules/:scheduleId            -- delete a schedule
 *
 * Auth: all routes support dual auth (session cookie or API key with 'capture' scope).
 *
 * Security invariants:
 *   - URL validated through validateUrl() for SSRF protection.
 *   - Cron expression validated through validateCron() for safety and minimum interval.
 *   - Schedule IDs validated by route regex before handlers are invoked.
 *   - Per-tenant schedule limit enforced before insert.
 */ // tva

import { jsonResponse, problemResponse } from './responses.js';
import { verifyApiKey } from './auth.js';
import { verifySession } from './session.js';
import { validateUrl } from './url-validation.js';
import { validateCron, nextRun } from './cron.js';
import {
  createSchedule,
  getSchedule,
  listSchedules,
  deleteSchedule,
  countSchedules,
  getTenantConfig,
  getEffectiveScheduleLimit,
} from './db.js';
import { log } from './log.js';
import { trackEvent } from './pirsch.js';

const NAME_RE = /^[a-zA-Z0-9 _.:-]{1,128}$/;
const ALLOWED_CREATE_FIELDS = new Set(['url', 'cron', 'name']);

// ---------------------------------------------------------------------------
// Local dual auth: session cookie first, then API key
// ---------------------------------------------------------------------------

async function verifyAuth(request, env, options) {
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader && cookieHeader.includes('__Host-wrl_session')) {
    const session = await verifySession(request, env);
    if (session.ok) {
      return {
        ok: true,
        tenantId: session.tenantId,
        authMethod: 'session',
        keyName: null,
        keyHashPrefix: null,
      };
    }
  }
  return verifyApiKey(request, env, options);
}

// ---------------------------------------------------------------------------
// POST /v1/schedules -- create schedule
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match
 */
export async function handleCreateSchedule(request, env, ctx, _match) {
  const auth = await verifyAuth(request, env, { requiredScope: 'capture' });
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  // Reject unknown fields
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const unknown = Object.keys(body).filter(k => !ALLOWED_CREATE_FIELDS.has(k));
    if (unknown.length > 0) {
      return problemResponse(400, `Unknown field(s): ${unknown.map(f => `'${f}'`).join(', ')}. Allowed fields: url, cron, name`);
    }
  }

  // Validate name
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'name')) {
    return problemResponse(400, "Field 'name' is required");
  }
  if (typeof body.name !== 'string') {
    return problemResponse(400, "Field 'name' must be a string");
  }
  if (!NAME_RE.test(body.name)) {
    return problemResponse(400, "Field 'name' must be 1-128 characters using letters, digits, spaces, and _ . : -");
  }

  // Validate url
  if (!Object.prototype.hasOwnProperty.call(body, 'url')) {
    return problemResponse(400, "Field 'url' is required");
  }
  if (typeof body.url !== 'string') {
    return problemResponse(400, "Field 'url' must be a string");
  }
  const urlCheck = await validateUrl(body.url);
  if (!urlCheck.ok) {
    return problemResponse(urlCheck.status, urlCheck.detail);
  }

  // Validate cron
  if (!Object.prototype.hasOwnProperty.call(body, 'cron')) {
    return problemResponse(400, "Field 'cron' is required");
  }
  if (typeof body.cron !== 'string') {
    return problemResponse(400, "Field 'cron' must be a string");
  }
  const cronCheck = validateCron(body.cron);
  if (!cronCheck.ok) {
    return problemResponse(400, cronCheck.detail);
  }

  // Count check: enforce per-tenant schedule limit
  const tenantConfig = await getTenantConfig(env.DB, auth.tenantId);
  const scheduleLimit = getEffectiveScheduleLimit(tenantConfig);
  const count = await countSchedules(env.DB, auth.tenantId);
  if (count >= scheduleLimit) {
    return problemResponse(429, `Schedule limit reached (${scheduleLimit}). Delete an existing schedule to create a new one.`);
  }

  // Generate ID and compute first run time
  const id = 'sch_' + crypto.randomUUID().replace(/-/g, '');
  const nextRunAt = nextRun(cronCheck.cron);

  const record = await createSchedule(env.DB, id, auth.tenantId, urlCheck.url, body.name, cronCheck.cron, nextRunAt);

  ctx.waitUntil(log(env, 3, 'schedule', {
    event: 'schedule.created',
    scheduleId: id,
    tenantId: auth.tenantId,
    url: urlCheck.url,
    cron: cronCheck.cron,
    keyHashPrefix: auth.keyHashPrefix,
    authMethod: auth.authMethod,
    responseStatus: 201,
  }) ?? Promise.resolve());

  ctx.waitUntil(trackEvent(request, env, 'Schedule Created', {
    tenantId: auth.tenantId,
    scheduleId: id,
  }, { property: 'api' }) ?? Promise.resolve());

  return jsonResponse(record, 201);
}

// ---------------------------------------------------------------------------
// GET /v1/schedules -- list schedules for tenant
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match
 */
export async function handleListSchedules(request, env, ctx, _match) {
  const auth = await verifyAuth(request, env, { requiredScope: 'capture' });
  if (!auth.ok) return auth.response;

  const records = await listSchedules(env.DB, auth.tenantId);

  ctx.waitUntil(log(env, 3, 'schedule', {
    event: 'schedule.list',
    tenantId: auth.tenantId,
    count: records.length,
    keyHashPrefix: auth.keyHashPrefix,
    authMethod: auth.authMethod,
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse({ data: records });
}

// ---------------------------------------------------------------------------
// GET /v1/schedules/:scheduleId -- get a single schedule
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} match  match[1] = scheduleId (validated by route regex)
 */
export async function handleGetSchedule(request, env, ctx, match) {
  const auth = await verifyAuth(request, env, { requiredScope: 'capture' });
  if (!auth.ok) return auth.response;

  const scheduleId = match[1];

  const record = await getSchedule(env.DB, scheduleId, auth.tenantId);
  if (!record) {
    return problemResponse(404, `Schedule '${scheduleId}' not found.`);
  }

  ctx.waitUntil(log(env, 3, 'schedule', {
    event: 'schedule.get',
    scheduleId,
    tenantId: auth.tenantId,
    keyHashPrefix: auth.keyHashPrefix,
    authMethod: auth.authMethod,
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse(record);
}

// ---------------------------------------------------------------------------
// DELETE /v1/schedules/:scheduleId -- delete a schedule
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} match  match[1] = scheduleId (validated by route regex)
 */
export async function handleDeleteSchedule(request, env, ctx, match) {
  const auth = await verifyAuth(request, env, { requiredScope: 'capture' });
  if (!auth.ok) return auth.response;

  const scheduleId = match[1];

  const result = await deleteSchedule(env.DB, scheduleId, auth.tenantId);

  if (!result) {
    // Same 404 for nonexistent AND another tenant's schedule -- no information disclosure
    ctx.waitUntil(log(env, 3, 'schedule', {
      event: 'schedule.deleted',
      scheduleId,
      tenantId: auth.tenantId,
      found: false,
      keyHashPrefix: auth.keyHashPrefix,
      authMethod: auth.authMethod,
      responseStatus: 404,
    }) ?? Promise.resolve());
    return problemResponse(404, `Schedule '${scheduleId}' not found.`);
  }

  ctx.waitUntil(log(env, 3, 'schedule', {
    event: 'schedule.deleted',
    scheduleId,
    tenantId: auth.tenantId,
    found: true,
    keyHashPrefix: auth.keyHashPrefix,
    authMethod: auth.authMethod,
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse({ id: scheduleId, deleted: true });
}
