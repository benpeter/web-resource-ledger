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
 *   - Per-tenant quota checked once per tenant group (not per schedule).
 *   - Individual schedule failures are isolated; others continue.
 */

import { getDueSchedules, advanceSchedule, createCapture, incrementUsage } from './db.js';
import { checkQuota } from './quotas.js';
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
  // Track which captures need usage incremented after sendBatch.
  const usageByTenant = new Map(); // tenantId -> count of enqueued captures

  let executedCount = 0;
  let skippedCount = 0;

  for (const [tenantId, schedules] of byTenant) {
    // One quota check per tenant.
    let quotaResult;
    try {
      quotaResult = await checkQuota(env.DB, tenantId, schedules.length);
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
      // Quota exhausted: skip all schedules for this tenant but still advance
      // their next_run_at so they don't pile up at the same timestamp.
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
          skipReason: 'quota_exhausted',
        }) ?? Promise.resolve());
        skippedCount++;
      }
      continue;
    }

    // Quota allowed: enqueue a capture for each schedule.
    for (const schedule of schedules) {
      let captureId, nextRunAt;

      try {
        captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');

        // Create the capture record in D1 (status: 'pending').
        await createCapture(env.DB, captureId, schedule.url, null, tenantId, schedule.id);

        // Compute the next future occurrence strictly after the trigger time.
        nextRunAt = nextRunAfter(schedule.cron, new Date(controller.scheduledTime));

        // Advance the schedule's next_run_at (CAS-style: no-op if schedule was paused).
        await advanceSchedule(env.DB, schedule.id, nextRunAt, captureId, 'pending');
      } catch (err) {
        ctx.waitUntil(log(env, 5, 'schedule', {
          event: 'schedule.execute_fail',
          scheduleId: schedule.id,
          tenantId,
          url: schedule.url,
          captureId: captureId ?? null,
          errorMessage: String(err?.message ?? '').slice(0, 128),
        }) ?? Promise.resolve());
        skippedCount++;
        continue;
      }

      queueMessages.push({
        body: {
          captureId,
          url: schedule.url,
          ip: null,
          tenantId,
          cip: 'cron',
          scheduleId: schedule.id,
          enqueuedAt: Date.now(),
        },
      });

      usageByTenant.set(tenantId, (usageByTenant.get(tenantId) ?? 0) + 1);

      ctx.waitUntil(log(env, 3, 'schedule', {
        event: 'schedule.execute',
        scheduleId: schedule.id,
        tenantId,
        url: schedule.url,
        captureId,
      }) ?? Promise.resolve());

      executedCount++;
    }
  }

  // Send all queued messages in chunks of BATCH_SIZE.
  if (queueMessages.length > 0) {
    try {
      for (let i = 0; i < queueMessages.length; i += BATCH_SIZE) {
        await env.CAPTURE_QUEUE.sendBatch(queueMessages.slice(i, i + BATCH_SIZE));
      }

      // Increment usage only after sendBatch succeeds.
      for (const [tenantId, count] of usageByTenant) {
        incrementUsage(env.DB, tenantId, { captures: count }).catch((err) => {
          console.warn('wrl:schedule_usage_increment_fail', {
            tenantId,
            count,
            errorMessage: String(err?.message ?? '').slice(0, 128),
          });
        });
      }
    } catch (err) {
      // sendBatch failed. Captures are already 'pending' in D1 -- they're orphans
      // but won't double-count usage since we increment only on success.
      ctx.waitUntil(log(env, 5, 'schedule', {
        event: 'schedule.batch_enqueue_fail',
        triggerTime: asOf,
        messageCount: queueMessages.length,
        errorMessage: String(err?.message ?? '').slice(0, 128),
      }) ?? Promise.resolve());
    }
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
