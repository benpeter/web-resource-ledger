// tva
// Releasing a quarantine (backlog #65). The nightly re-scan quarantines every
// capture of a URL that Google Web Risk lists, and nothing undid it. An operator
// now releases one capture, or every capture of its URL, through an admin route.
// The release is written to threat_checks and keeps the re-scan from
// quarantining the same captures again.
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { TEST_ADMIN_KEY, TEST_TENANT_KEY, cleanDb, seedApiKey, seedCapture } from './fixtures.js';
import { quarantineCapturesByUrl, listCapturesNeedingThreatCheck } from '../src/db.js';

const TENANT = 'gh-424242';
const OTHER = 'gh-535353';
const URL_A = 'https://flagged.example/';
const URL_B = 'https://other.example/';
const CAP = 'cap_' + 'a'.repeat(32);
const SAME_URL_CAP = 'cap_' + 'b'.repeat(32);
const OTHER_URL_CAP = 'cap_' + 'c'.repeat(32);
const CLEAN_CAP = 'cap_' + 'd'.repeat(32);

function admin(method, path) {
  return SELF.fetch(`https://worker.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${TEST_ADMIN_KEY}`, 'CF-Connecting-IP': '192.0.2.77' },
  });
}

async function seedQuarantined(id, tenantId, url) {
  await seedCapture(env.DB, id, { tenantId, url, status: 'complete', completedAt: new Date().toISOString() });
  await env.DB.prepare(
    `UPDATE captures SET quarantined = 1, quarantine_reason = 'MALWARE', quarantined_at = ? WHERE id = ?`,
  ).bind(new Date().toISOString(), id).run();
}

async function row(id) {
  return env.DB.prepare('SELECT quarantined, quarantine_reason, quarantined_at FROM captures WHERE id = ?').bind(id).first();
}

beforeEach(async () => {
  await cleanDb(env.DB);
  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: TENANT });
  await seedQuarantined(CAP, TENANT, URL_A);
  await seedQuarantined(SAME_URL_CAP, OTHER, URL_A);
  await seedQuarantined(OTHER_URL_CAP, TENANT, URL_B);
  await seedCapture(env.DB, CLEAN_CAP, { tenantId: TENANT, url: URL_B, status: 'complete', completedAt: new Date().toISOString() });
});

describe('DELETE /v1/admin/captures/{id}/quarantine', () => {
  it('answers 404 for an unknown capture', async () => {
    const res = await admin('DELETE', `/v1/admin/captures/cap_${'9'.repeat(32)}/quarantine`);
    expect(res.status).toBe(404);
  });

  it('answers 409 for a capture that is not quarantined', async () => {
    const res = await admin('DELETE', `/v1/admin/captures/${CLEAN_CAP}/quarantine`);
    expect(res.status).toBe(409);
  });

  it('answers 400 for an unknown scope', async () => {
    const res = await admin('DELETE', `/v1/admin/captures/${CAP}/quarantine?scope=tenant`);
    expect(res.status).toBe(400);
    expect((await row(CAP)).quarantined).toBe(1);
  });

  it('releases one capture, records the release, and leaves other captures of the URL quarantined', async () => {
    const res = await admin('DELETE', `/v1/admin/captures/${CAP}/quarantine`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: URL_A, released: [{ captureId: CAP, tenantId: TENANT }] });
    expect(await row(CAP)).toEqual({ quarantined: 0, quarantine_reason: null, quarantined_at: null });
    expect((await row(SAME_URL_CAP)).quarantined).toBe(1);
    const audit = await env.DB.prepare(
      'SELECT verdict, source FROM threat_checks WHERE capture_id = ?',
    ).bind(CAP).first();
    expect(audit).toEqual({ verdict: 'safe', source: 'operator' });

    const read = await SELF.fetch(`https://worker.test/v1/captures/${CAP}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}`, 'CF-Connecting-IP': '192.0.2.78' },
    });
    expect((await read.json()).status).toBe('complete');
  });

  it('with scope=url releases every quarantined capture of the URL, across tenants', async () => {
    const res = await admin('DELETE', `/v1/admin/captures/${CAP}/quarantine?scope=url`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe(URL_A);
    expect(body.released).toEqual(expect.arrayContaining([
      { captureId: CAP, tenantId: TENANT },
      { captureId: SAME_URL_CAP, tenantId: OTHER },
    ]));
    expect(body.released).toHaveLength(2);
    expect((await row(SAME_URL_CAP)).quarantined).toBe(0);
    expect((await row(OTHER_URL_CAP)).quarantined).toBe(1);
  });

  it('keeps the re-scan from quarantining a released capture again', async () => {
    await admin('DELETE', `/v1/admin/captures/${CAP}/quarantine`);

    const due = await listCapturesNeedingThreatCheck(env.DB, new Date(Date.now() + 1000).toISOString());
    expect(due.map(c => c.captureId)).not.toContain(CAP);
    const requarantined = await quarantineCapturesByUrl(env.DB, URL_A, 'MALWARE', 'MALWARE');
    expect(requarantined).toEqual([]);
    expect((await row(CAP)).quarantined).toBe(0);
  });
});
