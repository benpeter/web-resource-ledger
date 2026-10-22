// tva
/**
 * analytics.js -- which capture events go to Pirsch, and with what.
 *
 * Events carry the capture source and coarse flags, never tenant or capture
 * ids: the privacy policy covers ip, user agent and page URL for analytics,
 * not account identifiers. Internal tenants listed in
 * ANALYTICS_EXCLUDE_TENANTS (comma-separated, production: the founder's tenant
 * and the legacy 'default' key) send nothing, so scheduled self-captures and
 * smoke tests don't drown real usage.
 *
 * Tests: test/analytics.test.js
 */

import { trackServerEvent } from './pirsch.js';

/**
 * Where a capture came from. Producers set `source` ('dashboard' | 'api');
 * older messages and other producers are recognised by their fields.
 *
 * @param {object} body  capture queue message body
 * @returns {'dashboard'|'api'|'mcp'|'schedule'}
 */
export function captureSource(body) {
  if (body?.source) return body.source;
  if (body?.scheduleId || body?.cip === 'cron') return 'schedule';
  if (body?.cip === 'mcp') return 'mcp';
  return 'api';
}

/**
 * @param {object} env
 * @param {string} tenantId
 * @returns {boolean}
 */
export function isAnalyticsExcluded(env, tenantId) {
  const list = (env?.ANALYTICS_EXCLUDE_TENANTS || '').split(',').map((t) => t.trim()).filter(Boolean);
  return list.includes(tenantId);
}

/**
 * Send a capture event ('First Capture', 'Capture Completed', 'Capture Failed').
 *
 * @param {object} env
 * @param {string} eventName
 * @param {object} body  capture queue message body (tenantId, ip, ua, source, ...)
 * @param {object} [meta]  extra coarse flags, string values
 * @returns {Promise<void>|undefined}
 */
export function trackCaptureEvent(env, eventName, body, meta = {}) {
  if (isAnalyticsExcluded(env, body?.tenantId)) return undefined;
  return trackServerEvent(env, eventName, {
    path: '/v1/captures',
    ip: body?.ip,
    userAgent: body?.ua,
    meta: { source: captureSource(body), ...meta },
  });
}
