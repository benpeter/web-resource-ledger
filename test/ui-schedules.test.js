/**
 * Schedules view helpers (phase 0132): building the PATCH body from the edit
 * form, and the captures-list filter for one schedule. The view code is a
 * string served to the browser, so the pure helpers are pulled out of it the
 * same way test/ui-submit.test.js does.
 */

import { describe, it, expect } from 'vitest';
import { SCHEDULES_JS } from '../src/ui/ui-schedules.js';
import { SUBMIT_VIEW_JS } from '../src/ui/ui-submit.js';

function evalFromSource(source, functionName) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(source + '\nreturn ' + functionName + ';');
  return fn();
}

const SCHED = {
  id: 'sch_' + 'a'.repeat(32),
  name: 'Homepage',
  url: 'https://example.com/',
  cron: '0 * * * *',
  paused: false,
};

describe('scheduleUpdateBody -- only changed fields go into the PATCH body', () => {
  const scheduleUpdateBody = evalFromSource(SCHEDULES_JS, 'scheduleUpdateBody');

  it('returns an empty object when nothing changed', () => {
    expect(scheduleUpdateBody(SCHED, { name: 'Homepage', url: 'https://example.com/', cron: '0 * * * *' })).toEqual({});
  });

  it('includes only the fields that differ', () => {
    expect(scheduleUpdateBody(SCHED, { name: 'Home', url: 'https://example.com/', cron: '0 0 * * *' }))
      .toEqual({ name: 'Home', cron: '0 0 * * *' });
  });

  it('trims whitespace before comparing', () => {
    expect(scheduleUpdateBody(SCHED, { name: '  Homepage ', url: ' https://example.com/ ', cron: ' 0 * * * * ' })).toEqual({});
  });

  it('does not send an empty name, so an unnamed schedule stays valid', () => {
    expect(scheduleUpdateBody({ ...SCHED, name: null }, { name: '', url: SCHED.url, cron: SCHED.cron })).toEqual({});
  });

  it('sends a changed URL as typed (the server normalizes and checks it)', () => {
    expect(scheduleUpdateBody(SCHED, { name: 'Homepage', url: 'https://example.com/pricing', cron: '0 * * * *' }))
      .toEqual({ url: 'https://example.com/pricing' });
  });
});

describe('capturesScheduleFilter -- reading the schedule filter from the captures URL', () => {
  const capturesScheduleFilter = evalFromSource(SUBMIT_VIEW_JS, 'capturesScheduleFilter');

  it('returns the schedule id from ?schedule=', () => {
    expect(capturesScheduleFilter('?schedule=' + SCHED.id)).toBe(SCHED.id);
  });

  it('returns null without a schedule parameter', () => {
    expect(capturesScheduleFilter('')).toBeNull();
    expect(capturesScheduleFilter('?status=failed')).toBeNull();
  });

  it('ignores a value that is not a schedule id', () => {
    expect(capturesScheduleFilter('?schedule=../../admin')).toBeNull();
    expect(capturesScheduleFilter('?schedule=sch_123')).toBeNull();
  });
});

describe('scheduleStatusLabel -- what the status badge says', () => {
  const scheduleStatusLabel = evalFromSource(SCHEDULES_JS, 'scheduleStatusLabel');

  it('says Paused for a paused schedule', () => {
    expect(scheduleStatusLabel({ ...SCHED, paused: true, lastRunAt: 'x', lastCaptureStatus: 'failed' })).toBe('Paused');
  });

  it('says Pending before the first run', () => {
    expect(scheduleStatusLabel({ ...SCHED, lastRunAt: null })).toBe('Pending');
  });

  it('says Error when the last capture failed (reads lastCaptureStatus, the field the API sends)', () => {
    expect(scheduleStatusLabel({ ...SCHED, lastRunAt: '2026-10-23T10:00:00.000Z', lastCaptureStatus: 'failed' })).toBe('Error');
  });

  it('says Active when the last capture completed or is still running', () => {
    expect(scheduleStatusLabel({ ...SCHED, lastRunAt: '2026-10-23T10:00:00.000Z', lastCaptureStatus: 'complete' })).toBe('Active');
    expect(scheduleStatusLabel({ ...SCHED, lastRunAt: '2026-10-23T10:00:00.000Z', lastCaptureStatus: 'pending' })).toBe('Active');
  });
});

describe('scheduleNextRunText -- the Next run column', () => {
  const scheduleNextRunText = evalFromSource(SCHEDULES_JS, 'scheduleNextRunText');

  it('shows no next run for a paused schedule (resuming picks a new one from now)', () => {
    expect(scheduleNextRunText({ ...SCHED, paused: true, nextRunAt: '2026-10-25T00:00:00.000Z' })).toBe('\u2014');
  });

  it('shows a dash when there is no next run time', () => {
    expect(scheduleNextRunText({ ...SCHED, nextRunAt: null })).toBe('\u2014');
  });

  it('shows the next run time for an active schedule', () => {
    const text = scheduleNextRunText({ ...SCHED, paused: false, nextRunAt: '2026-10-25T00:00:00.000Z' });
    expect(text).not.toBe('\u2014');
    expect(text).toMatch(/2026/);
  });
});
