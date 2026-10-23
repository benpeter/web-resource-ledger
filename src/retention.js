/**
 * Retention jobs (phase 0129), run by the weekly cron.
 *
 * - Captures quarantined by threat detection are deleted 90 days after
 *   quarantine: R2 artifacts first, then the D1 rows. Re-running after a
 *   partial failure is safe, since deleting a missing R2 key is a no-op.
 * - Usage counters older than 12 billing periods are deleted.
 *
 * Both match site/content/security/data-retention.md.
 */
import { log } from './log.js';

export const QUARANTINE_RETENTION_DAYS = 90;
export const USAGE_RETENTION_PERIODS = 12;
// Captures purged per run. The weekly cron has plenty of time for this many.
export const QUARANTINE_PURGE_BATCH = 100;

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

export async function purgeQuarantinedCaptures(env, now = new Date(), limit = QUARANTINE_PURGE_BATCH) {
  const before = new Date(now.getTime() - QUARANTINE_RETENTION_DAYS * DAY_MS).toISOString();
  const { results = [] } = await env.DB.prepare(
    `SELECT id, artifacts, wacz FROM captures
     WHERE quarantined = 1 AND quarantined_at IS NOT NULL AND quarantined_at < ?
     ORDER BY quarantined_at LIMIT ?`,
  ).bind(before, limit).all();

  let purged = 0;
  let failed = 0;
  for (const row of results) {
    try {
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
        env.DB.prepare('DELETE FROM captures WHERE id = ? AND quarantined = 1').bind(row.id),
      ]);
      purged++;
    } catch (err) {
      failed++;
      await log(env, 4, 'retention', {
        event: 'retention.quarantine_purge_fail',
        captureId: row.id,
        errorMessage: String(err?.message ?? err).slice(0, 200),
      });
    }
  }
  await log(env, 3, 'retention', { event: 'retention.quarantine_purged', purged, failed, before });
  return { purged, failed, before };
}

export async function trimUsageCounters(env, now = new Date()) {
  const cutoff = usageCutoffPeriod(now);
  const res = await env.DB.prepare('DELETE FROM usage_counters WHERE period < ?').bind(cutoff).run();
  const deleted = res?.meta?.changes ?? 0;
  await log(env, 3, 'retention', { event: 'retention.usage_trimmed', cutoff, deleted });
  return { cutoff, deleted };
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
