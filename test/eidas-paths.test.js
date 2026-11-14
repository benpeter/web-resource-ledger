// tva
// An account that turned on qualified (eIDAS) timestamps gets one on every
// capture, whichever way the capture was started: the queue message for the
// capture carries qualifiedTimestamps: true. Until phase 0156 only POST
// /v1/captures set it; batch, MCP and scheduled captures went without.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import worker from '../src/index.js';
import { handleMcp } from '../src/mcp.js';
import { cleanDb, seedApiKey, seedSchedule } from './fixtures.js';

const KEY = 'wrl_live_' + 'e'.repeat(43);
const TENANT = 'eidas-tenant';
// IP literals, so the URL check needs no DNS
const URL_A = 'https://93.184.216.34/';
const URL_B = 'https://93.184.216.35/';

let sent;
let testEnv;

beforeEach(async () => {
  await cleanDb(env.DB);
  const { keys } = await env.KV.list({ prefix: 'rl:' });
  for (const k of keys) await env.KV.delete(k.name);
  await seedApiKey(env.DB, KEY, { tenantId: TENANT, scopes: ['capture', 'read'] });
  await env.DB.prepare('UPDATE tenants SET eidas_qualified = 1, payment_method_added_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), TENANT).run();
  sent = [];
  testEnv = {
    ...env,
    CAPTURE_QUEUE: {
      send: async (body) => { sent.push(body); },
      sendBatch: async (messages) => { sent.push(...messages.map((m) => m.body)); },
    },
  };
});

afterEach(async () => {
  await cleanDb(env.DB);
});

async function rest(path, body) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}`, 'CF-Connecting-IP': '198.51.100.7' },
    body: JSON.stringify(body),
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function mcp(name, args) {
  const ctx = createExecutionContext();
  const res = await handleMcp(new Request('https://worker.test/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return (await res.json()).result;
}

describe('qualified timestamps on every capture path', () => {
  it('POST /v1/captures', async () => {
    expect((await rest('/v1/captures', { url: URL_A })).status).toBe(202);
    expect(sent.map((m) => m.qualifiedTimestamps)).toEqual([true]);
  });

  it('POST /v1/captures/batch', async () => {
    expect((await rest('/v1/captures/batch', { urls: [{ url: URL_A }, { url: URL_B }] })).status).toBe(207);
    expect(sent.map((m) => m.qualifiedTimestamps)).toEqual([true, true]);
  });

  it('MCP capture_url', async () => {
    expect((await mcp('capture_url', { url: URL_A })).isError).toBeUndefined();
    expect(sent.map((m) => m.qualifiedTimestamps)).toEqual([true]);
  });

  it('MCP batch_capture', async () => {
    expect((await mcp('batch_capture', { urls: [URL_A, URL_B] })).isError).toBeUndefined();
    expect(sent.map((m) => m.qualifiedTimestamps)).toEqual([true, true]);
  });

  it('scheduled captures', async () => {
    await seedSchedule(env.DB, 'sch_' + 'e'.repeat(32), {
      tenantId: TENANT,
      url: URL_A,
      nextRunAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    const ctx = createExecutionContext();
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/1 * * * *', noRetry() {} }, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(sent.map((m) => m.qualifiedTimestamps)).toEqual([true]);
  });

  it('accounts without the setting get none', async () => {
    await env.DB.prepare('UPDATE tenants SET eidas_qualified = 0 WHERE id = ?').bind(TENANT).run();
    await rest('/v1/captures/batch', { urls: [{ url: URL_A }] });
    await mcp('capture_url', { url: URL_B });
    expect(sent.map((m) => Boolean(m.qualifiedTimestamps))).toEqual([false, false]);
  });
});
