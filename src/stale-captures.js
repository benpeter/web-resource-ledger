/**
 * Captures still pending a day after they were created (phase 0139), failed by
 * the per-minute cron on the hour.
 *
 * A capture's four attempts finish within an hour, and the DLQ handler fails it
 * after the last one. A capture still pending after a day lost its queue
 * message: production had 8 of them, from July to September 2026, shown as in
 * progress in the API, dashboard and MCP ever since. No webhook or email is
 * sent for them; the capture record and the log say what happened.
 */
import { failStalePendingCaptures } from './db.js';
import { log } from './log.js';

export const STALE_PENDING_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

export async function failStaleCaptures(env, now = new Date()) {
  const before = new Date(now.getTime() - STALE_PENDING_HOURS * HOUR_MS).toISOString();
  try {
    const captureIds = await failStalePendingCaptures(env.DB, before, now.toISOString());
    if (captureIds.length > 0) {
      await log(env, 4, 'capture', { event: 'capture.stale_fail', count: captureIds.length, captureIds: captureIds.slice(0, 20) });
    }
  } catch (err) {
    await log(env, 5, 'capture', { event: 'capture.stale_fail_error', errorMessage: String(err?.message ?? err).slice(0, 256) });
  }
}
