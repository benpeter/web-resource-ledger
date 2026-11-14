// The nightly re-scan of captured URLs against Google Web Risk (src/rescan.js).
// Production checked most URLs only every second night (phase 0170): a check
// recorded at 03:00:40 was not yet 24 hours old when the next run started at
// 03:00:00, so the run skipped it.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleRescanTick } from '../src/rescan.js';
import { seedCapture, cleanDb } from './fixtures.js';

const HOUR = 60 * 60 * 1000;
const CAP = 'cap_' + '7'.repeat(32);
const rescanEnv = { ...env, GOOGLE_WEB_RISK_API_KEY: 'test-web-risk-key' };

async function seedCheckedCapture(lastCheckAt) {
  await seedCapture(env.DB, CAP, { status: 'complete', completedAt: new Date(Date.now() - 72 * HOUR).toISOString() });
  await env.DB.prepare('UPDATE captures SET last_threat_check_at = ? WHERE id = ?').bind(lastCheckAt, CAP).run();
}

async function runRescan() {
  const ctx = createExecutionContext();
  await handleRescanTick({ cron: '0 3 * * *', scheduledTime: Date.now() }, rescanEnv, ctx);
  await waitOnExecutionContext(ctx);
}

async function checksOf(id) {
  return (await env.DB.prepare('SELECT COUNT(*) AS n FROM threat_checks WHERE capture_id = ?').bind(id).first()).n;
}

beforeEach(async () => {
  await cleanDb(env.DB);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
});

afterEach(() => vi.restoreAllMocks());

describe('handleRescanTick', () => {
  it('checks a URL again that the previous night\'s run checked 40 seconds after the hour', async () => {
    await seedCheckedCapture(new Date(Date.now() - 24 * HOUR + 40 * 1000).toISOString());
    await runRescan();
    expect(await checksOf(CAP)).toBe(1);
  });

  it('leaves a URL alone that was checked an hour ago', async () => {
    await seedCheckedCapture(new Date(Date.now() - HOUR).toISOString());
    await runRescan();
    expect(await checksOf(CAP)).toBe(0);
  });
});
