/*
 * cron.js -- Cron expression validation and next-run computation for WRL schedules
 *
 * Only standard 5-field POSIX cron is accepted:
 *   minute hour day-of-month month day-of-week
 *
 * Rejected:
 *   - 6-field expressions (seconds field)
 *   - @reboot and other non-standard specifiers (@yearly, @annually, @monthly,
 *     @weekly, @daily, @hourly)
 *   - Expressions producing fewer than 2 occurrences within 2 years (security cap)
 *   - Expressions where any two consecutive fires are less than 60 minutes apart
 *     (minimum hourly interval enforcement)
 *
 * Tests: test/cron.test.js
 */ // tva

import { Cron } from 'croner';

/** Maximum allowed length for a cron expression string. */
const MAX_EXPRESSION_LENGTH = 128;

/**
 * Non-standard specifiers that croner accepts but we do not allow.
 * 6-field expressions are caught separately by field-count check.
 */
const REJECTED_SPECIALS = new Set([
  '@reboot', '@yearly', '@annually', '@monthly', '@weekly', '@daily', '@hourly',
]);

/** Minimum gap between consecutive fire times, in milliseconds (60 minutes). */
const MIN_INTERVAL_MS = 60 * 60 * 1000;

/** Lookahead window for the 2-year security cap, in milliseconds. */
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/** How many consecutive fire times to check for minimum-interval enforcement. */
const INTERVAL_CHECK_COUNT = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates a cron expression for use with WRL schedules.
 *
 * Enforces:
 *   - 5-field standard cron only (no seconds, no @specials)
 *   - Minimum hourly interval between consecutive fires
 *   - At least 2 occurrences within the next 2 years
 *   - Maximum expression length of 128 characters
 *
 * Returns a discriminated result; never throws for validation failures.
 *
 * @param {string} expression  Raw cron expression from the caller
 * @returns {{ ok: true, cron: string } | { ok: false, detail: string }}
 */
export function validateCron(expression) {
  if (typeof expression !== 'string') {
    return { ok: false, detail: "Cron expression must be a string" };
  }

  const trimmed = expression.trim();

  if (trimmed.length === 0) {
    return { ok: false, detail: "Cron expression must not be empty" };
  }

  if (trimmed.length > MAX_EXPRESSION_LENGTH) {
    return { ok: false, detail: `Cron expression must be ${MAX_EXPRESSION_LENGTH} characters or fewer` };
  }

  // Reject @specials (lower-cased for case-insensitive match)
  const lower = trimmed.toLowerCase();
  if (REJECTED_SPECIALS.has(lower)) {
    return { ok: false, detail: `Cron shorthand '${trimmed}' is not supported; use 5-field standard cron (minute hour day-of-month month day-of-week)` };
  }

  // Reject 6-field expressions (croner accepts them but we do not)
  const fieldCount = trimmed.split(/\s+/).length;
  if (fieldCount !== 5) {
    return { ok: false, detail: `Cron expression must have exactly 5 fields (minute hour day-of-month month day-of-week); got ${fieldCount}` };
  }

  // Parse with croner -- catch parse errors and return friendly messages
  let cron;
  try {
    cron = new Cron(trimmed, { legacyMode: false });
  } catch (err) {
    const msg = err?.message ?? String(err);
    // Croner errors tend to be descriptive; surface them with a prefix.
    return { ok: false, detail: `Invalid cron expression: ${msg}` };
  }

  // 2-year lookahead cap: require at least 2 occurrences within the next 2 years
  const now = new Date();
  const twoYearsOut = new Date(now.getTime() + TWO_YEARS_MS);
  const lookahead = new Cron(trimmed, { startAt: now, stopAt: twoYearsOut, legacyMode: false });
  const firstTwo = lookahead.nextRuns(2);
  if (firstTwo.length < 2) {
    return { ok: false, detail: "Cron expression produces no valid occurrences within the next 2 years" };
  }

  // Minimum interval enforcement: compute next INTERVAL_CHECK_COUNT fire times
  // and verify no two consecutive fires are less than 60 minutes apart.
  let checkCron;
  try {
    checkCron = new Cron(trimmed, { legacyMode: false });
  } catch {
    // Already caught above; this branch is unreachable
    return { ok: false, detail: "Invalid cron expression" };
  }

  const fireTimes = checkCron.nextRuns(INTERVAL_CHECK_COUNT);
  for (let i = 1; i < fireTimes.length; i++) {
    const gapMs = fireTimes[i].getTime() - fireTimes[i - 1].getTime();
    if (gapMs < MIN_INTERVAL_MS) {
      const gapMin = Math.round(gapMs / 60000);
      return {
        ok: false,
        detail: `Cron expression fires too frequently: minimum interval is 60 minutes, but consecutive runs are only ${gapMin} minute(s) apart`,
      };
    }
  }

  return { ok: true, cron: trimmed };
}

/**
 * Returns the ISO 8601 string of the next fire time from now (UTC).
 *
 * @param {string} expression  Validated cron expression
 * @returns {string}  ISO 8601 UTC timestamp
 * @throws {Error}  If the expression produces no upcoming occurrences
 */
export function nextRun(expression) {
  const cron = new Cron(expression, { legacyMode: false });
  const next = cron.nextRun();
  if (!next) {
    throw new Error(`Cron expression '${expression}' has no upcoming occurrences`);
  }
  return next.toISOString();
}

/**
 * Returns the ISO 8601 string of the next fire time strictly after the given Date.
 * Used by the scheduled handler to advance next_run_at after a successful run.
 *
 * @param {string} expression  Validated cron expression
 * @param {Date}   afterDate   Reference point; returned time is strictly after this
 * @returns {string}  ISO 8601 UTC timestamp
 * @throws {Error}  If the expression produces no occurrence after afterDate
 */
export function nextRunAfter(expression, afterDate) {
  const cron = new Cron(expression, { legacyMode: false });
  const next = cron.nextRun(afterDate);
  if (!next) {
    throw new Error(`Cron expression '${expression}' has no occurrences after ${afterDate.toISOString()}`);
  }
  return next.toISOString();
}
