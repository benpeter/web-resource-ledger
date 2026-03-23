// tva
// Unit tests for cron expression validation and next-run computation.
// Pure function tests -- no Worker bindings needed.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateCron, nextRunAfter } from '../src/cron.js';

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// validateCron -- valid expressions
// ---------------------------------------------------------------------------

describe('validateCron -- valid expressions', () => {
  it.each([
    ['0 * * * *',     'every hour on the hour'],
    ['30 8 * * 1-5',  'weekdays at 08:30'],
    ['0 0 1 * *',     'first of month at midnight'],
    ['0 */6 * * *',   'every 6 hours'],
    ['0 9 * * 1',     'Mondays at 09:00'],
    ['0 0 * * *',     'daily at midnight'],
  ])('accepts %s (%s)', (expr) => {
    const result = validateCron(expr);
    expect(result.ok).toBe(true);
    expect(result.cron).toBe(expr);
  });
});

// ---------------------------------------------------------------------------
// validateCron -- sub-hourly expressions (should reject)
// ---------------------------------------------------------------------------

describe('validateCron -- sub-hourly expressions', () => {
  it.each([
    ['*/5 * * * *',   'every 5 minutes'],
    ['0,30 * * * *',  'every 30 minutes via list'],
    ['* * * * *',     'every minute'],
    ['*/15 * * * *',  'every 15 minutes'],
  ])('rejects %s (%s) with minimum-interval detail', (expr) => {
    const result = validateCron(expr);
    expect(result.ok).toBe(false);
    // The detail should mention interval / frequency
    expect(result.detail).toMatch(/minute|interval|frequently/i);
  });
});

// ---------------------------------------------------------------------------
// validateCron -- malformed expressions
// ---------------------------------------------------------------------------

describe('validateCron -- malformed expressions', () => {
  it('rejects empty string', () => {
    const result = validateCron('');
    expect(result.ok).toBe(false);
    expect(result.detail.length).toBeGreaterThan(0);
  });

  it('rejects non-cron string', () => {
    const result = validateCron('not-a-cron');
    expect(result.ok).toBe(false);
  });

  it('rejects out-of-range hour (0 25 * * *)', () => {
    const result = validateCron('0 25 * * *');
    expect(result.ok).toBe(false);
  });

  it('rejects 6-field expression (0 * * * * *)', () => {
    const result = validateCron('0 * * * * *');
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('5 fields');
  });

  it('rejects @daily shorthand', () => {
    const result = validateCron('@daily');
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('@daily');
  });

  it('rejects @reboot shorthand', () => {
    const result = validateCron('@reboot');
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('@reboot');
  });
});

// ---------------------------------------------------------------------------
// nextRunAfter -- fixed reference time via vi.useFakeTimers
// ---------------------------------------------------------------------------

describe('nextRunAfter -- fixed reference date', () => {
  it('0 * * * * after 10:30 UTC returns 11:00 UTC same day', () => {
    const ref = new Date('2026-03-23T10:30:00Z');
    const next = nextRunAfter('0 * * * *', ref);
    expect(next).toBe('2026-03-23T11:00:00.000Z');
  });

  it('0 0 * * * after 10:30 UTC returns a next-midnight occurrence after the reference', () => {
    const ref = new Date('2026-03-23T10:30:00Z');
    const next = nextRunAfter('0 0 * * *', ref);
    const nextDate = new Date(next);
    // Must be strictly after the reference
    expect(nextDate.getTime()).toBeGreaterThan(ref.getTime());
    // Must be at minute=0 hour=0 (midnight in the cron's local timezone)
    expect(nextDate.getUTCMinutes()).toBe(0);
    // Must be within 25 hours of the reference (within ~1 day)
    const diffHours = (nextDate.getTime() - ref.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeLessThanOrEqual(25);
  });

  it('returns a strictly later time than the reference', () => {
    const ref = new Date('2026-03-23T10:00:00Z');
    const next = nextRunAfter('0 * * * *', ref);
    expect(new Date(next).getTime()).toBeGreaterThan(ref.getTime());
  });
});
