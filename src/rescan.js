// tva
/**
 * rescan.js -- Daily re-scan cron handler for threat detection
 *
 * Runs at 03:00 UTC daily (production) / 04:00 UTC (staging).
 * Queries D1 for complete captures whose last threat check is older than 24h,
 * re-checks each unique URL against Google Web Risk, and quarantines any that
 * have become malicious since capture.
 *
 * Design constraints:
 *   - Serial URL processing to respect Web Risk API rate limits (6000 req/min).
 *   - Per-invocation budget cap of 500 URLs (cron has 15 min CPU).
 *   - Fails open on API degradation: skips and logs at warn, retries next tick.
 *   - No cursor-based resume -- YAGNI until volume demands it.
 *   - Does NOT auto-un-quarantine clean URLs.
 */

import { log } from './log.js';
import { checkUrl } from './threat-check.js';
import {
  listCapturesNeedingThreatCheck,
  quarantineCapturesByUrl,
  recordThreatCheck,
} from './db.js';
import { dispatchWebhooks } from './webhook-dispatch.js';

/**
 * Handle the daily re-scan cron tick.
 * Checks existing complete captures against Google Web Risk.
 *
 * @param {ScheduledController} controller
 * @param {object} env  Worker env bindings
 * @param {ExecutionContext} ctx
 */
export async function handleRescanTick(controller, env, ctx) {
  const start = Date.now();

  try {
    const olderThan = new Date(start - 24 * 60 * 60 * 1000).toISOString();
    const captures = await listCapturesNeedingThreatCheck(env.DB, olderThan, 500);

    if (captures.length === 0) {
      await log(env, 3, 'security', {
        event: 'threatcheck.rescan_tick',
        scannedCount: 0,
        flaggedCount: 0,
        skippedCount: 0,
        durationMs: Date.now() - start,
        triggerTime: new Date(controller.scheduledTime).toISOString(),
      });
      return;
    }

    let scannedCount = 0;
    let flaggedCount = 0;
    let skippedCount = 0;

    // Process serially -- Web Risk is 6000 req/min; no need to parallelize at our scale.
    for (const { captureId, url, tenantId } of captures) {
      let result;
      try {
        result = await checkUrl(url, env);
      } catch (err) {
        // checkUrl catches internally and never rejects, but guard anyway.
        skippedCount++;
        await log(env, 4, 'security', {
          event: 'threatcheck.rescan_fail',
          context: 'rescan',
          captureId,
          tenantId,
          errorMessage: String(err?.message ?? '').slice(0, 128),
        });
        continue;
      }

      if (result.degraded) {
        // API unavailable -- skip this URL, it will be retried on next tick.
        skippedCount++;
        await log(env, 4, 'security', {
          event: 'threatcheck.rescan_degraded',
          context: 'rescan',
          captureId,
          tenantId,
          reason: result.reason ?? 'api_unavailable',
        });
        continue;
      }

      scannedCount++;

      if (!result.safe) {
        // URL is now flagged -- quarantine all complete captures sharing this URL.
        const { threatTypes } = result;
        let quarantined;
        try {
          quarantined = await quarantineCapturesByUrl(
            env.DB,
            url,
            threatTypes.join(','),
            threatTypes.join(','),
          );
        } catch (err) {
          skippedCount++;
          scannedCount--;
          await log(env, 4, 'security', {
            event: 'threatcheck.rescan_fail',
            context: 'rescan',
            captureId,
            tenantId,
            phase: 'quarantine',
            errorMessage: String(err?.message ?? '').slice(0, 128),
          });
          continue;
        }

        flaggedCount++;

        // Log and dispatch webhooks for each quarantined capture.
        for (const { captureId: qCaptureId, tenantId: qTenantId } of quarantined) {
          await log(env, 4, 'security', {
            event: 'threatcheck.quarantine',
            captureId: qCaptureId,
            tenantId: qTenantId,
            url,
            threatTypes,
          });

          // Build a minimal capture record sufficient for buildWebhookPayload.
          const captureRecord = {
            captureId: qCaptureId,
            status: 'quarantined',
            url,
            quarantineReason: threatTypes.join(','),
            quarantinedAt: new Date().toISOString(),
          };

          ctx.waitUntil(
            dispatchWebhooks(env, qTenantId, 'capture.quarantined', captureRecord),
          );
        }
      } else {
        // URL is clean -- record the check to advance last_threat_check_at.
        try {
          await recordThreatCheck(env.DB, captureId, 'safe', null);
        } catch (err) {
          // Non-fatal: next tick will re-check since timestamp was not advanced.
          await log(env, 4, 'security', {
            event: 'threatcheck.rescan_fail',
            context: 'rescan',
            captureId,
            tenantId,
            phase: 'record_safe',
            errorMessage: String(err?.message ?? '').slice(0, 128),
          });
        }
      }
    }

    await log(env, 3, 'security', {
      event: 'threatcheck.rescan_tick',
      scannedCount,
      flaggedCount,
      skippedCount,
      durationMs: Date.now() - start,
      triggerTime: new Date(controller.scheduledTime).toISOString(),
    });
  } catch (err) {
    await log(env, 5, 'security', {
      event: 'threatcheck.rescan_error',
      context: 'rescan',
      errorMessage: String(err?.message ?? '').slice(0, 128),
    });
    throw err;
  }
}
