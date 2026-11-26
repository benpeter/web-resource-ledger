// tva
// Fetch capture for files that aren't web pages (backlog #58, public #143).
// A PDF opened in WRL's headless browser showed a blank page and the capture
// failed. When the URL answers 2xx with a type that isn't HTML, WRL now
// fetches the file and signs its bytes, without a browser.
import { env, SELF } from 'cloudflare:test';
import { fetchMock } from './fetch-mock.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unzipSync } from 'fflate';
import { performCapture, isFetchCapture, MAX_FETCH_BYTES } from '../src/capture.js';
import { createCapture, getCapture } from '../src/db.js';
import { TEST_TENANT_KEY, seedApiKey } from './fixtures.js';

const ID = 'cap_fe7c0001234567890abcdef123450001';
const ORIGIN = 'https://files.example';
const PDF_URL = `${ORIGIN}/report.pdf`;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3]);
const neverRender = async () => { throw new Error('the browser should not run for a file'); };

function mockFile(body, headers, times = 2) {
  fetchMock.get(ORIGIN).intercept({ path: '/report.pdf', method: 'GET' }).reply(200, body, { headers }).times(times);
}

beforeEach(async () => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
  await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(ID).run();
});

afterEach(() => {
  fetchMock.deactivate();
});

describe('isFetchCapture', () => {
  const answer = (status, type) => ({ status, statusText: '', headers: type ? { 'content-type': type } : {} });

  it('picks files: a 2xx answer whose type is not HTML', () => {
    expect(isFetchCapture(answer(200, 'application/pdf'))).toBe(true);
    expect(isFetchCapture(answer(200, 'application/json; charset=utf-8'))).toBe(true);
    expect(isFetchCapture(answer(200, 'image/png'))).toBe(true);
  });

  it('leaves pages, redirects, errors and unknown types to the browser', () => {
    expect(isFetchCapture(answer(200, 'text/html; charset=utf-8'))).toBe(false);
    expect(isFetchCapture(answer(200, 'application/xhtml+xml'))).toBe(false);
    expect(isFetchCapture(answer(301, 'application/pdf'))).toBe(false);
    expect(isFetchCapture(answer(403, 'application/json'))).toBe(false);
    expect(isFetchCapture(answer(200, null))).toBe(false);
    expect(isFetchCapture(null)).toBe(false);
  });
});

describe('performCapture -- a PDF', () => {
  it('fetches the file, stores it as the resource artifact and signs its bytes into the WACZ, without a browser', async () => {
    mockFile(PDF, { 'content-type': 'application/pdf' });
    await createCapture(env.DB, ID, PDF_URL, '93.184.216.34', 'default');

    const result = await performCapture(env, PDF_URL, '93.184.216.34', ID, 'default', undefined, neverRender);

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, ID);
    expect(record.status).toBe('complete');
    expect(record.artifacts.resource).toBe(`captures/${ID}/resource`);
    expect(record.artifacts.screenshot).toBeUndefined();
    expect(record.artifacts.html).toBeUndefined();
    expect(record.captureSettings).toEqual({ version: 1, method: 'fetch' });
    expect(record.render).toMatchObject({ httpStatus: 200, contentType: 'application/pdf', bytes: PDF.byteLength });
    const stored = new Uint8Array(await (await env.BUCKET.get(record.artifacts.resource)).arrayBuffer());
    expect(stored).toEqual(PDF);

    const files = unzipSync(new Uint8Array(await (await env.BUCKET.get(record.wacz.key)).arrayBuffer()));
    const warc = new TextDecoder('latin1').decode(files['archive/data.warc']);
    expect(warc).toContain(`WARC-Target-URI: ${PDF_URL}`);
    expect(warc).toContain('Content-Type: application/pdf');
    expect(warc).toContain('%PDF-1.7');
    expect(warc).not.toContain('urn:wrl:screenshot');
    const datapackage = JSON.parse(new TextDecoder().decode(files['datapackage.json']));
    expect(datapackage.captureSettings.method).toBe('fetch');
  });

  it(`fails without retrying when the file is larger than ${MAX_FETCH_BYTES / 1024 / 1024} MB`, async () => {
    mockFile(PDF, { 'content-type': 'application/pdf', 'content-length': String(MAX_FETCH_BYTES + 1) });
    await createCapture(env.DB, ID, PDF_URL, '93.184.216.34', 'default');

    const result = await performCapture(env, PDF_URL, '93.184.216.34', ID, 'default', undefined, neverRender);

    expect(result).toMatchObject({ ok: false, retryable: false });
    const record = await getCapture(env.DB, ID);
    expect(record.status).toBe('failed');
    expect(record.error).toMatch(/larger than 10 MB/);
  });
});

describe('GET a fetch capture', () => {
  beforeEach(async () => {
    mockFile(PDF, { 'content-type': 'application/pdf' });
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'default' });
    await createCapture(env.DB, ID, PDF_URL, '93.184.216.34', 'default');
    await performCapture(env, PDF_URL, '93.184.216.34', ID, 'default', undefined, neverRender);
  });

  const get = (path) => SELF.fetch(`https://worker.test${path}`, {
    headers: { Authorization: `Bearer ${TEST_TENANT_KEY}`, 'CF-Connecting-IP': '192.0.2.93' },
  });

  it('lists the resource and headers artifacts and no screenshot or HTML', async () => {
    const body = await (await get(`/v1/captures/${ID}`)).json();
    expect(Object.keys(body.artifacts).sort()).toEqual(['headers', 'resource']);
    expect(body.artifacts.resource).toBe(`https://worker.test/v1/captures/${ID}/artifacts/resource`);
  });

  it('serves the file as a download that a browser will not open in place', async () => {
    const res = await get(`/v1/captures/${ID}/artifacts/resource`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="capture-files\.example-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
  });
});
