/**
 * Retention jobs (phase 0129), run by the weekly cron.
 *
 * - Captures quarantined by threat detection are deleted 90 days after
 *   quarantine: R2 artifacts first, then the D1 rows. Re-running after a
 *   partial failure is safe, since deleting a missing R2 key is a no-op.
 * - Usage counters older than 12 billing periods are deleted.
 *
 * Captures older than CAPTURE_RETENTION_DAYS are deleted hourly from the
 * per-minute cron, when that variable is set (phase 0196). Staging sets 30;
 * production leaves it unset and keeps captures. The admin route that deletes
 * one tenant's captures uses the same per-capture deletion.
 *
 * purgeExpiredSignIns runs hourly from the per-minute cron instead: expired
 * sessions, and sign-in links a day past their expiry.
 *
 * All match site/content/security/data-retention.md.
 */
import { log } from './log.js';
import { deleteExpiredSessions, deleteExpiredLoginTokens } from './db.js';

export const QUARANTINE_RETENTION_DAYS = 90;
export const USAGE_RETENTION_PERIODS = 12;
// Captures purged per run. The weekly cron has plenty of time for this many.
export const QUARANTINE_PURGE_BATCH = 100;
// Captures deleted per hourly run, and per call of the admin route.
export const CAPTURE_PURGE_BATCH = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Oldest period to keep: the current period minus USAGE_RETENTION_PERIODS. */
export function usageCutoffPeriod(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - USAGE_RETENTION_PERIODS, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** R2 keys of a capture row: its artifacts and its WACZ bundle. */
function r2KeysOf(row) {
  const artifacts = parseJson(row.artifacts) ?? {};
  const keys = Object.values(artifacts).filter((k) => typeof k === 'string' && k);
  const waczKey = parseJson(row.wacz)?.key;
  return { keys, waczKey: typeof waczKey === 'string' && waczKey ? waczKey : null };
}

/**
 * Delete one capture: its R2 objects, then its threat checks and its row.
 * Re-running after a partial failure is safe, since deleting a missing R2 key
 * is a no-op.
 *
 * @returns {Promise<number>} R2 objects deleted
 */
async function deleteCapture(env, row) {
  const { keys, waczKey } = r2KeysOf(row);
  if (waczKey) {
    // A WACZ key is content-addressed; keep the object if another capture uses it.
    const shared = await env.DB.prepare(
      `SELECT 1 FROM captures WHERE id != ? AND json_extract(wacz, '$.key') = ? LIMIT 1`,
    ).bind(row.id, waczKey).first();
    if (!shared) keys.push(waczKey);
  }
  if (keys.length > 0) await env.BUCKET.delete(keys);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM threat_checks WHERE capture_id = ?').bind(row.id),
    env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(row.id),
  ]);
  return keys.length;
}

/**
 * Delete the given capture rows one by one; a failure is logged and the rest go on.
 *
 * @returns {Promise<{ purged: number, failed: number, r2Objects: number }>}
 */
async function deleteCaptures(env, rows, failEvent) {
  let purged = 0;
  let failed = 0;
  let r2Objects = 0;
  for (const row of rows) {
    try {
      r2Objects += await deleteCapture(env, row);
      purged++;
    } catch (err) {
      failed++;
      await log(env, 4, 'retention', {
        event: failEvent,
        captureId: row.id,
        errorMessage: String(err?.message ?? err).slice(0, 200),
      });
    }
  }
  return { purged, failed, r2Objects };
}

export async function purgeQuarantinedCaptures(env, now = new Date(), limit = QUARANTINE_PURGE_BATCH) {
  const before = new Date(now.getTime() - QUARANTINE_RETENTION_DAYS * DAY_MS).toISOString();
  const { results = [] } = await env.DB.prepare(
    `SELECT id, artifacts, wacz FROM captures
     WHERE quarantined = 1 AND quarantined_at IS NOT NULL AND quarantined_at < ?
     ORDER BY quarantined_at LIMIT ?`,
  ).bind(before, limit).all();

  const { purged, failed } = await deleteCaptures(env, results, 'retention.quarantine_purge_fail');
  await log(env, 3, 'retention', { event: 'retention.quarantine_purged', purged, failed, before });
  return { purged, failed, before };
}

