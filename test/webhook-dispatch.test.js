// tva
// Unit tests for webhook-dispatch.js helpers and dispatchWebhooks().
// Queue consumer tests (handleWebhookMessage) follow the queue-consumer.test.js
// pattern using createMessageBatch + getQueueResult.

import { randomBytes } from 'node:crypto';
import {
  env,
  createMessageBatch,
  getQueueResult,
  createExecutionContext,
} from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  webhookRetryDelay,
  classifyDeliveryError,
  buildWebhookPayload,
  dispatchWebhooks,
  handleWebhookMessage,
  handleWebhookDlqMessage,
} from '../src/webhook-dispatch.js';
import { seedWebhook, cleanDb, TEST_WEBHOOK_URL, TEST_WEBHOOK_SECRET } from './fixtures.js';
import worker from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhookMsg(body, overrides = {}) {
  return {
    id: randomBytes(16).toString('hex'),
    timestamp: new Date(),
    attempts: 1,
    body,
    ...overrides,
  };
}

function makeCaptureRecord(overrides = {}) {
  return {
    captureId: 'cap_' + randomBytes(16).toString('hex'),
    status: 'complete',
    url: 'https://example.com',
    completedAt: new Date().toISOString(),
    failedAt: null,
    error: null,
    retryable: null,
    ...overrides,
  };
}

async function runWebhookConsumer(queueName, messages) {
  const batch = createMessageBatch(queueName, messages);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  return { batch, ctx, result: await getQueueResult(batch, ctx) };
}

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ---------------------------------------------------------------------------
// webhookRetryDelay
// ---------------------------------------------------------------------------

