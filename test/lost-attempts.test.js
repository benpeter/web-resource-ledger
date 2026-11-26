// Tests for scripts/lib/lost-attempts.js: which capture attempts were running
// in a Worker run that Cloudflare killed for memory or CPU. Such a run logs
// nothing more, so its attempt has a capture.dequeued and no outcome before
// the next delivery. The worker health alert lists them (backlog #99).
import { describe, it, expect } from 'vitest';
import { findLostAttempts, formatLostAttempts } from '../scripts/lib/lost-attempts.js';

const START = '2026-11-25T14:00:00.000Z';
const END = '2026-11-25T15:00:00.000Z';

function dequeued(ts, captureId, attempt, url = 'https://www.merriam-webster.com/dictionary/evidence', tenantId = 'gh-398734') {
  return { ts, event: 'capture.dequeued', captureId, attempt, tenantId, url };
}

function outcome(ts, event, captureId, attempt = null) {
  return { ts, event, captureId, attempt, tenantId: 'gh-398734', url: null };
}

describe('findLostAttempts', () => {
  // The staging run killed on 2026-11-25: attempt 2 has no outcome, attempt 3 follows
  it('finds an attempt whose next event is the next delivery', () => {
    const lost = findLostAttempts([
      dequeued('2026-11-25T14:20:56.808Z', 'cap_4d73', 1),
      outcome('2026-11-25T14:21:46.707Z', 'capture.stage.fail', 'cap_4d73', 1),
      outcome('2026-11-25T14:21:47.099Z', 'capture.retry', 'cap_4d73', 1),
      dequeued('2026-11-25T14:22:40.198Z', 'cap_4d73', 2),
      dequeued('2026-11-25T14:23:45.101Z', 'cap_4d73', 3),
      outcome('2026-11-25T14:25:40.710Z', 'capture.stage.fail', 'cap_4d73', 3),
    ], START, END);

    expect(lost).toEqual([
      { ts: '2026-11-25T14:22:40.198Z', captureId: 'cap_4d73', attempt: 2, tenantId: 'gh-398734', url: 'https://www.merriam-webster.com/dictionary/evidence' },
    ]);
  });

  it('finds an attempt that has no later event at all', () => {
    const lost = findLostAttempts([
      dequeued('2026-11-25T14:50:00.000Z', 'cap_aaaa', 1),
    ], START, END);

    expect(lost.map((a) => a.captureId)).toEqual(['cap_aaaa']);
  });

  it('leaves out attempts that logged an outcome', () => {
    const lost = findLostAttempts([
      dequeued('2026-11-25T14:22:30.020Z', 'cap_bbc1', 1, 'https://www.bbc.com/'),
      outcome('2026-11-25T14:23:15.898Z', 'capture.success', 'cap_bbc1'),
      dequeued('2026-11-25T14:44:13.039Z', 'cap_76a6', 1),
      outcome('2026-11-25T14:47:14.535Z', 'capture.stage.fail', 'cap_76a6', 1),
      outcome('2026-11-25T14:47:14.915Z', 'capture.retry', 'cap_76a6', 1),
      dequeued('2026-11-25T14:47:57.762Z', 'cap_76a6', 2),
      outcome('2026-11-25T14:48:32.141Z', 'capture.success', 'cap_76a6'),
    ], START, END);

    expect(lost).toEqual([]);
  });

  it('counts only attempts that started in the window', () => {
    const lost = findLostAttempts([
      dequeued('2026-11-25T13:59:59.000Z', 'cap_before', 1),
      dequeued('2026-11-25T15:00:00.000Z', 'cap_after', 1),
    ], START, END);

    expect(lost).toEqual([]);
  });
});

describe('formatLostAttempts', () => {
  it('names the time, the account, the GitHub login, the page and the capture', () => {
    const text = formatLostAttempts([
      { ts: '2026-11-25T14:22:40.198Z', captureId: 'cap_4d7364adf27f48d595dc1c6bb97b8de8', attempt: 2, tenantId: 'gh-398734', url: 'https://www.merriam-webster.com/dictionary/evidence' },
    ], { 'gh-398734': 'benpeter' });

    expect(text).toBe('14:22:40  gh-398734 (github: benpeter)  https://www.merriam-webster.com/dictionary/evidence  cap_4d7364adf27f48d595dc1c6bb97b8de8  attempt 2');
  });

  it('shows the account alone when there is no GitHub login', () => {
    const text = formatLostAttempts([
      { ts: '2026-11-25T14:22:40.198Z', captureId: 'cap_1', attempt: 1, tenantId: 'smoke-test', url: 'https://example.com/' },
    ], {});

    expect(text).toBe('14:22:40  smoke-test  https://example.com/  cap_1  attempt 1');
  });

  it('says so when no attempt was found', () => {
    expect(formatLostAttempts([], {})).toBe('No capture attempt without an outcome was found in the logs.');
  });
});
