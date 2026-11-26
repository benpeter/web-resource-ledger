// tva
// Fetch capture for files that aren't web pages (backlog #58, public #143).
// A PDF opened in WRL's headless browser showed a blank page and the capture
// failed. When the URL answers 2xx with a type that isn't HTML, WRL now
// fetches the file and signs its bytes, without a browser.
import { env, SELF } from 'cloudflare:test';
import { fetchMock } from './fetch-mock.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unzipSync } from 'fflate';
import { performCapture, isFetchCapture, startsWithMarkup, pickFileAnswer, exceedsFetchLimit, categorizeError, MAX_FETCH_BYTES } from '../src/capture.js';
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

describe('startsWithMarkup', () => {
  // Chromium's body for a PDF it shows in its viewer is an HTML page
  it('spots an HTML page where a file was expected', () => {
    const enc = new TextEncoder();
    expect(startsWithMarkup(enc.encode('<!DOCTYPE html><html><body><embed type="application/pdf">'))).toBe(true);
    expect(startsWithMarkup(enc.encode('  <html>'))).toBe(true);
    expect(startsWithMarkup(PDF)).toBe(false);
    expect(startsWithMarkup(enc.encode('{"id":1}'))).toBe(false);
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

describe('performCapture -- a file the browser loaded', () => {
  // A site behind bot protection answers WRL's header fetch with 403, so the
  // browser opens the URL; when its main response is a file, the renderer
  // hands over the bytes instead of rendering a blank PDF viewer.
  const fileRenderer = async () => ({
    file: {
      status: 200, statusText: 'OK', headers: { 'content-type': 'application/pdf' },
      contentType: 'application/pdf', bytes: PDF,
    },
    browserLocation: { colo: 'LAX', country: 'US' },
  });

  it('stores and signs the bytes like a fetch capture and says the browser loaded them', async () => {
    fetchMock.get(ORIGIN).intercept({ path: '/report.pdf', method: 'GET' })
      .reply(403, 'blocked', { headers: { 'content-type': 'text/html' } }).persist();
    await createCapture(env.DB, ID, PDF_URL, '93.184.216.34', 'default');

    const result = await performCapture(env, PDF_URL, '93.184.216.34', ID, 'default', undefined, fileRenderer);

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, ID);
    expect(record.status).toBe('complete');
    expect(record.artifacts.resource).toBe(`captures/${ID}/resource`);
    expect(record.captureSettings).toEqual({
      version: 1, method: 'fetch', fetchedBy: 'browser', browserLocation: { colo: 'LAX', country: 'US' },
    });
    expect(record.render).toMatchObject({ httpStatus: 200, contentType: 'application/pdf', bytes: PDF.byteLength });
    const files = unzipSync(new Uint8Array(await (await env.BUCKET.get(record.wacz.key)).arrayBuffer()));
    expect(new TextDecoder('latin1').decode(files['archive/data.warc'])).toContain('%PDF-1.7');
  });
});

// Phase 0212 (backlog #15): on 2026-11-26 a production user's zip and a 24 MB
// PDF reached the browser because the header probe took longer than its 3
// seconds on a slow server. The zip ended as "Download is starting" in the
// catch-all and was tried 4 times; for the PDF page.goto returned no response,
// so the file check never ran and the capture failed as a blank page.
describe('performCapture -- a download the browser started', () => {
  const ZIP_URL = `${ORIGIN}/bundle.zip`;
  let renders;
  const downloadRenderer = async () => {
    renders++;
    throw new Error(`page.goto: Download is starting\nCall log:\n  - navigating to "${ZIP_URL}", waiting until "load"\n`);
  };

  beforeEach(() => { renders = 0; });

  function mockZip(...answers) {
    const pool = fetchMock.get(ORIGIN);
    for (const [status, body, headers] of answers) {
      pool.intercept({ path: '/bundle.zip', method: 'GET' }).reply(status, body, { headers });
    }
  }

  it('fetches the file instead and fails without retrying when it is larger than 10 MB', async () => {
    mockZip(
      [406, 'refused', { 'content-type': 'text/html' }],
      [200, PDF, { 'content-type': 'application/zip', 'content-length': String(MAX_FETCH_BYTES * 30) }],
    );
    await createCapture(env.DB, ID, ZIP_URL, '93.184.216.34', 'default');

    const result = await performCapture(env, ZIP_URL, '93.184.216.34', ID, 'default', undefined, downloadRenderer);

    expect(renders).toBe(1);
    expect(result).toMatchObject({ ok: false, retryable: false });
    const record = await getCapture(env.DB, ID);
    expect(record.status).toBe('failed');
    expect(record.error).toMatch(/larger than 10 MB/);
  });

  it('fetches and signs a download that fits', async () => {
    mockZip(
      [406, 'refused', { 'content-type': 'text/html' }],
      [200, PDF, { 'content-type': 'application/zip' }],
    );
    await createCapture(env.DB, ID, ZIP_URL, '93.184.216.34', 'default');

    const result = await performCapture(env, ZIP_URL, '93.184.216.34', ID, 'default', undefined, downloadRenderer);

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, ID);
    expect(record.status).toBe('complete');
    expect(record.captureSettings).toEqual({ version: 1, method: 'fetch' });
    expect(record.render).toMatchObject({ httpStatus: 200, contentType: 'application/zip', bytes: PDF.byteLength });
  });

  it('names the status when the site refuses the file to WRL as well', async () => {
    mockZip(
      [406, 'refused', { 'content-type': 'text/html' }],
      [403, 'refused', { 'content-type': 'text/html' }],
    );
    await createCapture(env.DB, ID, ZIP_URL, '93.184.216.34', 'default');

    const result = await performCapture(env, ZIP_URL, '93.184.216.34', ID, 'default', undefined, downloadRenderer);

    expect(result).toMatchObject({ ok: false, retryable: false });
    expect((await getCapture(env.DB, ID)).error).toBe('The site answered HTTP 403 when WRL asked for the file');
  });
});

describe('pickFileAnswer', () => {
  const answer = (status, type, length) => ({
    status,
    headers: { ...(type ? { 'content-type': type } : {}), ...(length ? { 'content-length': String(length) } : {}) },
  });

  it("takes the main-frame response the page saw when page.goto returned none, as Chromium does for a PDF", () => {
    const seen = answer(200, 'application/pdf', 24184126);
    expect(pickFileAnswer(null, seen)).toBe(seen);
  });

  it('prefers the response page.goto returned, and picks nothing for a web page', () => {
    const nav = answer(200, 'application/pdf');
    expect(pickFileAnswer(nav, answer(200, 'text/html'))).toBe(nav);
    expect(pickFileAnswer(answer(200, 'text/html'), answer(200, 'text/html'))).toBe(null);
    expect(pickFileAnswer(null, null)).toBe(null);
  });
});

describe('exceedsFetchLimit', () => {
  it('reads Content-Length so a large file fails before its bytes are read', () => {
    expect(exceedsFetchLimit({ 'content-length': String(MAX_FETCH_BYTES + 1) })).toBe(true);
    expect(exceedsFetchLimit({ 'content-length': String(MAX_FETCH_BYTES) })).toBe(false);
    expect(exceedsFetchLimit({})).toBe(false);
  });
});

describe('categorizeError -- file failures (phase 0212)', () => {
  it('retries a refused file fetch only when the status may pass', () => {
    expect(categorizeError(new Error('File fetch answered HTTP 403'))).toEqual({ message: 'The site answered HTTP 403 when WRL asked for the file', retryable: false });
    expect(categorizeError(new Error('File fetch answered HTTP 503'))).toEqual({ message: 'The site answered HTTP 503 when WRL asked for the file', retryable: true });
    expect(categorizeError(new Error('File fetch answered HTTP 429')).retryable).toBe(true);
  });

  it('says what happened when the browser starts a download that could not be fetched', () => {
    expect(categorizeError(new Error('page.goto: Download is starting'))).toEqual({ message: 'The URL starts a file download, which WRL could not fetch', retryable: false });
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