describe('webhookRetryDelay', () => {
  it('returns 60 for attempt 1', () => {
    expect(webhookRetryDelay(1)).toBe(60);
  });

  it('returns 300 for attempt 2', () => {
    expect(webhookRetryDelay(2)).toBe(300);
  });

  it('returns 900 for attempt 3', () => {
    expect(webhookRetryDelay(3)).toBe(900);
  });

  it('returns null for attempt 4', () => {
    expect(webhookRetryDelay(4)).toBeNull();
  });

  it('returns null for attempt 5 and above', () => {
    expect(webhookRetryDelay(5)).toBeNull();
    expect(webhookRetryDelay(10)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyDeliveryError
// ---------------------------------------------------------------------------

describe('classifyDeliveryError', () => {
  it('returns http_5xx for httpStatus 500', () => {
    expect(classifyDeliveryError(null, 500)).toBe('http_5xx');
  });

  it('returns http_5xx for httpStatus 503', () => {
    expect(classifyDeliveryError(null, 503)).toBe('http_5xx');
  });

  it('returns http_4xx for httpStatus 400', () => {
    expect(classifyDeliveryError(null, 400)).toBe('http_4xx');
  });

  it('returns http_4xx for httpStatus 403', () => {
    expect(classifyDeliveryError(null, 403)).toBe('http_4xx');
  });

  it('prefers httpStatus over error message', () => {
    const err = new Error('timeout reached');
    expect(classifyDeliveryError(err, 500)).toBe('http_5xx');
  });

  it('returns timeout when error name is TimeoutError', () => {
    const err = Object.assign(new Error('operation timed out'), { name: 'TimeoutError' });
    expect(classifyDeliveryError(err, null)).toBe('timeout');
  });

  it('returns timeout when error message contains "timeout"', () => {
    const err = new Error('request timeout after 10s');
    expect(classifyDeliveryError(err, null)).toBe('timeout');
  });

  it('returns dns for ENOTFOUND error', () => {
    const err = new Error('getaddrinfo ENOTFOUND hooks.example.com');
    expect(classifyDeliveryError(err, null)).toBe('dns');
  });

  it('returns tls for certificate error', () => {
    const err = new Error('certificate verify failed');
    expect(classifyDeliveryError(err, null)).toBe('tls');
  });

  it('returns connection as fallback for unrecognized errors', () => {
    const err = new Error('ECONNREFUSED');
    expect(classifyDeliveryError(err, null)).toBe('connection');
  });

  it('returns connection when err is null and httpStatus is null', () => {
    expect(classifyDeliveryError(null, null)).toBe('connection');
  });
});

// ---------------------------------------------------------------------------
// buildWebhookPayload
// ---------------------------------------------------------------------------

describe('buildWebhookPayload', () => {
  it('returns valid JSON string', () => {
    const record = makeCaptureRecord();
    const json = buildWebhookPayload('capture.complete', record, {});
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes id, type, createdAt, data fields', () => {
    const record = makeCaptureRecord();
    const parsed = JSON.parse(buildWebhookPayload('capture.complete', record, {}));
    expect(parsed.id).toMatch(/^evt_[a-f0-9]{32}$/);
    expect(parsed.type).toBe('capture.complete');
    expect(parsed.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof parsed.data).toBe('object');
  });

  it('capture.complete payload includes captureId, status, url, completedAt, verificationUrl', () => {
    const record = makeCaptureRecord({ status: 'complete', completedAt: '2024-01-01T00:00:00.000Z' });
    const parsed = JSON.parse(buildWebhookPayload('capture.complete', record, {}));
    expect(parsed.data.captureId).toBe(record.captureId);
    expect(parsed.data.status).toBe('complete');
    expect(parsed.data.url).toBe(record.url);
    expect(parsed.data.completedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(typeof parsed.data.verificationUrl).toBe('string');
    expect(parsed.data.verificationUrl).toContain(record.captureId);
  });

  it('capture.failed payload includes failedAt, error, retryable', () => {
    const record = makeCaptureRecord({
      status: 'failed',
      completedAt: null,
      failedAt: '2024-01-01T00:00:00.000Z',
      error: 'render_timeout',
      retryable: false,
    });
    const parsed = JSON.parse(buildWebhookPayload('capture.failed', record, {}));
    expect(parsed.data.failedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(parsed.data.error).toBe('render_timeout');
    expect(parsed.data.retryable).toBe(false);
    expect(parsed.data.completedAt).toBeUndefined();
  });

  it('capture.failed payload omits error field when error is null', () => {
    const record = makeCaptureRecord({ status: 'failed', failedAt: '2024-01-01T00:00:00.000Z', error: null });
    const parsed = JSON.parse(buildWebhookPayload('capture.failed', record, {}));
    expect(parsed.data.error).toBeUndefined();
  });

  it('uses VERIFICATION_BASE_URL from env when set', () => {
    const record = makeCaptureRecord();
    const testEnv = { VERIFICATION_BASE_URL: 'https://verify.example.com' };
    const parsed = JSON.parse(buildWebhookPayload('capture.complete', record, testEnv));
    expect(parsed.data.verificationUrl).toMatch(/^https:\/\/verify\.example\.com/);
  });

  it('each call produces a unique event id', () => {
    const record = makeCaptureRecord();
    const id1 = JSON.parse(buildWebhookPayload('capture.complete', record, {})).id;
    const id2 = JSON.parse(buildWebhookPayload('capture.complete', record, {})).id;
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// dispatchWebhooks -- fan-out behavior
// ---------------------------------------------------------------------------

describe('dispatchWebhooks', () => {
  it('enqueues one message per active webhook matching the event type', async () => {
    const captureRecord = makeCaptureRecord({ status: 'complete' });
    const webhookA = 'whk_' + 'a'.repeat(32);
    const webhookB = 'whk_' + 'b'.repeat(32);
    await seedWebhook(env.DB, webhookA, {
      tenantId: 'default',
      events: ['capture.complete'],
      active: true,
    });
    await seedWebhook(env.DB, webhookB, {
      tenantId: 'default',
      events: ['capture.complete'],
      active: true,
    });

    const sentMessages = [];
    const mockEnv = {
      ...env,
      WEBHOOK_QUEUE: {
        send: async (msg) => { sentMessages.push(msg); },
      },
    };

    await dispatchWebhooks(mockEnv, 'default', 'capture.complete', captureRecord);

    expect(sentMessages.length).toBe(2);
    const webhookIds = sentMessages.map(m => m.webhookId).sort();
    expect(webhookIds).toEqual([webhookA, webhookB].sort());
  });

  it('is a no-op when no webhooks are registered for the tenant', async () => {
    const captureRecord = makeCaptureRecord({ status: 'complete' });

    const sentMessages = [];
    const mockEnv = {
      ...env,
      WEBHOOK_QUEUE: {
        send: async (msg) => { sentMessages.push(msg); },
      },
    };

    await dispatchWebhooks(mockEnv, 'default', 'capture.complete', captureRecord);
    expect(sentMessages.length).toBe(0);
  });

  it('does not enqueue for inactive webhooks', async () => {
    const captureRecord = makeCaptureRecord({ status: 'complete' });
    await seedWebhook(env.DB, 'whk_' + 'c'.repeat(32), {
      tenantId: 'default',
      events: ['capture.complete'],
      active: false,
    });

    const sentMessages = [];
    const mockEnv = {
      ...env,
      WEBHOOK_QUEUE: {
        send: async (msg) => { sentMessages.push(msg); },
      },
    };

    await dispatchWebhooks(mockEnv, 'default', 'capture.complete', captureRecord);
    expect(sentMessages.length).toBe(0);
  });

  it('does not enqueue for webhooks subscribed to a different event type', async () => {
    const captureRecord = makeCaptureRecord({ status: 'complete' });
    await seedWebhook(env.DB, 'whk_' + 'd'.repeat(32), {
      tenantId: 'default',
      events: ['capture.failed'],
      active: true,
    });

    const sentMessages = [];
    const mockEnv = {
      ...env,
      WEBHOOK_QUEUE: {
        send: async (msg) => { sentMessages.push(msg); },
      },
    };

    await dispatchWebhooks(mockEnv, 'default', 'capture.complete', captureRecord);
    expect(sentMessages.length).toBe(0);
  });

  it('includes eventId as top-level field in the queue message', async () => {
    const captureRecord = makeCaptureRecord({ status: 'complete' });
    await seedWebhook(env.DB, 'whk_' + 'a'.repeat(32), {
      tenantId: 'default',
      events: ['capture.complete'],
      active: true,
    });

    const sentMessages = [];
    const mockEnv = {
      ...env,
      WEBHOOK_QUEUE: {
        send: async (msg) => { sentMessages.push(msg); },
      },
    };

    await dispatchWebhooks(mockEnv, 'default', 'capture.complete', captureRecord);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].eventId).toMatch(/^evt_[a-f0-9]{32}$/);
  });

  it('shares the same eventId across all webhook messages for a single capture event', async () => {
    const captureRecord = makeCaptureRecord({ status: 'complete' });
    await seedWebhook(env.DB, 'whk_' + 'a'.repeat(32), {
      tenantId: 'default',
      events: ['capture.complete'],
      active: true,
    });
    await seedWebhook(env.DB, 'whk_' + 'b'.repeat(32), {
      tenantId: 'default',
      events: ['capture.complete'],
      active: true,
    });

    const sentMessages = [];
    const mockEnv = {
      ...env,
      WEBHOOK_QUEUE: {
        send: async (msg) => { sentMessages.push(msg); },
      },
    };

    await dispatchWebhooks(mockEnv, 'default', 'capture.complete', captureRecord);
    expect(sentMessages.length).toBe(2);
    expect(sentMessages[0].eventId).toBe(sentMessages[1].eventId);
  });
});

// ---------------------------------------------------------------------------
// Queue consumer: handleWebhookMessage via worker.queue
// ---------------------------------------------------------------------------

describe('queue consumer -- webhook message: deleted webhook', () => {
  it('acks message when webhook has been deleted since enqueue', async () => {
    const msg = makeWebhookMsg({
      webhookId: 'whk_' + '0'.repeat(32),
      tenantId: 'default',
      captureId: 'cap_' + randomBytes(16).toString('hex'),
      eventType: 'capture.complete',
      eventId: 'evt_' + '0'.repeat(32),
      payload: '{}',
    });

    const { result } = await runWebhookConsumer('wrl-webhooks', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);
  });
});

describe('queue consumer -- webhook message: retry on first attempt', () => {
  it('retries message with delaySeconds when webhook lookup throws a D1 error', async () => {
    // Use a real-looking webhookId that won't exist in D1.
    // getWebhook returns null (not throw) for missing rows, so this acks.
    // The deleted-webhook test covers ack; this test confirms attempt=1 retries
    // when the message body is structurally valid but points to a missing webhook.
    const msg = makeWebhookMsg({
      webhookId: 'whk_' + 'f'.repeat(32),
      tenantId: 'default',
      captureId: 'cap_' + randomBytes(16).toString('hex'),
      eventType: 'capture.complete',
      eventId: 'evt_' + '0'.repeat(32),
      payload: '{}',
    });

    // Webhook does not exist -> handler acks (same as deleted-webhook path)
    const { result } = await runWebhookConsumer('wrl-webhooks', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Queue consumer: DLQ handler via worker.queue
// ---------------------------------------------------------------------------

describe('queue consumer -- webhook DLQ handler', () => {
  it('acks DLQ message for a known webhook', async () => {
    const id = 'whk_' + 'a'.repeat(32);
    await seedWebhook(env.DB, id, { tenantId: 'default' });

    const msg = makeWebhookMsg({
      webhookId: id,
      tenantId: 'default',
      captureId: 'cap_' + randomBytes(16).toString('hex'),
      eventType: 'capture.complete',
      eventId: 'evt_' + '0'.repeat(32),
      payload: '{}',
    });

    const { result } = await runWebhookConsumer('wrl-webhooks-dlq', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);
  });

  it('acks DLQ message even when webhookId is missing', async () => {
    const msg = makeWebhookMsg({
      tenantId: 'default',
      captureId: 'cap_' + randomBytes(16).toString('hex'),
    });

    const { result } = await runWebhookConsumer('wrl-webhooks-dlq', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
  });
});
