/**
 * Audit logging proof tests -- demonstrates that authenticated requests
 * produce structured audit events with the correct schema, and that
 * auth failures and SSRF blocks are handled correctly.
 *
 * Strategy: intercept the log() function via vi.spyOn to capture all
 * log calls, then assert on the audit event payloads. Uses SELF.fetch
 * for full Worker integration.
 */
import { SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as logModule from '../src/log.js';

// tva

const AUTH = 'Bearer test-api-key-for-vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spy on log() and collect calls as { severity, subsystem, data } */
function spyOnLog() {
  const calls = [];
  const spy = vi.spyOn(logModule, 'log').mockImplementation(
    (_env, severity, subsystem, data) => {
      calls.push({ severity, subsystem, data });
      return Promise.resolve(); // no-op, don't actually send to Coralogix
    }
  );
  return { calls, spy };
}

function postCapture(body, headers = {}) {
  return SELF.fetch('https://worker.test/v1/captures', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH,
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function listCaptures() {
  return SELF.fetch('https://worker.test/v1/captures', {
    method: 'GET',
    headers: { Authorization: AUTH },
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Capture create emits audit event with correct schema
// ---------------------------------------------------------------------------

describe('audit logging -- capture create', () => {
  it('emits audit.capture.create with outcome:success on 202', async () => {
    const { calls } = spyOnLog();

    fetchMock.get('https://93.184.216.34').intercept({ path: '/' }).reply(200, '<html></html>', {
      headers: { 'content-type': 'text/html' },
    });

    const res = await postCapture({ url: 'https://93.184.216.34/' });
    expect(res.status).toBe(202);
    const { id } = await res.json();

    // Find the audit event
    const auditCalls = calls.filter(c => c.subsystem === 'audit');
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);

    const createEvent = auditCalls.find(
      c => c.data.event === 'audit.capture.create' && c.data.outcome === 'success'
    );
    expect(createEvent).toBeDefined();
    expect(createEvent.severity).toBe(3); // info
    expect(createEvent.data).toMatchObject({
      event: 'audit.capture.create',
      tenantId: 'default',
      action: 'create',
      resource: 'capture',
      resourceId: id,
      outcome: 'success',
    });

    // keyId: 8 hex chars
    expect(createEvent.data.keyId).toMatch(/^[0-9a-f]{8}$/);
    // cip: hashed IP string
    expect(typeof createEvent.data.cip).toBe('string');
    expect(createEvent.data.cip.length).toBeGreaterThan(0);

    // PII exclusion: no raw API key, URL, or IP
    const serialized = JSON.stringify(createEvent.data);
    expect(serialized).not.toContain('test-api-key-for-vitest');
    expect(serialized).not.toContain('93.184.216.34');
  });
});

// ---------------------------------------------------------------------------
// 2. List captures emits audit event
// ---------------------------------------------------------------------------

describe('audit logging -- capture list', () => {
  it('emits audit.capture.list with outcome:success on 200', async () => {
    const { calls } = spyOnLog();

    const res = await listCaptures();
    expect(res.status).toBe(200);

    const auditCalls = calls.filter(c => c.subsystem === 'audit');
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);

    const listEvent = auditCalls.find(c => c.data.event === 'audit.capture.list');
    expect(listEvent).toBeDefined();
    expect(listEvent.severity).toBe(3);
    expect(listEvent.data).toMatchObject({
      event: 'audit.capture.list',
      tenantId: 'default',
      action: 'list',
      resource: 'capture',
      resourceId: null,
      outcome: 'success',
    });
    expect(listEvent.data.keyId).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// 3. Auth failure produces outcome:'denied' in security, no audit events
// ---------------------------------------------------------------------------

describe('audit logging -- auth failure', () => {
  it('security.auth_fail has outcome:denied on capture POST with wrong key', async () => {
    const { calls } = spyOnLog();

    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-key',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(401);

    const authFail = calls.find(c => c.data.event === 'security.auth_fail');
    expect(authFail).toBeDefined();
    expect(authFail.subsystem).toBe('security');
    expect(authFail.data.outcome).toBe('denied');
    expect(authFail.data.status).toBe(401);

    // No audit events on failed auth -- no tenant identity
    const auditCalls = calls.filter(c => c.subsystem === 'audit');
    expect(auditCalls).toHaveLength(0);
  });

  it('security.auth_fail has outcome:denied on list GET with wrong key', async () => {
    const { calls } = spyOnLog();

    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'GET',
      headers: { Authorization: 'Bearer wrong-key' },
    });
    expect(res.status).toBe(401);

    const authFail = calls.find(c => c.data.event === 'security.auth_fail');
    expect(authFail).toBeDefined();
    expect(authFail.data.outcome).toBe('denied');

    const auditCalls = calls.filter(c => c.subsystem === 'audit');
    expect(auditCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. SSRF block: closed-enum reason + audit event with outcome:'denied'
// ---------------------------------------------------------------------------

describe('audit logging -- SSRF block', () => {
  it('private IP produces private_ip_blocked reason and audit denied event', async () => {
    const { calls } = spyOnLog();

    const res = await postCapture({ url: 'https://10.0.0.1/' });
    expect(res.status).toBe(422);

    // Security event uses closed-enum reason
    const ssrfBlock = calls.find(c => c.data.event === 'security.ssrf_block');
    expect(ssrfBlock).toBeDefined();
    expect(ssrfBlock.data.reason).toBe('private_ip_blocked');
    expect(ssrfBlock.data.outcome).toBe('denied');
    expect(ssrfBlock.data.tenantId).toBe('default');
    expect(ssrfBlock.data.keyId).toMatch(/^[0-9a-f]{8}$/);
    // Reason does NOT contain the raw IP
    expect(ssrfBlock.data.reason).not.toContain('10.0.0.1');

    // Audit event for the denied capture
    const auditDenied = calls.find(
      c => c.subsystem === 'audit' && c.data.outcome === 'denied'
    );
    expect(auditDenied).toBeDefined();
    expect(auditDenied.data).toMatchObject({
      event: 'audit.capture.create',
      tenantId: 'default',
      action: 'create',
      resource: 'capture',
      resourceId: null,
      outcome: 'denied',
    });
  });

  it('ftp:// scheme produces url_scheme_not_allowed reason', async () => {
    const { calls } = spyOnLog();

    const res = await postCapture({ url: 'ftp://example.com/file' });
    expect(res.status).toBe(400);

    const ssrfBlock = calls.find(c => c.data.event === 'security.ssrf_block');
    expect(ssrfBlock).toBeDefined();
    expect(ssrfBlock.data.reason).toBe('url_scheme_not_allowed');
  });
});

// ---------------------------------------------------------------------------
// 5. keyId is consistent across handlers (same key = same fingerprint)
// ---------------------------------------------------------------------------

describe('audit logging -- keyId consistency', () => {
  it('same API key produces identical keyId in capture and list', async () => {
    // Capture request
    const { calls: captureCalls } = spyOnLog();
    fetchMock.get('https://93.184.216.34').intercept({ path: '/' }).reply(200, '<html></html>', {
      headers: { 'content-type': 'text/html' },
    });
    await postCapture({ url: 'https://93.184.216.34/' });
    const captureAudit = captureCalls.find(
      c => c.subsystem === 'audit' && c.data.event === 'audit.capture.create'
    );
    expect(captureAudit).toBeDefined();
    const captureKeyId = captureAudit.data.keyId;

    vi.restoreAllMocks();
    fetchMock.deactivate();
    fetchMock.activate();
    fetchMock.disableNetConnect();

    // List request
    const { calls: listCalls } = spyOnLog();
    await listCaptures();
    const listAudit = listCalls.find(
      c => c.subsystem === 'audit' && c.data.event === 'audit.capture.list'
    );
    expect(listAudit).toBeDefined();

    // Same key -> same keyId
    expect(listAudit.data.keyId).toBe(captureKeyId);
    expect(captureKeyId).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// 6. PII exclusion: no secrets in any audit event
// ---------------------------------------------------------------------------

describe('audit logging -- PII exclusion', () => {
  it('no raw API key, IP, or URL in any audit event field', async () => {
    const { calls } = spyOnLog();
    fetchMock.get('https://93.184.216.34').intercept({ path: '/' }).reply(200, '<html></html>', {
      headers: { 'content-type': 'text/html' },
    });

    await postCapture(
      { url: 'https://93.184.216.34/' },
      { 'CF-Connecting-IP': '198.51.100.42' },
    );

    const auditCalls = calls.filter(c => c.subsystem === 'audit');
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);

    for (const call of auditCalls) {
      const s = JSON.stringify(call.data);
      expect(s).not.toContain('test-api-key-for-vitest');
      expect(s).not.toContain('198.51.100.42');
      expect(s).not.toContain('93.184.216.34');
      expect(s.toLowerCase()).not.toContain('bearer');
    }
  });
});
