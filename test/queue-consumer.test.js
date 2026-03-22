// tva
// Unit tests for the queue() handler in src/index.js.
//
// The queue handler is tested by:
//   1. Writing a pending KV record (simulating what the HTTP producer creates)
//   2. Creating a synthetic MessageBatch via createMessageBatch()
//   3. Calling worker.queue() directly
//   4. Inspecting ack/retry state via getQueueResult()
//   5. Reading KV to verify status transitions
//
// Renderer injection is NOT available here because the queue handler calls
// performCapture() with the default (real) renderer. We rely on the fact that
// the test environment has no real BROWSER binding, so defaultRenderer throws,
// which categorizes as a retryable catch-all. Tests that need to control the
// outcome must manipulate the KV state before running (idempotency tests).
//
// For controlled outcomes we use the stubRenderer-style pattern from
// capture.test.js where renderer injection is available. Queue consumer tests
// focus on the handler plumbing: ack vs retry, DLQ handling, idempotency,
// and message validation.

import { randomBytes } from 'node:crypto';
import {
  env,
  createMessageBatch,
  getQueueResult,
  createExecutionContext,
} from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { createCapture, getCapture, completeCapture, failCapture } from '../src/kv.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId() {
  return 'cap_' + randomBytes(16).toString('hex');
}

function makeMsg(captureId, overrides = {}) {
  return {
    id: randomBytes(16).toString('hex'),
    timestamp: new Date(),
    attempts: 1,
    body: {
      captureId,
      url: 'https://example.com/',
      ip: '93.184.216.34',
      tenantId: 'default',
      cip: undefined,
      enqueuedAt: Date.now(),
      ...overrides,
    },
  };
}

async function runConsumer(queueName, messages) {
  const batch = createMessageBatch(queueName, messages);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  return { batch, ctx, result: await getQueueResult(batch, ctx) };
}

// ---------------------------------------------------------------------------
// KV cleanup between tests -- wipe captures
// ---------------------------------------------------------------------------

beforeEach(async () => {
  const { keys } = await env.KV.list({ prefix: 'capture:' });
  for (const k of keys) await env.KV.delete(k.name);
});

// ---------------------------------------------------------------------------
// 1. Malformed message: missing captureId
// ---------------------------------------------------------------------------

