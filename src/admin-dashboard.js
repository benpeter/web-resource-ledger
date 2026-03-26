/*
 * admin-dashboard.js -- Admin API handlers for operator dashboard views
 *
 * Endpoints:
 *   GET /v1/admin/tenants          -- list all tenants with current-period usage
 *   GET /v1/admin/tenants/:id      -- detail view for a single tenant
 *   GET /v1/admin/overview         -- platform-wide aggregate statistics
 *
 * Auth: all routes use verifyAdminKey (infrastructure secret), NOT verifyApiKey.
 * Rate limit: ADMIN_RATE_LIMITER, 30 req/60s per IP.
 *
 * Security invariants:
 *   - Raw config JSON is NOT returned on the list endpoint; only on tenant detail.
 *   - payment_method_added_at timestamp is mapped to hasPaymentMethod boolean on list.
 *   - All responses set Cache-Control: private, no-store.
 */ // tva

import { jsonResponse, problemResponse } from './responses.js';
import { listTenantsWithUsage, getTenantDetail, getOverviewStats, computePeriod } from './db.js';
import { getEffectiveQuota } from './quotas.js';
import { log } from './log.js';
import { computeCip } from './ip-hash.js';

const ADMIN_CACHE = { 'Cache-Control': 'private, no-store' };
const PERIOD_RE = /^\d{4}-\d{2}$/;

/**
 * GET /v1/admin/tenants -- list all tenants with usage for a billing period
 *
 * Query params:
 *   period (optional) -- billing period in YYYY-MM format (defaults to current)
 */
export async function handleAdminListTenants(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const params = new URL(request.url).searchParams;
  const periodParam = params.get('period');

  let period;
  if (periodParam !== null) {
    if (!PERIOD_RE.test(periodParam)) {
      return problemResponse(400, "Query parameter 'period' must be in YYYY-MM format");
    }
    period = periodParam;
  } else {
    period = computePeriod();
  }

  const rows = await listTenantsWithUsage(env.DB, period);

  const data = rows.map(row => {
    const hasPaymentMethod = row.paymentMethodAddedAt !== null;
    const parsedConfig = row.config ? JSON.parse(row.config) : null;
    const quota = getEffectiveQuota(hasPaymentMethod, parsedConfig);

    return {
      tenantId: row.id,
      tier: row.tier,
      billingStatus: row.billingStatus,
      hasPaymentMethod,
      eidasQualified: row.eidasQualified,
      createdAt: row.createdAt,
      currentPeriod: {
        period,
        captureCount: row.captureCount,
        eidasCaptureCount: row.eidasCaptureCount,
        storageBytes: row.storageBytes,
        apiCallCount: row.apiCallCount,
      },
      quota,
      keyCount: row.keyCount,
    };
  });

  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.list_tenants',
    count: data.length,
    period,
    authMethod: 'admin_key',
    responseStatus: 200,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({
    data,
    meta: {
      totalTenants: data.length,
      period,
    },
  }, 200, ADMIN_CACHE);
}

/**
 * GET /v1/admin/tenants/:id -- detail view for a single tenant
 *
 * Route match: match[1] is the tenant ID captured by the route regex.
 *
 * Query params:
 *   periods (optional) -- number of billing periods of history to return
 *                         (positive integer, default 6, max 24)
 */
export async function handleAdminGetTenant(request, env, ctx, match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const tenantId = match[1];

  const params = new URL(request.url).searchParams;
  const periodsParam = params.get('periods');

  let periods;
  if (periodsParam !== null) {
    const parsed = Number(periodsParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24) {
      return problemResponse(400, "Query parameter 'periods' must be a positive integer between 1 and 24");
    }
    periods = parsed;
  } else {
    periods = 6;
  }

  const detail = await getTenantDetail(env.DB, tenantId, periods);

  if (detail === null) {
    ctx.waitUntil(log(env, 4, 'admin', {
      event: 'admin.get_tenant_fail',
      tenantId,
      reason: 'not_found',
      authMethod: 'admin_key',
      responseStatus: 404,
      cip,
    }) ?? Promise.resolve());
    return problemResponse(404, `Tenant '${tenantId}' not found`, ADMIN_CACHE);
  }

  const { tenant, usageHistory, keys } = detail;
  const hasPaymentMethod = tenant.paymentMethodAddedAt !== null;
  const parsedConfig = tenant.config ? JSON.parse(tenant.config) : null;
  const quota = getEffectiveQuota(hasPaymentMethod, parsedConfig);

  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.get_tenant',
    tenantId,
    authMethod: 'admin_key',
    responseStatus: 200,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({
    tenantId: tenant.id,
    tier: tenant.tier,
    billingStatus: tenant.billingStatus,
    gracePeriodEnd: tenant.gracePeriodEnd,
    hasPaymentMethod,
    paymentMethodAddedAt: tenant.paymentMethodAddedAt,
    stripeCustomerId: tenant.stripeCustomerId,
    eidasQualified: tenant.eidasQualified,
    config: parsedConfig ?? {},
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    quota,
    keys,
    usageHistory,
  }, 200, ADMIN_CACHE);
}

/**
 * GET /v1/admin/overview -- platform-wide aggregate statistics for a billing period
 *
 * Query params:
 *   period (optional) -- billing period in YYYY-MM format (defaults to current)
 */
export async function handleAdminGetOverview(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const params = new URL(request.url).searchParams;
  const periodParam = params.get('period');

  let period;
  if (periodParam !== null) {
    if (!PERIOD_RE.test(periodParam)) {
      return problemResponse(400, "Query parameter 'period' must be in YYYY-MM format");
    }
    period = periodParam;
  } else {
    period = computePeriod();
  }

  const stats = await getOverviewStats(env.DB, period);

  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.get_overview',
    period,
    authMethod: 'admin_key',
    responseStatus: 200,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({
    totalTenants: stats.totalTenants,
    totalCapturesCurrentPeriod: stats.totalCapturesCurrentPeriod,
    totalCapturesAllTime: stats.totalCapturesAllTime,
    totalStorageBytes: stats.totalStorageBytes,
    totalEidasCaptures: stats.totalEidasCaptures,
    tenantsByTier: stats.tenantsByTier,
    tenantsByBillingStatus: stats.tenantsByBillingStatus,
    activeApiKeys: stats.activeApiKeys,
    period,
  }, 200, ADMIN_CACHE);
}
