// tva
// Tests for src/resend-webhook.js and POST /v1/resend/webhook (backlog #63).
//
// Resend reports bounces and spam complaints through a webhook signed the
// Svix way. A permanent bounce means mail to that address can't arrive, so the
// notification address stops counting as verified; a complaint means the
// recipient doesn't want the mail, so the notification types are turned off
// and the address stays usable for signing in.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { verifySvixSignature } from '../src/resend-webhook.js';
import { upsertNotificationPreferences, getNotificationPreferences } from '../src/db.js';
import { cleanDb } from './fixtures.js';

const ADDRESS = 'owner@example.com';

async function sign(id, timestamp, body, secret = env.RESEND_WEBHOOK_SECRET) {
  const keyBytes = Uint8Array.from(atob(secret.slice('whsec_'.length)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
}

async function postEvent(event, { id = 'msg_' + crypto.randomUUID(), timestamp = Math.floor(Date.now() / 1000), signature } = {}) {
  const body = JSON.stringify(event);
  return SELF.fetch('https://worker.test/v1/resend/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(timestamp),
      'svix-signature': signature ?? await sign(id, timestamp, body),
    },
    body,
  });
}

function bounced(type, to = ADDRESS) {
  return {
    type: 'email.bounced',
    created_at: '2026-11-26T01:00:00.000Z',
    data: { email_id: 'e1', to: [to], subject: 'WRL: weekly digest', bounce: { type, subType: 'General', message: 'mailbox does not exist' } },
  };
}

describe('verifySvixSignature', () => {
  const secret = env.RESEND_WEBHOOK_SECRET;

  it('returns the event for a valid signature', async () => {
    const body = '{"type":"email.bounced"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const event = await verifySvixSignature(body, { id: 'msg_1', timestamp: ts, signature: await sign('msg_1', ts, body) }, secret);
    expect(event).toEqual({ type: 'email.bounced' });
  });

  it('accepts the header when one of several signatures matches (secret rotation)', async () => {
    const body = '{}';
    const ts = String(Math.floor(Date.now() / 1000));
    const good = await sign('msg_2', ts, body);
    const event = await verifySvixSignature(body, { id: 'msg_2', timestamp: ts, signature: `v1,AAAA ${good}` }, secret);
    expect(event).toEqual({});
  });

  it('rejects a wrong signature', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    await expect(verifySvixSignature('{}', { id: 'msg_3', timestamp: ts, signature: 'v1,AAAA' }, secret)).rejects.toThrow();
  });

  it('rejects a timestamp older than five minutes', async () => {
    const ts = String(Math.floor(Date.now() / 1000) - 600);
    await expect(verifySvixSignature('{}', { id: 'msg_4', timestamp: ts, signature: await sign('msg_4', ts, '{}') }, secret)).rejects.toThrow();
  });

  it('rejects missing headers', async () => {
    await expect(verifySvixSignature('{}', { id: null, timestamp: null, signature: null }, secret)).rejects.toThrow();
  });
});

describe('POST /v1/resend/webhook', () => {
  beforeEach(async () => {
    await cleanDb(env.DB);
    await upsertNotificationPreferences(env.DB, 'tenant-a', { email: ADDRESS, emailVerified: true });
  });

  it('a permanent bounce stops the address counting as verified', async () => {
    const res = await postEvent(bounced('Permanent'));
    expect(res.status).toBe(200);
    const prefs = await getNotificationPreferences(env.DB, 'tenant-a');
    expect(prefs.emailVerified).toBe(false);
    expect(prefs.email).toBe(ADDRESS);
  });

  it('matches the address without regard to case', async () => {
    const res = await postEvent(bounced('Permanent', 'Owner@Example.com'));
    expect(res.status).toBe(200);
    expect((await getNotificationPreferences(env.DB, 'tenant-a')).emailVerified).toBe(false);
  });

  it('a temporary bounce changes nothing', async () => {
    const res = await postEvent(bounced('Transient'));
    expect(res.status).toBe(200);
    expect((await getNotificationPreferences(env.DB, 'tenant-a')).emailVerified).toBe(true);
  });

  it('a spam complaint turns the notifications off and keeps the address verified', async () => {
    const res = await postEvent({
      type: 'email.complained',
      created_at: '2026-11-26T01:00:00.000Z',
      data: { email_id: 'e2', to: [ADDRESS], subject: 'WRL: weekly digest' },
    });
    expect(res.status).toBe(200);
    const prefs = await getNotificationPreferences(env.DB, 'tenant-a');
    expect(prefs.emailVerified).toBe(true);
    expect(Object.values(prefs.notifications).every((on) => on === false)).toBe(true);
  });

  it('answers 200 to an event it does not handle', async () => {
    const res = await postEvent({ type: 'email.delivered', created_at: '2026-11-26T01:00:00.000Z', data: { to: [ADDRESS] } });
    expect(res.status).toBe(200);
    expect((await getNotificationPreferences(env.DB, 'tenant-a')).emailVerified).toBe(true);
  });

  it('answers 400 to a wrong signature and changes nothing', async () => {
    const res = await postEvent(bounced('Permanent'), { signature: 'v1,AAAA' });
    expect(res.status).toBe(400);
    expect((await getNotificationPreferences(env.DB, 'tenant-a')).emailVerified).toBe(true);
  });

  it('handles a redelivered event once', async () => {
    await postEvent(bounced('Permanent'), { id: 'msg_dup' });
    await upsertNotificationPreferences(env.DB, 'tenant-a', { email: ADDRESS, emailVerified: true });
    const res = await postEvent(bounced('Permanent'), { id: 'msg_dup' });
    expect(res.status).toBe(200);
    expect((await getNotificationPreferences(env.DB, 'tenant-a')).emailVerified).toBe(true);
  });
});
