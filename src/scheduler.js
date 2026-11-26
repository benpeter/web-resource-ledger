// tva
/**
 * scheduler.js -- Cron-triggered scheduled capture fan-out
 *
 * Called once per minute by the Cloudflare cron trigger.
 * Queries D1 for due schedules, checks per-tenant quota, creates capture
 * records, and enqueues jobs onto the existing wrl-captures queue.
 *
 * Design constraints:
 *   - No catch-up logic: always advances to the NEXT FUTURE occurrence.
 *   - Usage is incremented only after sendBatch succeeds.
 *   - Per-tenant quota checked once per tenant group (not per schedule), for
 *     every URL the due schedules capture: a watch list (backlog #59) needs
 *     quota for each of its URLs.
 *   - A schedule's queue messages are sent only after its next_run_at moved,
 *     so a failed advance can't make it fire again every minute.
 *   - Individual schedule failures are isolated; others continue.
 */

import { getDueSchedules, advanceSchedule, createCapture } from './db.js';
import { checkQuota, limitReachedEmailData } from './quotas.js';
import { dispatchNotification } from './email-dispatch.js';
import { checkUrl } from './threat-check.js';
import { nextRunAfter } from './cron.js';
import { log } from './log.js';

/** Maximum messages per sendBatch call (Cloudflare Queues limit). */
const BATCH_SIZE = 100;

/**
 * Handle a scheduled cron tick.
 *
 * @param {ScheduledController} controller
 * @param {object} env  Worker env bindings
 * @param {ExecutionContext} ctx
 */
