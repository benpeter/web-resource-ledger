/**
 * Captures still pending a day after they were created (phase 0139), failed by
 * the per-minute cron on the hour.
 *
 * A capture's four attempts finish within an hour, and the DLQ handler fails it
 * after the last one. A capture still pending after a day lost its queue
 * message: production had 8 of them, from July to September 2026, shown as in
 * progress in the API, dashboard and MCP ever since. Since phase 0169 each one
 * sends the capture.failed webhook and the failure email, as a capture that
 * used all its attempts does.
 */
import { failStalePendingCaptures, getCapture } from './db.js';
import { dispatchNotification } from './email-dispatch.js';
import { log } from './log.js';
import { dispatchWebhooks } from './webhook-dispatch.js';

export const STALE_PENDING_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

export async function failStaleCaptures(env, now = new Date()) {
  const before = new Date(now.getTime() - STALE_PENDING_HOURS * HOUR_MS).toISOString();
  try {
    const captureIds = await failStalePendingCaptures(env.DB, before, now.toISOString());
    if (captureIds.length > 0) {
      await log(env, 4, 'capture', { event: 'capture.stale_fail', count: captureIds.length, captureIds: captureIds.slice(0, 20) });
    }
    for (const captureId of captureIds) await reportStaleFailure(env, captureId);
  } catch (err) {
    await log(env, 5, 'capture', { event: 'capture.stale_fail_error', errorMessage: String(err?.message ?? err).slice(0, 256) });
  }
}

async function reportStaleFailure(env, captureId) {
  const record = await getCapture(env.DB, captureId);
  if (!record) return;
  const { tenantId } = record;
  await dispatchWebhooks(env, tenantId, 'capture.failed', record);
  const baseUrl = env.VERIFICATION_BASE_URL
    ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
    : 'https://api.webresourceledger.com';
  await dispatchNotification(env, tenantId, 'capture_failure', {
    url: record.url,
    errorCategory: record.error,
    failedAt: record.failedAt,
    captureDetailUrl: `${baseUrl}/v1/captures/${captureId}`,
  }).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId }));
}
