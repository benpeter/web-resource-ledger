// tva
// Tests for email-dispatch.js:
//   - dispatchNotification suppression paths
//   - dispatchNotification enqueue path
//   - handleEmailMessage ack/retry behavior
//   - handleEmailDlqMessage ack behavior
//   - RFC 8058 List-Unsubscribe headers in Resend request

import { randomBytes } from 'node:crypto';
import {
  env,
  createMessageBatch,
  getQueueResult,
  createExecutionContext,
} from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  dispatchNotification,
  handleEmailMessage,
  handleEmailDlqMessage,
} from '../src/email-dispatch.js';
import { cleanDb } from './fixtures.js';
import worker from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a notification_preferences row with email verified and all types enabled. */
async function seedNotificationPrefs(db, tenantId, {
  email = 'user@example.com',
  emailVerified = 1,
  notificationType = null, // if set, disable only this type
} = {}) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(`
      INSERT OR IGNORE INTO notification_preferences
        (tenant_id, email, email_verified,
         notify_capture_failure, notify_approaching_limit, notify_limit_reached,
         notify_invoice_generated, notify_payment_failure, notify_weekly_digest)
      VALUES (?, ?, ?, 1, 1, 1, 1, 1, 1)
    `).bind(tenantId, email, emailVerified),
  ]);

  if (notificationType) {
    const col = `notify_${notificationType}`;
    await db.prepare(`UPDATE notification_preferences SET ${col} = 0 WHERE tenant_id = ?`).bind(tenantId).run();
  }
}

/** Build a minimal mock env with controllable EMAIL_QUEUE.send */
function makeEmailEnv(sentMessages) {
  return {
    ...env,
    EMAIL_QUEUE: {
      send: async (msg) => { sentMessages.push(msg); },
    },
    // SESSION_SECRET must be present for unsubscribe token generation
  };
}

