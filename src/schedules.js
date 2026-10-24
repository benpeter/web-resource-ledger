/*
 * schedules.js -- CRUD HTTP handlers for WRL scheduled capture registrations
 *
 * Endpoints:
 *   POST   /v1/schedules                        -- create a schedule
 *   GET    /v1/schedules                        -- list schedules for tenant
 *   GET    /v1/schedules/:scheduleId            -- get a single schedule
 *   PATCH  /v1/schedules/:scheduleId            -- edit name/url/cron, pause or resume
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
  updateSchedule,
  deleteSchedule,
  countSchedules,
  getTenantConfig,
  getEffectiveScheduleLimit,
} from './db.js';
import { log } from './log.js';
import { trackServerEvent } from './pirsch.js';
import { isAnalyticsExcluded } from './analytics.js';

const NAME_RE = /^[a-zA-Z0-9 _.:-]{1,128}$/;
const ALLOWED_CREATE_FIELDS = new Set(['url', 'cron', 'name']);
const ALLOWED_UPDATE_FIELDS = ['name', 'url', 'cron', 'paused'];

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

  // Server event: API clients aren't browsers, so Pirsch's bot filter would drop
  // a normal event. No tenant or schedule ids (see src/analytics.js).
  if (!isAnalyticsExcluded(env, auth.tenantId)) {
    ctx.waitUntil(trackServerEvent(env, 'Schedule Created', {
      path: '/v1/schedules',
      ip: request.headers.get('CF-Connecting-IP'),
      userAgent: request.headers.get('User-Agent'),
      meta: { source: auth.authMethod === 'session' ? 'dashboard' : 'api' },
    }) ?? Promise.resolve());
  }

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
// Schedule update checks, shared by PATCH /v1/schedules/:id and the MCP
// update_schedule tool
// ---------------------------------------------------------------------------

/**
 * Validate a schedule update body. url goes through validateUrl (SSRF) and
 * cron through validateCron (hourly minimum), as on create.
 *
 * @param {unknown} body
 * @returns {Promise<{ ok: true, fields: { name?: string, url?: string, cron?: string, paused?: boolean } } | { ok: false, status: number, detail: string }>}
 */
export async function validateScheduleUpdate(body) {
  const fail = (status, detail) => ({ ok: false, status, detail });
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'Request body must be a JSON object');
  }
  const unknown = Object.keys(body).filter((k) => !ALLOWED_UPDATE_FIELDS.includes(k));
  if (unknown.length > 0) {
    return fail(400, `Unknown field(s): ${unknown.map((f) => `'${f}'`).join(', ')}. Allowed fields: ${ALLOWED_UPDATE_FIELDS.join(', ')}`);
  }
  if (Object.keys(body).length === 0) {
    return fail(400, `Provide at least one field to change: ${ALLOWED_UPDATE_FIELDS.join(', ')}`);
  }

  const fields = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    if (typeof body.name !== 'string' || !NAME_RE.test(body.name)) {
      return fail(400, "Field 'name' must be 1-128 characters using letters, digits, spaces, and _ . : -");
    }
    fields.name = body.name;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'url')) {
    if (typeof body.url !== 'string') {
      return fail(400, "Field 'url' must be a string");
    }
    const urlCheck = await validateUrl(body.url);
    if (!urlCheck.ok) {
      return fail(urlCheck.status, urlCheck.detail);
    }
    fields.url = urlCheck.url;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'cron')) {
    if (typeof body.cron !== 'string') {
      return fail(400, "Field 'cron' must be a string");
    }
    const cronCheck = validateCron(body.cron);
    if (!cronCheck.ok) {
      return fail(400, cronCheck.detail);
    }
    fields.cron = cronCheck.cron;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'paused')) {
    if (typeof body.paused !== 'boolean') {
      return fail(400, "Field 'paused' must be true or false");
    }
    fields.paused = body.paused;
  }

  return { ok: true, fields };
}

/**
 * Add the next run time when the update needs one: a changed cron, or
 * resuming a paused schedule. Resuming never fires missed runs at once.
 *
 * @param {object} fields    From validateScheduleUpdate
 * @param {object} existing  The current schedule record
 * @returns {object}         fields, plus nextRunAt when it changes
 */
export function withNextRun(fields, existing) {
  const cronChanged = fields.cron !== undefined && fields.cron !== existing.cron;
  const resuming = existing.paused && fields.paused === false;
  if (!cronChanged && !resuming) return fields;
  return { ...fields, nextRunAt: nextRun(fields.cron ?? existing.cron) };
}

// ---------------------------------------------------------------------------
// PATCH /v1/schedules/:scheduleId -- edit or pause a schedule
// ---------------------------------------------------------------------------

/**
 * Change any of name, url, cron and paused. A new cron, or resuming a paused
 * schedule, sets the next run to the next cron time from now, so resuming
 * never fires a backlog of missed runs at once. Pausing keeps next_run_at;
 * the scheduler skips paused schedules.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} match  match[1] = scheduleId (validated by route regex)
 */
export async function handleUpdateSchedule(request, env, ctx, match) {
  const auth = await verifyAuth(request, env, { requiredScope: 'capture' });
  if (!auth.ok) return auth.response;

  const scheduleId = match[1];

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
  const check = await validateScheduleUpdate(body);
  if (!check.ok) return problemResponse(check.status, check.detail);
  const fields = check.fields;

  const existing = await getSchedule(env.DB, scheduleId, auth.tenantId);
  if (!existing) {
    return problemResponse(404, `Schedule '${scheduleId}' not found.`);
  }

  const record = await updateSchedule(env.DB, scheduleId, auth.tenantId, withNextRun(fields, existing));
  if (!record) {
    // Deleted between the read and the write
    return problemResponse(404, `Schedule '${scheduleId}' not found.`);
  }

  ctx.waitUntil(log(env, 3, 'schedule', {
    event: 'schedule.updated',
    scheduleId,
    tenantId: auth.tenantId,
    changed: Object.keys(fields),
    paused: record.paused,
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
