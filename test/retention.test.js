// Retention jobs (phase 0129): purge quarantined captures after 90 days and trim
// usage counters to the last 12 billing periods, as the data-retention page says.
// Both run from the weekly cron, which must not also run the per-minute
// schedule tick (Cloudflare reads "1" in the weekday field as Sunday, and the
// second tick created duplicate scheduled captures at Sunday 09:00).

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { WEEKLY_CRON, MINUTE_CRON } from '../src/crons.js';
import {
  purgeQuarantinedCaptures,
  trimUsageCounters,
  usageCutoffPeriod,
  QUARANTINE_RETENTION_DAYS,
} from '../src/retention.js';
import { seedCapture, seedSchedule, seedApiKey, cleanDb, TEST_TENANT_KEY } from './fixtures.js';

const NOW = new Date('2026-10-26T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const OLD_Q = 'cap_' + '1'.repeat(32);    // quarantined 91 days ago -> purged
const RECENT_Q = 'cap_' + '2'.repeat(32); // quarantined 89 days ago -> kept
const NORMAL = 'cap_' + '3'.repeat(32);   // never quarantined, old -> kept
const SHARES_WACZ = 'cap_' + '4'.repeat(32); // old quarantined, WACZ key also used by NORMAL

function artifactsFor(id) {
  return {
    screenshot: `captures/${id}/screenshot.png`,
    html: `captures/${id}/rendered.html`,
    headers: `captures/${id}/headers.json`,
  };
}

async function seedQuarantined(id, quarantinedAt, { waczKey = `captures/${id.slice(4)}.wacz` } = {}) {
  await seedCapture(env.DB, id, {
    status: 'complete',
    createdAt: new Date(quarantinedAt.getTime() - DAY).toISOString(),
    completedAt: new Date(quarantinedAt.getTime() - DAY).toISOString(),
    artifacts: artifactsFor(id),
    wacz: { key: waczKey, bundleHash: 'sha256:' + 'a'.repeat(64), size: 10 },
  });
  await env.DB.prepare(
    `UPDATE captures SET quarantined = 1, quarantine_reason = 'MALWARE', quarantined_at = ? WHERE id = ?`,
  ).bind(quarantinedAt.toISOString(), id).run();
  for (const key of [...Object.values(artifactsFor(id)), waczKey]) {
    await env.BUCKET.put(key, 'x');
  }
}

async function exists(key) {
  return (await env.BUCKET.head(key)) !== null;
}

async function captureRow(id) {
  return env.DB.prepare('SELECT id FROM captures WHERE id = ?').bind(id).first();
}

beforeEach(async () => {
  await cleanDb(env.DB);
  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'default', scopes: ['capture', 'read'] });
});

describe('purgeQuarantinedCaptures', () => {
  it(`deletes captures quarantined more than ${QUARANTINE_RETENTION_DAYS} days ago, with their artifacts and threat checks`, async () => {
    await seedQuarantined(OLD_Q, new Date(NOW.getTime() - 91 * DAY));
    await env.DB.prepare(
      `INSERT INTO threat_checks (capture_id, checked_at, verdict, threat_types) VALUES (?, ?, 'threat', 'MALWARE')`,
    ).bind(OLD_Q, NOW.toISOString()).run();

    const result = await purgeQuarantinedCaptures(env, NOW);

    expect(result.purged).toBe(1);
    expect(await captureRow(OLD_Q)).toBeNull();
    for (const key of Object.values(artifactsFor(OLD_Q))) expect(await exists(key)).toBe(false);
    expect(await exists(`captures/${OLD_Q.slice(4)}.wacz`)).toBe(false);
    const tc = await env.DB.prepare('SELECT count(*) n FROM threat_checks WHERE capture_id = ?').bind(OLD_Q).first();
    expect(tc.n).toBe(0);
  });

  it('keeps captures quarantined less than 90 days ago and captures that were never quarantined', async () => {
    await seedQuarantined(RECENT_Q, new Date(NOW.getTime() - 89 * DAY));
    await seedCapture(env.DB, NORMAL, {
      status: 'complete',
      createdAt: new Date(NOW.getTime() - 400 * DAY).toISOString(),
      artifacts: artifactsFor(NORMAL),
    });

    const result = await purgeQuarantinedCaptures(env, NOW);

    expect(result.purged).toBe(0);
    expect(await captureRow(RECENT_Q)).not.toBeNull();
    expect(await captureRow(NORMAL)).not.toBeNull();
    expect(await exists(artifactsFor(RECENT_Q).screenshot)).toBe(true);
  });

  it('keeps a WACZ object that another capture still references', async () => {
    const sharedKey = 'captures/shared-bundle.wacz';
    await seedQuarantined(SHARES_WACZ, new Date(NOW.getTime() - 120 * DAY), { waczKey: sharedKey });
    await seedCapture(env.DB, NORMAL, {
      status: 'complete',
      wacz: { key: sharedKey, bundleHash: 'sha256:' + 'b'.repeat(64), size: 10 },
    });

    await purgeQuarantinedCaptures(env, NOW);

    expect(await captureRow(SHARES_WACZ)).toBeNull();
    expect(await exists(artifactsFor(SHARES_WACZ).screenshot)).toBe(false);
    expect(await exists(sharedKey)).toBe(true);
  });
});