/** Build a queue message for the email consumer. */
function makeEmailMsg(body, overrides = {}) {
  return {
    id: randomBytes(16).toString('hex'),
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

async function runEmailConsumer(queueName, messages) {
  const batch = createMessageBatch(queueName, messages);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  return { batch, ctx, result: await getQueueResult(batch, ctx) };
}

const CAPTURE_FAILURE_DATA = {
  url: 'https://example.com',
  errorCategory: 'render_timeout',
  failedAt: new Date().toISOString(),
  captureDetailUrl: 'https://api.webresourceledger.com/v1/captures/cap_abc/certificate',
};

const APPROACHING_LIMIT_DATA = {
  used: 180,
  limit: 200,
  period: 'March 2026',
  addPaymentUrl: 'https://api.webresourceledger.com/v1/billing/checkout',
};

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ---------------------------------------------------------------------------
// dispatchNotification -- suppression: no email configured
// ---------------------------------------------------------------------------

describe('dispatchNotification -- no email configured', () => {
  it('suppresses when no notification_preferences row exists', async () => {
    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'capture_failure', CAPTURE_FAILURE_DATA);
    expect(sent.length).toBe(0);
  });

  it('suppresses when email is null', async () => {
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('default'),
      env.DB.prepare('INSERT OR IGNORE INTO notification_preferences (tenant_id, email, email_verified) VALUES (?, NULL, 0)').bind('default'),
    ]);

    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'capture_failure', CAPTURE_FAILURE_DATA);
    expect(sent.length).toBe(0);
  });

  it('suppresses when email is present but not verified', async () => {
    await seedNotificationPrefs(env.DB, 'default', { email: 'user@example.com', emailVerified: 0 });

    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'capture_failure', CAPTURE_FAILURE_DATA);
    expect(sent.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// dispatchNotification -- suppression: notification type opted out
// ---------------------------------------------------------------------------

describe('dispatchNotification -- opted out', () => {
  it('suppresses when capture_failure is opted out', async () => {
    await seedNotificationPrefs(env.DB, 'default', { notificationType: 'capture_failure' });

    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'capture_failure', CAPTURE_FAILURE_DATA);
    expect(sent.length).toBe(0);
  });

  it('suppresses when approaching_limit is opted out', async () => {
    await seedNotificationPrefs(env.DB, 'default', { notificationType: 'approaching_limit' });

    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'approaching_limit', APPROACHING_LIMIT_DATA);
    expect(sent.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// dispatchNotification -- period-based deduplication
// ---------------------------------------------------------------------------

describe('dispatchNotification -- deduplication', () => {
  it('suppresses approaching_limit when already sent this period', async () => {
    await seedNotificationPrefs(env.DB, 'default');

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO notification_sent (tenant_id, period, event_type) VALUES (?, ?, ?)',
    ).bind('default', period, 'approaching_limit').run();

    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'approaching_limit', APPROACHING_LIMIT_DATA);
    expect(sent.length).toBe(0);
  });

  it('suppresses limit_reached when already sent this period', async () => {
    await seedNotificationPrefs(env.DB, 'default');

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO notification_sent (tenant_id, period, event_type) VALUES (?, ?, ?)',
    ).bind('default', period, 'limit_reached').run();

    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'limit_reached', {
      used: 200, limit: 200, period: 'March 2026',
      addPaymentUrl: 'https://example.com/billing',
    });
    expect(sent.length).toBe(0);
  });

  it('suppresses capture_failure when already sent this period', async () => {
    await seedNotificationPrefs(env.DB, 'default');

    // capture_failure uses the same YYYY-MM dedup as the threshold types.
    // The notification_sent schema enforces YYYY-MM format.
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO notification_sent (tenant_id, period, event_type) VALUES (?, ?, ?)',
    ).bind('default', period, 'capture_failure').run();

    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'capture_failure', CAPTURE_FAILURE_DATA);
    expect(sent.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// dispatchNotification -- enqueue when all checks pass
// ---------------------------------------------------------------------------

describe('dispatchNotification -- enqueue', () => {
  it('enqueues a message when email is verified and type is opted in', async () => {
    await seedNotificationPrefs(env.DB, 'default');

    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'invoice_generated', {
      amountFormatted: '€4.75',
      currency: 'EUR',
      period: 'March 2026',
      portalUrl: 'https://billing.stripe.com/session/test',
    });

    expect(sent.length).toBe(1);
    expect(sent[0].notificationType).toBe('invoice_generated');
    expect(sent[0].tenantId).toBe('default');
    // Must not log the email address -- but the queue message must include it
    expect(sent[0].to).toBe('user@example.com');
    expect(typeof sent[0].subject).toBe('string');
    expect(typeof sent[0].html).toBe('string');
    expect(typeof sent[0].text).toBe('string');
    expect(typeof sent[0].unsubscribeUrl).toBe('string');
  });

  it('records a dedup row before enqueuing for period-based types', async () => {
    await seedNotificationPrefs(env.DB, 'default');

    const sent = [];
    const mockEnv = makeEmailEnv(sent);
    await dispatchNotification(mockEnv, 'default', 'approaching_limit', APPROACHING_LIMIT_DATA);

    expect(sent.length).toBe(1);

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const row = await env.DB.prepare(
      'SELECT 1 FROM notification_sent WHERE tenant_id = ? AND period = ? AND event_type = ?',
    ).bind('default', period, 'approaching_limit').first();
    expect(row).not.toBeNull();
  });

  it('does not throw even when EMAIL_QUEUE.send throws', async () => {
    await seedNotificationPrefs(env.DB, 'default');

    const mockEnv = {
      ...env,
      EMAIL_QUEUE: { send: async () => { throw new Error('Queue unavailable'); } },
    };

    // Must not throw
    await expect(
      dispatchNotification(mockEnv, 'default', 'invoice_generated', {
        amountFormatted: '€4.75', currency: 'EUR', period: 'March 2026',
        portalUrl: 'https://billing.stripe.com/session/test',
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleEmailMessage -- via worker.queue (wrl-emails)
// ---------------------------------------------------------------------------

describe('queue consumer -- email message: 2xx success', () => {
  it('acks on 2xx response from Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 're_abc123' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const msg = makeEmailMsg({
      tenantId: 'default',
      notificationType: 'invoice_generated',
      to: 'user@example.com',
      subject: 'Invoice generated: €4.75 EUR',
      html: '<html><body>test</body></html>',
      text: 'test',
      unsubscribeUrl: 'https://api.webresourceledger.com/v1/notifications/unsubscribe?token=abc',
    });

    const { result } = await runEmailConsumer('wrl-emails', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);

    vi.unstubAllGlobals();
  });
});

describe('queue consumer -- email message: 422 permanent failure', () => {
  it('acks without retry on 422', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid email address' }), { status: 422 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const msg = makeEmailMsg({
      tenantId: 'default',
      notificationType: 'capture_failure',
      to: 'bad-email',
      subject: 'Capture failed',
      html: '<html></html>',
      text: 'test',
      unsubscribeUrl: 'https://example.com/unsub',
    });

    const { result } = await runEmailConsumer('wrl-emails', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);

    vi.unstubAllGlobals();
  });

  it('acks without retry on 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Bad request' }), { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const msg = makeEmailMsg({
      tenantId: 'default',
      notificationType: 'capture_failure',
      to: 'user@example.com',
      subject: 'Capture failed',
      html: '<html></html>',
      text: 'test',
      unsubscribeUrl: 'https://example.com/unsub',
    });

    const { result } = await runEmailConsumer('wrl-emails', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);

    vi.unstubAllGlobals();
  });
});

describe('queue consumer -- email message: 429 rate limit', () => {
  it('retries on 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Too Many Requests' }), { status: 429 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const msg = makeEmailMsg({
      tenantId: 'default',
      notificationType: 'capture_failure',
      to: 'user@example.com',
      subject: 'Capture failed',
      html: '<html></html>',
      text: 'test',
      unsubscribeUrl: 'https://example.com/unsub',
    });

    const { result } = await runEmailConsumer('wrl-emails', [msg]);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(true);
    expect(result.explicitAcks).not.toContain(msg.id);

    vi.unstubAllGlobals();
  });
});