/** CAPTURE_RETENTION_DAYS as a whole number of days, or null when unset or invalid. */
export function captureRetentionDays(env) {
  const days = Number.parseInt(env.CAPTURE_RETENTION_DAYS ?? '', 10);
  return Number.isInteger(days) && days > 0 ? days : null;
}

/**
 * Delete captures created more than CAPTURE_RETENTION_DAYS ago, oldest first,
 * up to limit per run. Does nothing when the variable is unset (production).
 */
export async function purgeExpiredCaptures(env, now = new Date(), limit = CAPTURE_PURGE_BATCH) {
  const days = captureRetentionDays(env);
  if (!days) return { purged: 0, failed: 0, before: null };
  const before = new Date(now.getTime() - days * DAY_MS).toISOString();
  try {
    const { results = [] } = await env.DB.prepare(
      'SELECT id, artifacts, wacz FROM captures WHERE created_at < ? ORDER BY created_at LIMIT ?',
    ).bind(before, limit).all();
    const { purged, failed, r2Objects } = await deleteCaptures(env, results, 'retention.expired_purge_fail');
    if (purged > 0 || failed > 0) {
      await log(env, 3, 'retention', { event: 'retention.expired_purged', purged, failed, r2Objects, before, days });
    }
    return { purged, failed, before };
  } catch (err) {
    await log(env, 4, 'retention', {
      event: 'retention.job_fail',
      job: 'expired_captures',
      errorMessage: String(err?.message ?? err).slice(0, 200),
    });
    return { purged: 0, failed: 0, before };
  }
}

/**
 * Delete up to limit of a tenant's captures, oldest first, and keep the account.
 *
 * @returns {Promise<{ captures: number, failed: number, r2Objects: number, remaining: number }>}
 */
export async function purgeTenantCaptures(env, tenantId, limit = CAPTURE_PURGE_BATCH) {
  const { results = [] } = await env.DB.prepare(
    'SELECT id, artifacts, wacz FROM captures WHERE tenant_id = ? ORDER BY created_at LIMIT ?',
  ).bind(tenantId, limit).all();
  const { purged, failed, r2Objects } = await deleteCaptures(env, results, 'retention.tenant_capture_purge_fail');
  const left = await env.DB.prepare('SELECT count(*) AS n FROM captures WHERE tenant_id = ?').bind(tenantId).first();
  return { captures: purged, failed, r2Objects, remaining: left?.n ?? 0 };
}

export async function trimUsageCounters(env, now = new Date()) {
  const cutoff = usageCutoffPeriod(now);
  const res = await env.DB.prepare('DELETE FROM usage_counters WHERE period < ?').bind(cutoff).run();
  const deleted = res?.meta?.changes ?? 0;
  await log(env, 3, 'retention', { event: 'retention.usage_trimmed', cutoff, deleted });
  return { cutoff, deleted };
}

/**
 * Expired sessions and sign-in links a day past their expiry, hourly. Sign-ins
 * also delete them, but with few sign-ins the rows stayed for weeks.
 */
export async function purgeExpiredSignIns(env, now = new Date()) {
  try {
    const sessions = await deleteExpiredSessions(env.DB, now);
    const loginTokens = await deleteExpiredLoginTokens(env.DB, now);
    if (sessions > 0 || loginTokens > 0) {
      await log(env, 3, 'retention', { event: 'retention.sign_ins_purged', sessions, loginTokens });
    }
  } catch (err) {
    await log(env, 4, 'retention', {
      event: 'retention.job_fail',
      job: 'sign_ins',
      errorMessage: String(err?.message ?? err).slice(0, 200),
    });
  }
}

/** Both jobs, each on its own so one failing doesn't skip the other. */
export async function runRetentionJobs(env, now = new Date()) {
  for (const [job, fn] of [['quarantine', purgeQuarantinedCaptures], ['usage', trimUsageCounters]]) {
    try {
      await fn(env, now);
    } catch (err) {
      await log(env, 4, 'retention', {
        event: 'retention.job_fail',
        job,
        errorMessage: String(err?.message ?? err).slice(0, 200),
      });
    }
  }
}