describe('queue consumer -- malformed message', () => {
  it('acks message when captureId is missing', async () => {
    const msg = {
      id: randomBytes(16).toString('hex'),
      timestamp: new Date(),
      attempts: 1,
      body: { url: 'https://example.com/', tenantId: 'default' },
    };
    const { result } = await runConsumer('wrl-captures', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);
  });

  it('acks message when body is entirely empty', async () => {
    const msg = {
      id: randomBytes(16).toString('hex'),
      timestamp: new Date(),
      attempts: 1,
      body: {},
    };
    const { result } = await runConsumer('wrl-captures', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
  });

  it('acks message when url is missing', async () => {
    const captureId = makeId();
    const msg = {
      id: randomBytes(16).toString('hex'),
      timestamp: new Date(),
      attempts: 1,
      body: { captureId, tenantId: 'default' },
    };
    const { result } = await runConsumer('wrl-captures', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
  });
});

// ---------------------------------------------------------------------------
// 2. Invalid tenantId: tenantId with special chars rejected
// ---------------------------------------------------------------------------

describe('queue consumer -- invalid tenantId', () => {
  it('acks message when tenantId contains special chars', async () => {
    const captureId = makeId();
    const msg = {
      id: randomBytes(16).toString('hex'),
      timestamp: new Date(),
      attempts: 1,
      body: {
        captureId,
        url: 'https://example.com/',
        tenantId: 'bad tenant!@#',
        ip: '93.184.216.34',
        enqueuedAt: Date.now(),
      },
    };
    const { result } = await runConsumer('wrl-captures', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Idempotency: already-complete record
// ---------------------------------------------------------------------------

describe('queue consumer -- idempotency: complete record', () => {
  it('acks message when KV record is already complete', async () => {
    const captureId = makeId();
    await createCapture(env.KV, captureId, 'https://example.com/', '93.184.216.34', 'default');
    await completeCapture(env.KV, captureId, {
      screenshot: `captures/${captureId}/screenshot.png`,
      html: `captures/${captureId}/rendered.html`,
    });

    const msg = makeMsg(captureId);
    const { result } = await runConsumer('wrl-captures', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);

    // KV record should remain complete (not re-processed)
    const record = await getCapture(env.KV, captureId);
    expect(record.status).toBe('complete');
  });
});

// ---------------------------------------------------------------------------
// 4. Idempotency: already-failed record
// ---------------------------------------------------------------------------

describe('queue consumer -- idempotency: failed record', () => {
  it('acks message when KV record is already failed', async () => {
    const captureId = makeId();
    await createCapture(env.KV, captureId, 'https://example.com/', '93.184.216.34', 'default');
    await failCapture(env.KV, captureId, 'prior failure', false);

    const msg = makeMsg(captureId);
    const { result } = await runConsumer('wrl-captures', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);

    // KV record should remain failed (not re-processed)
    const record = await getCapture(env.KV, captureId);
    expect(record.status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// 5. Retryable error path: pending KV record, no real browser
// In the test env, defaultRenderer throws because BROWSER is a mock
// browserRendering binding that can't actually launch. That error is
// catch-all retryable. On first attempt (attempts=1, <4), handler retries.
// ---------------------------------------------------------------------------

describe('queue consumer -- retryable path (no real browser)', () => {
  it('retries message on first attempt when performCapture returns retryable', async () => {
    const captureId = makeId();
    await createCapture(env.KV, captureId, 'https://example.com/', '93.184.216.34', 'default');

    const msg = makeMsg(captureId);
    const { result } = await runConsumer('wrl-captures', [msg]);

    // retryMessages is an array of { msgId } objects (not plain strings)
    const retried = result.retryMessages.some(m => m.msgId === msg.id);
    const acked = result.explicitAcks.includes(msg.id);
    // First attempt: should retry (not ack), since attempts=1 < 4
    expect(retried).toBe(true);
    expect(acked).toBe(false);
  });

  it('KV record stays pending on retryable failure at attempt 1', async () => {
    const captureId = makeId();
    await createCapture(env.KV, captureId, 'https://example.com/', '93.184.216.34', 'default');

    const msg = makeMsg(captureId, { attempts: 1 });
    await runConsumer('wrl-captures', [msg]);

    const record = await getCapture(env.KV, captureId);
    // On a retryable error at attempt 1, KV should remain pending
    expect(record.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// 6. DLQ message: queue name ends with -dlq
//    DLQ handler calls failCapture regardless of message content.
// ---------------------------------------------------------------------------

describe('queue consumer -- DLQ handler', () => {
  it('updates KV to failed when DLQ receives a message with a valid captureId', async () => {
    const captureId = makeId();
    await createCapture(env.KV, captureId, 'https://example.com/', '93.184.216.34', 'default');

    const msg = makeMsg(captureId);
    const { result } = await runConsumer('wrl-captures-dlq', [msg]);

    // DLQ handler always acks
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);

    // KV should be updated to failed
    const record = await getCapture(env.KV, captureId);
    expect(record.status).toBe('failed');
    expect(record.error).toBeTruthy();
  });

  it('acks DLQ message even when captureId is missing (graceful degradation)', async () => {
    const msg = {
      id: randomBytes(16).toString('hex'),
      timestamp: new Date(),
      attempts: 1,
      body: { url: 'https://example.com/' },
    };
    const { result } = await runConsumer('wrl-captures-dlq', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
  });
});

// ---------------------------------------------------------------------------
// 7. URL validation in consumer
//    The queue handler re-validates the URL from the message body (SSRF guard).
//    Private IP addresses should be acked (dropped), not retried.
// ---------------------------------------------------------------------------

describe('queue consumer -- URL validation', () => {
  it('acks and drops message with private IP url', async () => {
    const captureId = makeId();
    await createCapture(env.KV, captureId, 'http://10.0.0.1/', '10.0.0.1', 'default');

    const msg = {
      id: randomBytes(16).toString('hex'),
      timestamp: new Date(),
      attempts: 1,
      body: {
        captureId,
        url: 'http://10.0.0.1/',
        ip: '10.0.0.1',
        tenantId: 'default',
        enqueuedAt: Date.now(),
      },
    };
    const { result } = await runConsumer('wrl-captures', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);
  });
});