export async function handleScheduledTick(controller, env, ctx) {
  const start = Date.now();
  const asOf = new Date(controller.scheduledTime).toISOString();

  // Query all schedules due at or before the trigger time.
  const dueSchedules = await getDueSchedules(env.DB, asOf);

  if (dueSchedules.length === 0) {
    ctx.waitUntil(log(env, 3, 'schedule', {
      event: 'schedule.tick_empty',
      triggerTime: asOf,
    }) ?? Promise.resolve());
    return;
  }

  ctx.waitUntil(log(env, 3, 'schedule', {
    event: 'schedule.tick_start',
    triggerTime: asOf,
    schedulesFound: dueSchedules.length,
  }) ?? Promise.resolve());

  // Group schedules by tenant_id -- getDueSchedules returns them ordered by tenant_id.
  const byTenant = new Map();
  for (const schedule of dueSchedules) {
    if (!byTenant.has(schedule.tenant_id)) {
      byTenant.set(schedule.tenant_id, []);
    }
    byTenant.get(schedule.tenant_id).push(schedule);
  }

  // Collect all queue messages across tenants for a single sendBatch call.
  const queueMessages = [];

  let executedCount = 0;
  let skippedCount = 0;

  for (const [tenantId, schedules] of byTenant) {
    // One quota check per tenant.
    let quotaResult;
    try {
      const urlCount = schedules.reduce((n, schedule) => n + schedule.urls.length, 0);
      quotaResult = await checkQuota(env.DB, tenantId, urlCount);
    } catch (err) {
      // If quota check itself fails, skip the whole tenant but log the error.
      ctx.waitUntil(log(env, 5, 'schedule', {
        event: 'schedule.execute_fail',
        tenantId,
        reason: 'quota_check_error',
        errorMessage: String(err?.message ?? '').slice(0, 128),
      }) ?? Promise.resolve());
      skippedCount += schedules.length;
      continue;
    }

    if (!quotaResult.allowed) {
      // Quota exhausted or deletion requested: skip all schedules for this tenant
      // but still advance their next_run_at so they don't pile up at the same timestamp.
      for (const schedule of schedules) {
        let nextRunAt;
        try {
          nextRunAt = nextRunAfter(schedule.cron, new Date(controller.scheduledTime));
        } catch (err) {
          ctx.waitUntil(log(env, 5, 'schedule', {
            event: 'schedule.execute_fail',
            scheduleId: schedule.id,
            tenantId,
            url: schedule.url,
            reason: 'next_run_compute_error',
            errorMessage: String(err?.message ?? '').slice(0, 128),
          }) ?? Promise.resolve());
          skippedCount++;
          continue;
        }
        try {
          await advanceSchedule(env.DB, schedule.id, nextRunAt, null, 'skipped');
        } catch (err) {
          ctx.waitUntil(log(env, 5, 'schedule', {
            event: 'schedule.execute_fail',
            scheduleId: schedule.id,
            tenantId,
            url: schedule.url,
            reason: 'advance_error',
            errorMessage: String(err?.message ?? '').slice(0, 128),
          }) ?? Promise.resolve());
        }
        ctx.waitUntil(log(env, 4, 'schedule', {
          event: 'schedule.execute_skip',
          scheduleId: schedule.id,
          tenantId,
          url: schedule.url,
          skipReason: quotaResult.reason === 'deletion_requested' ? 'deletion_requested' : 'quota_exhausted',
        }) ?? Promise.resolve());
        skippedCount++;
      }
      const limitEmail = limitReachedEmailData(env, quotaResult);
      if (limitEmail) {
        ctx.waitUntil(dispatchNotification(env, tenantId, 'limit_reached', limitEmail));
      }
      continue;
    }

    // Quota allowed: enqueue a capture for each URL of each schedule.
    for (const schedule of schedules) {
      let nextRunAt;
      try {
        // The next future occurrence strictly after the trigger time.
        nextRunAt = nextRunAfter(schedule.cron, new Date(controller.scheduledTime));
      } catch (err) {
        ctx.waitUntil(log(env, 5, 'schedule', {
          event: 'schedule.execute_fail',
          scheduleId: schedule.id,
          tenantId,
          url: schedule.url,
          reason: 'next_run_compute_error',
          errorMessage: String(err?.message ?? '').slice(0, 128),
        }) ?? Promise.resolve());
        skippedCount++;
        continue;
      }

      const messages = [];
      let blockedCount = 0;
      for (const url of schedule.urls) {
        // Threat check: skip a URL that is flagged (fail-open on error/no key).
        const threat = await checkUrl(url, env).catch(() => ({ safe: true, degraded: true }));
        if (!threat.safe) {
          ctx.waitUntil(log(env, 4, 'schedule', {
            event: 'schedule.blocked_threat',
            scheduleId: schedule.id,
            tenantId,
            url,
            threatTypes: threat.threatTypes,
          }) ?? Promise.resolve());
          blockedCount++;
          continue;
        }

        const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');
        try {
          // Create the capture record in D1 (status: 'pending').
          await createCapture(env.DB, captureId, url, null, tenantId, schedule.id);
        } catch (err) {
          ctx.waitUntil(log(env, 5, 'schedule', {
            event: 'schedule.execute_fail',
            scheduleId: schedule.id,
            tenantId,
            url,
            captureId,
            errorMessage: String(err?.message ?? '').slice(0, 128),
          }) ?? Promise.resolve());
          continue;
        }
        messages.push({
          body: {
            captureId,
            url,
            ip: null,
            tenantId,
            cip: 'cron',
            scheduleId: schedule.id,
            enqueuedAt: Date.now(),
            qualifiedTimestamps: quotaResult.eidasQualified ?? false,
          },
        });
      }

      if (messages.length === 0) {
        if (blockedCount === schedule.urls.length) {
          // Every URL flagged: advance with status 'blocked' so the schedule doesn't retry every minute.
          await advanceSchedule(env.DB, schedule.id, nextRunAt, null, 'blocked').catch((err) => {
            ctx.waitUntil(log(env, 5, 'schedule', {
              event: 'schedule.advance_failed',
              scheduleId: schedule.id,
              tenantId,
              url: schedule.url,
              blockReason: 'threat',
              errorClass: err?.constructor?.name,
              errorMessage: String(err?.message ?? '').slice(0, 128),
            }) ?? Promise.resolve());
          });
        }
        skippedCount++;
        continue;
      }

      // Advance next_run_at (CAS-style: no-op if the schedule was paused). The
      // last URL's capture becomes last_capture_id.
      const lastCaptureId = messages[messages.length - 1].body.captureId;
      try {
        await advanceSchedule(env.DB, schedule.id, nextRunAt, lastCaptureId, 'pending');
      } catch (err) {
        ctx.waitUntil(log(env, 5, 'schedule', {
          event: 'schedule.execute_fail',
          scheduleId: schedule.id,
          tenantId,
          url: schedule.url,
          captureId: lastCaptureId,
          reason: 'advance_error',
          errorMessage: String(err?.message ?? '').slice(0, 128),
        }) ?? Promise.resolve());
        skippedCount++;
        continue;
      }

      queueMessages.push(...messages);
      for (const { body } of messages) {
        ctx.waitUntil(log(env, 3, 'schedule', {
          event: 'schedule.execute',
          scheduleId: schedule.id,
          tenantId,
          url: body.url,
          captureId: body.captureId,
        }) ?? Promise.resolve());
      }
      executedCount += messages.length;
    }
  }

  // Send all queued messages in chunks of BATCH_SIZE.
  if (queueMessages.length > 0) {
    let sentCount = 0;
    for (let i = 0; i < queueMessages.length; i += BATCH_SIZE) {
      const chunk = queueMessages.slice(i, i + BATCH_SIZE);
      try {
        await env.CAPTURE_QUEUE.sendBatch(chunk);
        sentCount += chunk.length;
      } catch (err) {
        ctx.waitUntil(log(env, 5, 'schedule', {
          event: 'schedule.batch_enqueue_fail',
          triggerTime: asOf,
          messageCount: chunk.length,
          sentSoFar: sentCount,
          errorMessage: String(err?.message ?? '').slice(0, 128),
        }) ?? Promise.resolve());
        break; // Stop sending further chunks after a failure.
      }
    }

    // No usage increment here: the queue consumer counts a capture once, when it
    // completes, like every other capture. Counting at enqueue as well made every
    // scheduled capture count twice (phase 0120).
  }

  const durationMs = Date.now() - start;
  ctx.waitUntil(log(env, 3, 'schedule', {
    event: 'schedule.tick_complete',
    triggerTime: asOf,
    executed: executedCount,
    skipped: skippedCount,
    durationMs,
  }) ?? Promise.resolve());
}