describe('trimUsageCounters', () => {
  it('keeps the current period and the 12 before it', () => {
    expect(usageCutoffPeriod(NOW)).toBe('2025-10');
    expect(usageCutoffPeriod(new Date('2026-01-05T00:00:00Z'))).toBe('2025-01');
  });

  it('deletes usage counters older than 12 billing periods', async () => {
    for (const period of ['2025-08', '2025-09', '2025-10', '2026-10']) {
      await env.DB.prepare(
        `INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count) VALUES ('default', ?, 1, 0, 0)`,
      ).bind(period).run();
    }

    const result = await trimUsageCounters(env, NOW);

    expect(result.deleted).toBe(2);
    const { results } = await env.DB.prepare(
      `SELECT period FROM usage_counters WHERE tenant_id = 'default' ORDER BY period`,
    ).all();
    expect(results.map((r) => r.period)).toEqual(['2025-10', '2026-10']);
  });
});

describe('scheduled() cron dispatch', () => {
  it('names the weekly cron with MON, since Cloudflare reads 1 as Sunday', () => {
    expect(WEEKLY_CRON).toBe('0 9 * * MON');
    expect(MINUTE_CRON).toBe('*/1 * * * *');
  });

  it('runs the retention jobs on the weekly cron', async () => {
    await seedQuarantined(OLD_Q, new Date(NOW.getTime() - 91 * DAY));
    const ctx = createExecutionContext();
    await worker.scheduled({ cron: WEEKLY_CRON, scheduledTime: NOW.getTime(), noRetry() {} }, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await captureRow(OLD_Q)).toBeNull();
  });

  it('does not run the schedule tick on the weekly cron', async () => {
    const SCH = 'sch_' + 'c'.repeat(32);
    await seedSchedule(env.DB, SCH, { nextRunAt: new Date(NOW.getTime() - 60 * 1000).toISOString() });
    const ctx = createExecutionContext();
    await worker.scheduled({ cron: WEEKLY_CRON, scheduledTime: NOW.getTime(), noRetry() {} }, env, ctx);
    await waitOnExecutionContext(ctx);
    const n = await env.DB.prepare('SELECT count(*) n FROM captures WHERE schedule_id = ?').bind(SCH).first();
    expect(n.n).toBe(0);
  });

  it('still runs the schedule tick on the per-minute cron', async () => {
    const SCH = 'sch_' + 'd'.repeat(32);
    await seedSchedule(env.DB, SCH, { nextRunAt: new Date(NOW.getTime() - 60 * 1000).toISOString() });
    const ctx = createExecutionContext();
    await worker.scheduled({ cron: MINUTE_CRON, scheduledTime: NOW.getTime(), noRetry() {} }, env, ctx);
    await waitOnExecutionContext(ctx);
    const n = await env.DB.prepare('SELECT count(*) n FROM captures WHERE schedule_id = ?').bind(SCH).first();
    expect(n.n).toBe(1);
  });
});