describe('queue consumer -- email message: 5xx server error', () => {
  it('retries on 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const msg = makeEmailMsg({
      tenantId: 'default',
      notificationType: 'capture_failure',
      to: 'user@example.com',
      subject: 'Capture failed',
      html: '<html></html>',
      text: 'test',
      unsubscribeUrl: 'https://example.com/unsub',
    });

    const { result } = await runEmailConsumer('wrl-emails', [msg]);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(true);
    expect(result.explicitAcks).not.toContain(msg.id);

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// handleEmailDlqMessage -- via worker.queue (wrl-emails-dlq)
// ---------------------------------------------------------------------------

describe('queue consumer -- email DLQ handler', () => {
  it('acks DLQ message', async () => {
    const msg = makeEmailMsg({
      tenantId: 'default',
      notificationType: 'capture_failure',
      to: 'user@example.com',
      subject: 'Capture failed',
      html: '<html></html>',
      text: 'test',
      unsubscribeUrl: 'https://example.com/unsub',
    });

    const { result } = await runEmailConsumer('wrl-emails-dlq', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
    expect(result.retryMessages.some(m => m.msgId === msg.id)).toBe(false);
  });

  it('acks DLQ message even when body fields are missing', async () => {
    const msg = makeEmailMsg({ tenantId: 'default' });

    const { result } = await runEmailConsumer('wrl-emails-dlq', [msg]);
    expect(result.explicitAcks).toContain(msg.id);
  });
});

// ---------------------------------------------------------------------------
// RFC 8058 List-Unsubscribe headers in the Resend request
// ---------------------------------------------------------------------------

describe('handleEmailMessage -- RFC 8058 headers', () => {
  it('sends List-Unsubscribe and List-Unsubscribe-Post headers to Resend', async () => {
    let capturedRequest = null;
    const fetchMock = vi.fn().mockImplementation(async (url, opts) => {
      capturedRequest = { url, opts };
      return new Response(JSON.stringify({ id: 're_test' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const unsubUrl = 'https://api.webresourceledger.com/v1/notifications/unsubscribe?token=testtoken';

    const msg = makeEmailMsg({
      tenantId: 'default',
      notificationType: 'invoice_generated',
      to: 'user@example.com',
      subject: 'Invoice generated: €4.75 EUR',
      html: '<html><body>test</body></html>',
      text: 'test',
      unsubscribeUrl: unsubUrl,
    });

    const { result } = await runEmailConsumer('wrl-emails', [msg]);
    expect(result.explicitAcks).toContain(msg.id);

    // Verify the Resend API was called
    expect(capturedRequest).not.toBeNull();
    const body = JSON.parse(capturedRequest.opts.body);
    expect(body.headers['List-Unsubscribe']).toBe(`<${unsubUrl}>`);
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    vi.unstubAllGlobals();
  });
});
