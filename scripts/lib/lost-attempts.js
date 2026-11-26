// tva
/**
 * Finds the capture attempts a killed Worker run was working on (backlog #99).
 *
 * When Cloudflare ends a run for using too much memory or CPU, the run logs
 * nothing more: its attempt has a `capture.dequeued` event and no outcome
 * (success, partial, stage failure, retry, failure, dead letter) before the
 * queue delivers the message again. The worker health alert lists them.
 */

export const OUTCOME_EVENTS = [
  'capture.success',
  'capture.partial',
  'capture.retry',
  'capture.stage.fail',
  'capture.fail',
  'capture.dlq',
];

/**
 * @param {Array<{ ts: string, event: string, captureId: string, attempt: number|null, tenantId: string|null, url: string|null }>} events
 *   capture.dequeued and outcome events, any order, from the window and some time after it
 * @param {string} start  ISO time, inclusive
 * @param {string} end    ISO time, exclusive
 * @returns {Array<{ ts: string, captureId: string, attempt: number|null, tenantId: string|null, url: string|null }>}
 *   attempts started in the window without an outcome, oldest first
 */
export function findLostAttempts(events, start, end) {
  const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
  const lost = [];
  sorted.forEach((event, i) => {
    if (event.event !== 'capture.dequeued' || event.ts < start || event.ts >= end) return;
    const later = sorted.slice(i + 1).filter((e) => e.captureId === event.captureId);
    const next = later.find((e) => e.event === 'capture.dequeued' || OUTCOME_EVENTS.includes(e.event));
    if (next && next.event !== 'capture.dequeued') return;
    lost.push({ ts: event.ts, captureId: event.captureId, attempt: event.attempt, tenantId: event.tenantId, url: event.url });
  });
  return lost;
}

/**
 * One line per lost attempt for the alert email.
 *
 * @param {ReturnType<typeof findLostAttempts>} lost
 * @param {Record<string, string>} logins  tenant id -> GitHub login, for gh-<id> tenants
 * @returns {string}
 */
export function formatLostAttempts(lost, logins) {
  if (lost.length === 0) return 'No capture attempt without an outcome was found in the logs.';
  return lost.map((a) => {
    const account = logins[a.tenantId] ? `${a.tenantId} (github: ${logins[a.tenantId]})` : a.tenantId;
    return `${a.ts.slice(11, 19)}  ${account}  ${a.url}  ${a.captureId}  attempt ${a.attempt}`;
  }).join('\n');
}
