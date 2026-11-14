// tva
import { env, SELF, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { fetchMock } from './fetch-mock.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hashApiKey } from '../src/auth.js';
import { seedApiKey, seedSchedule, seedUsageCounter, cleanDb, TEST_SCHEDULE_ID, TEST_URL, TEST_IP, partialRenderer } from './fixtures.js';
import { createCapture, computePeriod } from '../src/db.js';
import { performCapture } from '../src/capture.js';
import { handleMcp } from '../src/mcp.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEGACY_KEY = 'test-api-key-for-vitest';
const AUTH = `Bearer ${LEGACY_KEY}`;
const PENDING_ID = 'cap_' + 'b'.repeat(32);
const COMPLETE_ID = 'cap_' + 'c'.repeat(32);

// ---------------------------------------------------------------------------
// Helper: send a JSON-RPC request to /mcp
// ---------------------------------------------------------------------------

function mcpPost(body, authHeader = AUTH, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    // MCP Streamable HTTP requires both content types in Accept
    'Accept': 'application/json, text/event-stream',
    ...extraHeaders,
  };
  if (authHeader !== null) headers['Authorization'] = authHeader;
  return SELF.fetch('http://localhost/mcp', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function initRequest(id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    },
  };
}

function toolCall(name, args, id = 2) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  };
}

// ---------------------------------------------------------------------------
// KV cleanup helpers
// ---------------------------------------------------------------------------

async function cleanupApiKeys() {
  await env.DB.prepare('DELETE FROM api_keys').run();
  await env.DB.prepare('DELETE FROM tenants').run();
}

async function cleanupCaptures() {
  await env.DB.prepare('DELETE FROM captures').run();
  await env.DB.prepare('DELETE FROM tenants').run();
}

async function cleanupSchedules() {
  await env.DB.prepare('DELETE FROM schedules').run();
  await env.DB.prepare('DELETE FROM tenants').run();
}

// ---------------------------------------------------------------------------
// Protocol tests
// ---------------------------------------------------------------------------

describe('MCP protocol -- initialize', () => {
  it('returns server info and capabilities', async () => {
    const res = await mcpPost(initRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');

    const body = await res.json();
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(body.result).toBeDefined();
    expect(body.error).toBeUndefined();

    const { result } = body;
    expect(result.serverInfo).toBeDefined();
    expect(result.serverInfo.name).toBe('web-resource-ledger');
    expect(result.serverInfo.version).toBeDefined();
    expect(result.capabilities).toBeDefined();
    expect(result.protocolVersion).toBeDefined();
  });
});

describe('MCP protocol -- tools/list', () => {
  it('lists all 13 WRL tools', async () => {
    const res = await mcpPost({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.error).toBeUndefined();

    const tools = body.result.tools;
    expect(Array.isArray(tools)).toBe(true);

    const names = tools.map(t => t.name);
    expect(names).toContain('capture_url');
    expect(names).toContain('get_capture');
    expect(names).toContain('list_captures');
    expect(names).toContain('verify_capture');
    expect(names).toContain('batch_capture');
    expect(names).toContain('diff_captures');
    expect(names).toContain('get_usage');
    expect(names).toContain('list_schedules');
    expect(names).toContain('create_schedule');
    expect(names).toContain('delete_schedule');
    expect(names).toContain('get_certificate');
    expect(names).toContain('read_sitemap');
    expect(names).toContain('update_schedule');
    expect(tools).toHaveLength(13);
  });

  it('each tool has a name, description, and inputSchema', async () => {
    const res = await mcpPost({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    const { result } = await res.json();
    for (const tool of result.tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toBeDefined();
    }
  });
});

describe('MCP protocol -- CORS preflight', () => {
  it('OPTIONS /mcp returns correct CORS headers', async () => {
    const res = await SELF.fetch('http://localhost/mcp', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });
});

describe('MCP protocol -- security headers', () => {
  it('POST /mcp responses include security headers', async () => {
    const res = await mcpPost(initRequest());
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Strict-Transport-Security')).toBeTruthy();
  });
});

describe('MCP protocol -- non-POST method', () => {
  it('GET /mcp returns 405', async () => {
    const res = await SELF.fetch('http://localhost/mcp', {
      method: 'GET',
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(405);
  });
});

describe('MCP protocol -- input limits (GHSA-46jr-4wx8-v453)', () => {
  it('refuses tool arguments with more than 1000 elements before validating them', async () => {
    const urls = Array.from({ length: 1001 }, (_, i) => `https://example.com/${i}`);
    const res = await mcpPost(toolCall('batch_capture', { urls }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const message = body.result?.content?.[0]?.text ?? body.error?.message;
    expect(message).toContain('more than the maximum of 1000 elements');
  });

  it('answers 413 to a request body over 256 KiB', async () => {
    const res = await mcpPost(toolCall('get_capture', { capture_id: 'x'.repeat(300_000) }));
    expect(res.status).toBe(413);
  });
});

// ---------------------------------------------------------------------------
// Keyless discovery: MCP directories list the tools without a key
// ---------------------------------------------------------------------------

describe('keyless discovery', () => {
  const TOOLS_LIST = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

  it('answers initialize without a key', async () => {
    const res = await mcpPost(initRequest(), null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe('web-resource-ledger');
  });

  it('lists the same tools without a key as with one', async () => {
    const keyless = await mcpPost(TOOLS_LIST, null);
    expect(keyless.status).toBe(200);
    const keylessTools = (await keyless.json()).result.tools;
    const keyedTools = (await (await mcpPost(TOOLS_LIST)).json()).result.tools;
    expect(keylessTools.map((tool) => tool.name)).toContain('capture_url');
    expect(keylessTools).toEqual(keyedTools);
  });

  it('accepts notifications/initialized and ping without a key', async () => {
    const notified = await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' }, null);
    expect(notified.status).toBe(202);
    const ping = await mcpPost({ jsonrpc: '2.0', id: 3, method: 'ping' }, null);
    expect(ping.status).toBe(200);
  });

  it('answers 401 to a batch that mixes tools/list with a tool call', async () => {
    const res = await mcpPost([TOOLS_LIST, toolCall('list_captures', {})], null);
    expect(res.status).toBe(401);
  });

  it('answers 401 to tools/list with an invalid key', async () => {
    const res = await mcpPost(TOOLS_LIST, 'Bearer not-a-real-key-xxxxxxxxxxxxxxx');
    expect(res.status).toBe(401);
  });

  it('answers 401 to a keyless body that is not JSON', async () => {
    const res = await mcpPost('{"jsonrpc":', null);
    expect(res.status).toBe(401);
  });

  it('logs which methods a refused keyless request asked for', async () => {
    const logged = [];
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock.get('https://ingress.test.coralogix.com')
      .intercept({ path: '/logs/v1/singles', method: 'POST' })
      .reply(200, ({ body }) => {
        logged.push(JSON.parse(JSON.parse(body)[0].text));
        return '';
      })
      .persist();
    try {
      const ctx = createExecutionContext();
      const res = await handleMcp(new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'prompts/list' }, { jsonrpc: '2.0', id: 2, method: 'resources/list' }]),
      }), {
        ...env,
        CORALOGIX_ENDPOINT: 'https://ingress.test.coralogix.com/logs/v1/singles',
        CORALOGIX_SEND_KEY: 'test-send-key',
      }, ctx);
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(401);
      const event = logged.find((e) => e.event === 'security.auth_fail');
      expect(event).toMatchObject({ reason: 'missing_header', via: 'mcp', methods: ['prompts/list', 'resources/list'] });
      expect(event.cip).toEqual(expect.any(String));
    } finally {
      fetchMock.deactivate();
    }
  });

  it('allows 60 keyless requests a minute per IP', async () => {
    const ip = { 'CF-Connecting-IP': '10.0.7.1' };
    for (let i = 0; i < 60; i++) {
      expect((await mcpPost(TOOLS_LIST, null, ip)).status).toBe(200);
    }
    const res = await mcpPost(TOOLS_LIST, null, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });
});

// ---------------------------------------------------------------------------
// Tool: capture_url
// ---------------------------------------------------------------------------

describe('tool: capture_url -- auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await mcpPost(toolCall('capture_url', { url: 'https://example.com' }), null);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong API key', async () => {
    const res = await mcpPost(
      toolCall('capture_url', { url: 'https://example.com' }),
      'Bearer not-a-real-key-xxxxxxxxxxxxxxx',
    );
    expect(res.status).toBe(401);
  });
});

describe('tool: capture_url -- insufficient scope', () => {
  const READ_ONLY_KEY = 'wrl_live_' + 'r'.repeat(43);

  beforeEach(async () => {
    await cleanupApiKeys();
    await seedApiKey(env.DB, READ_ONLY_KEY, {
      tenantId: 'test-read-only',
      scopes: ['read'],
      name: 'read-only-key',
    });
  });

  afterEach(cleanupApiKeys);

  it('returns tool error for key without capture scope', async () => {
    const res = await mcpPost(
      toolCall('capture_url', { url: 'https://example.com' }),
      `Bearer ${READ_ONLY_KEY}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('scope');
  });
});

describe('tool: capture_url -- happy path', () => {
  it('returns capture ID in response text', async () => {
    const res = await mcpPost(toolCall('capture_url', { url: 'https://example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBeUndefined();

    const text = body.result.content[0].text;
    expect(text).toMatch(/cap_[a-f0-9]{32}/);
    expect(text).toContain('example.com');
  });

  afterEach(cleanupCaptures);
});

// The REST capture endpoints check the monthly quota and the account state
// before accepting a capture; the MCP capture tools have to do the same.
describe('capture tools -- quota and account state', () => {
  const QUOTA_KEY = 'wrl_live_' + 'q'.repeat(43);
  const QUOTA_TENANT = 'mcp-quota';
  // An IP literal, so the URL check needs no DNS
  const URL_OK = 'https://93.184.216.34/';

  beforeEach(async () => {
    await cleanDb(env.DB);
    const { keys } = await env.KV.list({ prefix: 'rl:' });
    for (const k of keys) await env.KV.delete(k.name);
    await seedApiKey(env.DB, QUOTA_KEY, { tenantId: QUOTA_TENANT, scopes: ['capture', 'read'] });
  });

  afterEach(async () => {
    await cleanDb(env.DB);
  });

  async function call(name, args) {
    const body = await (await mcpPost(toolCall(name, args), `Bearer ${QUOTA_KEY}`)).json();
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM captures WHERE tenant_id = ?').bind(QUOTA_TENANT).first();
    return { result: body.result, captures: n };
  }

  it('capture_url refuses when the free captures are used up', async () => {
    await seedUsageCounter(env.DB, { tenantId: QUOTA_TENANT, period: computePeriod(), captureCount: 200 });
    const { result, captures } = await call('capture_url', { url: URL_OK });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/free tier limit reached/i);
    expect(captures).toBe(0);
  });

  it('batch_capture refuses a batch that would go past the free captures', async () => {
    await seedUsageCounter(env.DB, { tenantId: QUOTA_TENANT, period: computePeriod(), captureCount: 199 });
    const { result, captures } = await call('batch_capture', { urls: [URL_OK, 'https://93.184.216.35/'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/free tier limit/i);
    expect(captures).toBe(0);
  });

  it('capture_url refuses for an account blocked for non-payment', async () => {
    await env.DB.prepare("UPDATE tenants SET billing_status = 'blocked' WHERE id = ?").bind(QUOTA_TENANT).run();
    const { result, captures } = await call('capture_url', { url: URL_OK });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/blocked/i);
    expect(captures).toBe(0);
  });

  it('capture_url and batch_capture refuse while a deletion is pending', async () => {
    await env.DB.prepare('UPDATE tenants SET deletion_requested_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), QUOTA_TENANT).run();
    const single = await call('capture_url', { url: URL_OK });
    expect(single.result.isError).toBe(true);
    expect(single.result.content[0].text).toMatch(/scheduled for deletion/);
    const batch = await call('batch_capture', { urls: [URL_OK] });
    expect(batch.result.isError).toBe(true);
    expect(batch.captures).toBe(0);
  });
});

describe('capture tools -- threat screening', () => {
  const THREAT_KEY = 'wrl_live_' + 't'.repeat(43);
  const THREAT_TENANT = 'mcp-threat';
  // IP literals, so the URL check needs no DNS
  const FLAGGED = 'https://93.184.216.34/';
  const CLEAN = 'https://93.184.216.35/';
  // Web Risk runs only with an API key; the test config has none
  const threatEnv = { ...env, GOOGLE_WEB_RISK_API_KEY: 'test-web-risk-key' };

  beforeEach(async () => {
    await cleanDb(env.DB);
    const { keys } = await env.KV.list({ prefix: 'rl:' });
    for (const k of keys) await env.KV.delete(k.name);
    await seedApiKey(env.DB, THREAT_KEY, { tenantId: THREAT_TENANT, scopes: ['capture', 'read'] });
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock.get('https://webrisk.googleapis.com')
      .intercept({ path: (p) => p.includes(encodeURIComponent(FLAGGED)) })
      .reply(200, { threat: { threatTypes: ['MALWARE'] } })
      .persist();
    fetchMock.get('https://webrisk.googleapis.com')
      .intercept({ path: (p) => p.includes(encodeURIComponent(CLEAN)) })
      .reply(200, {})
      .persist();
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDb(env.DB);
  });

  async function call(name, args) {
    const ctx = createExecutionContext();
    const res = await handleMcp(new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${THREAT_KEY}`,
      },
      body: JSON.stringify(toolCall(name, args)),
    }), threatEnv, ctx);
    await waitOnExecutionContext(ctx);
    const body = await res.json();
    const { results } = await env.DB.prepare('SELECT url, threat_check FROM captures WHERE tenant_id = ?')
      .bind(THREAT_TENANT).all();
    return { result: body.result, rows: results };
  }

  it('capture_url refuses a URL flagged by Web Risk', async () => {
    const { result, rows } = await call('capture_url', { url: FLAGGED });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/flagged by content security screening/);
    expect(rows).toHaveLength(0);
  });

  it('capture_url records the passed check on the capture', async () => {
    const { result, rows } = await call('capture_url', { url: CLEAN });
    expect(result.isError).toBeUndefined();
    expect(rows).toEqual([{ url: CLEAN, threat_check: 'pass' }]);
  });

  it('batch_capture rejects the flagged URL and captures the clean one', async () => {
    const { result, rows } = await call('batch_capture', { urls: [FLAGGED, CLEAN] });
    expect(result.content[0].text).toMatch(/flagged by content security screening/);
    expect(rows).toEqual([{ url: CLEAN, threat_check: 'pass' }]);
  });
});

describe('tool: capture_url -- invalid URL', () => {
  it('ftp:// URL returns tool error', async () => {
    const res = await mcpPost(toolCall('capture_url', { url: 'ftp://example.com/file' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toMatch(/invalid url|scheme/);
  });

  it('private IP URL returns tool error', async () => {
    const res = await mcpPost(toolCall('capture_url', { url: 'http://192.168.1.1/' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tool: get_capture
// ---------------------------------------------------------------------------

describe('tool: get_capture -- not found', () => {
  it('returns isError: true with not found text', async () => {
    const unknownId = 'cap_' + '0'.repeat(32);
    const res = await mcpPost(toolCall('get_capture', { capture_id: unknownId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('not found');
  });
});

describe('tool: get_capture -- pending capture', () => {
  beforeEach(async () => {
    await createCapture(env.DB, PENDING_ID, 'https://example.com', '93.184.216.34', 'default');
  });

  afterEach(cleanupCaptures);

  it('returns text saying capture is pending', async () => {
    const res = await mcpPost(toolCall('get_capture', { capture_id: PENDING_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('pending');
  });
});

describe('tool: get_capture -- complete capture', () => {
  beforeEach(async () => {
    const { createCapture: create, completeCapture: complete } = await import('../src/db.js');
    await create(env.DB, COMPLETE_ID, 'https://example.com', '93.184.216.34', 'default');
    await complete(env.DB, COMPLETE_ID, {
      screenshot: `captures/${COMPLETE_ID}/screenshot.png`,
      html: `captures/${COMPLETE_ID}/rendered.html`,
      headers: `captures/${COMPLETE_ID}/headers.json`,
    }, { key: 'test-wacz-key', bundleHash: 'sha256:' + 'a'.repeat(64), size: 98765, keyId: null }, 'full');
  });

  afterEach(cleanupCaptures);

  it('returns text with artifact URLs', async () => {
    const res = await mcpPost(toolCall('get_capture', { capture_id: COMPLETE_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('complete');
    expect(text).toContain('screenshot');
    expect(text).toContain('html');
  });

  it('response text includes verify link when WACZ present', async () => {
    const res = await mcpPost(toolCall('get_capture', { capture_id: COMPLETE_ID }));
    const body = await res.json();
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toMatch(/verify/);
    expect(text).toContain(COMPLETE_ID);
  });
});

describe('tool: get_capture -- clipped screenshot', () => {
  beforeEach(async () => {
    const { createCapture: create, completeCapture: complete } = await import('../src/db.js');
    await create(env.DB, COMPLETE_ID, 'https://example.com', '93.184.216.34', 'default');
    await complete(env.DB, COMPLETE_ID, {
      screenshot: `captures/${COMPLETE_ID}/screenshot.png`,
      html: `captures/${COMPLETE_ID}/rendered.html`,
    }, null, 'full', { waitUntilReached: 'load', timedOut: false, durationMs: 4000, pageHeight: 21860, screenshotHeight: 8000, screenshotClipped: true });
  });

  afterEach(cleanupCaptures);

  it('says the screenshot covers only the top of the page', async () => {
    const res = await mcpPost(toolCall('get_capture', { capture_id: COMPLETE_ID }));
    const text = (await res.json()).result.content[0].text;
    expect(text).toContain('Screenshot covers the top 8000 px of a 21860 px page; the HTML has the whole page.');
  });
});

// ---------------------------------------------------------------------------
// Tool: list_captures
// ---------------------------------------------------------------------------

describe('tool: list_captures -- empty', () => {
  beforeEach(cleanupCaptures);
  afterEach(cleanupCaptures);

  it('returns "No captures found" when no captures exist', async () => {
    const res = await mcpPost(toolCall('list_captures', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('no captures found');
  });
});

describe('tool: list_captures -- with data', () => {
  const LIST_ID_1 = 'cap_' + 'd'.repeat(32);
  const LIST_ID_2 = 'cap_' + 'e'.repeat(32);

  beforeEach(async () => {
    await cleanupCaptures();
    const { createCapture: create } = await import('../src/db.js');
    await create(env.DB, LIST_ID_1, 'https://example.com/one', '1.2.3.4', 'default');
    await create(env.DB, LIST_ID_2, 'https://example.com/two', '1.2.3.4', 'default');
  });

  afterEach(cleanupCaptures);

  it('lists captures with their IDs', async () => {
    const res = await mcpPost(toolCall('list_captures', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    // At least one of the IDs should appear (tenant-scoped listing)
    const hasId1 = text.includes(LIST_ID_1);
    const hasId2 = text.includes(LIST_ID_2);
    expect(hasId1 || hasId2).toBe(true);
  });

  it('response text contains capture count', async () => {
    const res = await mcpPost(toolCall('list_captures', {}));
    const body = await res.json();
    const text = body.result.content[0].text;
    // Should mention "Found N capture(s)"
    expect(text).toMatch(/found \d+ capture/i);
  });
});

describe('tool: list_captures -- status filter', () => {
  const FILTER_PENDING_ID  = 'cap_' + '1'.repeat(32);
  const FILTER_COMPLETE_ID = 'cap_' + '2'.repeat(32);

  beforeEach(async () => {
    await cleanupCaptures();
    const { createCapture: create, completeCapture: complete } = await import('../src/db.js');
    await create(env.DB, FILTER_PENDING_ID, 'https://pending.example.com', '1.2.3.4', 'default');
    await create(env.DB, FILTER_COMPLETE_ID, 'https://complete.example.com', '1.2.3.4', 'default');
    await complete(env.DB, FILTER_COMPLETE_ID, {
      screenshot: `captures/${FILTER_COMPLETE_ID}/screenshot.png`,
      html: `captures/${FILTER_COMPLETE_ID}/rendered.html`,
    }, null, 'full');
  });

  afterEach(cleanupCaptures);

  it('status=pending filter returns only pending captures', async () => {
    const res = await mcpPost(toolCall('list_captures', { status: 'pending' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const text = body.result.content[0].text;
    // pending filter response should not mention "No captures found"
    // (there is a pending capture) and should not surface the complete ID
    if (!text.toLowerCase().includes('no captures found')) {
      expect(text).not.toContain(FILTER_COMPLETE_ID);
    }
  });

  it('status=complete filter returns only complete captures', async () => {
    const res = await mcpPost(toolCall('list_captures', { status: 'complete' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const text = body.result.content[0].text;
    if (!text.toLowerCase().includes('no captures found')) {
      expect(text).not.toContain(FILTER_PENDING_ID);
    }
  });
});

// ---------------------------------------------------------------------------
// Tool: verify_capture
// ---------------------------------------------------------------------------

describe('tool: verify_capture -- not found', () => {
  it('returns isError: true for non-existent capture ID', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);
    const res = await mcpPost(toolCall('verify_capture', { capture_id: unknownId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toMatch(/not found|not yet complete/);
  });
});

describe('tool: verify_capture -- partial capture', () => {
  const PARTIAL_ID = 'cap_' + 'd'.repeat(32);

  beforeEach(async () => {
    await cleanupCaptures();
    fetchMock.activate();
    fetchMock.disableNetConnect();
    // Header fetch runs alongside rendering; answer it so it never hits the network.
    fetchMock.get(new URL(TEST_URL).origin).intercept({ path: () => true, method: () => true }).reply(200, '').persist();
    await createCapture(env.DB, PARTIAL_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, PARTIAL_ID, 'default', undefined, partialRenderer);
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanupCaptures();
  });

  it('passes and reports the partial render', async () => {
    const res = await mcpPost(toolCall('verify_capture', { capture_id: PARTIAL_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text).toContain(`Verification PASSED for capture ${PARTIAL_ID}.`);
    expect(text).toContain('Render quality: partial');
  });
});

// ---------------------------------------------------------------------------
// Tool: batch_capture
// ---------------------------------------------------------------------------

describe('tool: batch_capture -- happy path', () => {
  afterEach(cleanupCaptures);

  it('accepts two URLs and returns capture IDs in response text', async () => {
    const res = await mcpPost(toolCall('batch_capture', {
      urls: ['https://example.com', 'https://example.org'],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text).toMatch(/cap_[a-f0-9]{32}/);
    expect(text).toMatch(/2\/2.*accepted/i);
  });
});

describe('tool: batch_capture -- insufficient scope', () => {
  const READ_ONLY_KEY = 'wrl_live_' + 's'.repeat(43);

  beforeEach(async () => {
    await cleanupApiKeys();
    await seedApiKey(env.DB, READ_ONLY_KEY, {
      tenantId: 'test-batch-read-only',
      scopes: ['read'],
      name: 'batch-read-only-key',
    });
  });

  afterEach(cleanupApiKeys);

  it('returns scope error for key without capture scope', async () => {
    const res = await mcpPost(
      toolCall('batch_capture', { urls: ['https://example.com'] }),
      `Bearer ${READ_ONLY_KEY}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('scope');
  });
});

// ---------------------------------------------------------------------------
// Tool: diff_captures
// ---------------------------------------------------------------------------

describe('tool: diff_captures -- happy path', () => {
  const DIFF_BASE_ID   = 'cap_' + 'f'.repeat(32);
  const DIFF_TARGET_ID = 'cap_' + 'e'.repeat(31) + '0';

  beforeEach(async () => {
    await cleanupCaptures();
    const { createCapture: create, completeCapture: complete } = await import('../src/db.js');
    await create(env.DB, DIFF_BASE_ID, 'https://example.com/base', '1.2.3.4', 'default');
    await create(env.DB, DIFF_TARGET_ID, 'https://example.com/target', '1.2.3.4', 'default');
    await complete(env.DB, DIFF_BASE_ID, {
      screenshot: `captures/${DIFF_BASE_ID}/screenshot.png`,
      html: `captures/${DIFF_BASE_ID}/rendered.html`,
      headers: `captures/${DIFF_BASE_ID}/headers.json`,
    }, null, 'full');
    await complete(env.DB, DIFF_TARGET_ID, {
      screenshot: `captures/${DIFF_TARGET_ID}/screenshot.png`,
      html: `captures/${DIFF_TARGET_ID}/rendered.html`,
      headers: `captures/${DIFF_TARGET_ID}/headers.json`,
    }, null, 'full');
  });

  afterEach(cleanupCaptures);

  it('returns diff summary for two complete captures', async () => {
    const res = await mcpPost(toolCall('diff_captures', {
      base_id: DIFF_BASE_ID,
      target_id: DIFF_TARGET_ID,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text).toContain(DIFF_BASE_ID);
    expect(text).toContain(DIFF_TARGET_ID);
    expect(text).toMatch(/overall changed/i);
  });
});

describe('tool: diff_captures -- not found', () => {
  it('returns isError: true for non-existent base capture ID', async () => {
    const unknownId = 'cap_' + 'a'.repeat(32);
    const res = await mcpPost(toolCall('diff_captures', {
      base_id: unknownId,
      target_id: 'cap_' + 'b'.repeat(32),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// Tool: get_usage
// ---------------------------------------------------------------------------

describe('tool: get_usage', () => {
  beforeEach(async () => {
    // The legacy CAPTURE_API_KEY auth uses tenantId 'default'.
    // checkQuota requires a tenants row to exist -- ensure it here.
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('default').run();
  });

  afterEach(async () => {
    await env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind('default').run();
  });

  it('returns usage information for the authenticated tenant', async () => {
    const res = await mcpPost(toolCall('get_usage', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toMatch(/usage|captures used/i);
  });
});

describe("tool: get_usage -- accounts that can't capture", () => {
  const USAGE_KEY = 'wrl_live_' + 'u'.repeat(43);
  const USAGE_TENANT = 'mcp-usage';

  beforeEach(async () => {
    await cleanDb(env.DB);
    await seedApiKey(env.DB, USAGE_KEY, { tenantId: USAGE_TENANT, scopes: ['read'] });
  });

  afterEach(async () => {
    await cleanDb(env.DB);
  });

  async function usageText() {
    const body = await (await mcpPost(toolCall('get_usage', {}), `Bearer ${USAGE_KEY}`)).json();
    return body.result.content[0].text;
  }

  it('shows the real numbers for an account past the free captures', async () => {
    await seedUsageCounter(env.DB, { tenantId: USAGE_TENANT, period: computePeriod(), captureCount: 250 });
    expect(await usageText()).toMatch(/Captures used: +250 \/ 200/);
  });

  it('shows the numbers and the block for a blocked account', async () => {
    await seedUsageCounter(env.DB, { tenantId: USAGE_TENANT, period: computePeriod(), captureCount: 150 });
    await env.DB.prepare("UPDATE tenants SET billing_status = 'blocked' WHERE id = ?").bind(USAGE_TENANT).run();
    const text = await usageText();
    expect(text).toMatch(/Captures used: +150 \/ 200/);
    expect(text).toContain('Billing status: blocked');
    expect(text).toContain('Account is blocked');
  });

  it('shows the numbers and the deletion date while a deletion is pending', async () => {
    await seedUsageCounter(env.DB, { tenantId: USAGE_TENANT, period: computePeriod(), captureCount: 20 });
    await env.DB.prepare('UPDATE tenants SET deletion_requested_at = ? WHERE id = ?')
      .bind('2026-11-01T00:00:00.000Z', USAGE_TENANT).run();
    const text = await usageText();
    expect(text).toMatch(/Captures used: +20 \/ 200/);
    expect(text).toContain('scheduled for deletion on 2026-12-01');
  });
});

// ---------------------------------------------------------------------------
// Tool: list_schedules
// ---------------------------------------------------------------------------

describe('tool: list_schedules -- empty', () => {
  beforeEach(cleanupSchedules);
  afterEach(cleanupSchedules);

  it('returns "No schedules" message when none exist', async () => {
    const res = await mcpPost(toolCall('list_schedules', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('no schedules');
  });
});

describe('tool: list_schedules -- with data', () => {
  const LIST_SCHEDULE_ID = 'sch_' + 'a'.repeat(32);

  beforeEach(async () => {
    await cleanupSchedules();
    await seedSchedule(env.DB, LIST_SCHEDULE_ID, {
      tenantId: 'default',
      url: 'https://example.com/scheduled',
      name: 'My Test Schedule',
      cron: '0 * * * *',
    });
  });

  afterEach(cleanupSchedules);

  it('lists the seeded schedule with its ID', async () => {
    const res = await mcpPost(toolCall('list_schedules', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text).toContain(LIST_SCHEDULE_ID);
    expect(text).toContain('My Test Schedule');
    expect(text).toContain('Status:   active');
  });

  it('shows a paused schedule as paused, without a next run', async () => {
    await cleanupSchedules();
    await seedSchedule(env.DB, LIST_SCHEDULE_ID, { tenantId: 'default', name: 'Paused one', paused: 1 });
    const res = await mcpPost(toolCall('list_schedules', {}));
    const text = (await res.json()).result.content[0].text;
    expect(text).toContain('Status:   paused');
    expect(text).toContain('Next run: (paused)');
  });
});

// ---------------------------------------------------------------------------
// Tool: create_schedule
// ---------------------------------------------------------------------------

describe('tool: create_schedule -- happy path', () => {
  afterEach(cleanupSchedules);

  it('creates a schedule and returns its ID and next run time', async () => {
    const res = await mcpPost(toolCall('create_schedule', {
      url: 'https://example.com',
      name: 'Hourly Check',
      cron: '0 * * * *',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text).toMatch(/sch_[a-f0-9]{32}/);
    expect(text).toMatch(/schedule created/i);
  });
});

describe('tool: create_schedule -- insufficient scope', () => {
  const READ_ONLY_KEY = 'wrl_live_' + 't'.repeat(43);

  beforeEach(async () => {
    await cleanupApiKeys();
    await seedApiKey(env.DB, READ_ONLY_KEY, {
      tenantId: 'test-schedule-read-only',
      scopes: ['read'],
      name: 'schedule-read-only-key',
    });
  });

  afterEach(cleanupApiKeys);

  it('returns scope error for key without capture scope', async () => {
    const res = await mcpPost(
      toolCall('create_schedule', { url: 'https://example.com', name: 'Test', cron: '0 * * * *' }),
      `Bearer ${READ_ONLY_KEY}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('scope');
  });
});

// ---------------------------------------------------------------------------
// Tool: delete_schedule
// ---------------------------------------------------------------------------

describe('tool: delete_schedule -- happy path', () => {
  const DEL_SCHEDULE_ID = 'sch_' + 'b'.repeat(32);

  beforeEach(async () => {
    await cleanupSchedules();
    await seedSchedule(env.DB, DEL_SCHEDULE_ID, {
      tenantId: 'default',
      url: 'https://example.com',
      name: 'Schedule To Delete',
      cron: '0 * * * *',
    });
  });

  afterEach(cleanupSchedules);

  it('deletes the schedule and confirms deletion', async () => {
    const res = await mcpPost(toolCall('delete_schedule', { schedule_id: DEL_SCHEDULE_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('deleted');
    expect(text).toContain(DEL_SCHEDULE_ID);
  });
});

describe('tool: delete_schedule -- not found', () => {
  it('returns isError: true for non-existent schedule ID', async () => {
    const unknownId = 'sch_' + '0'.repeat(32);
    const res = await mcpPost(toolCall('delete_schedule', { schedule_id: unknownId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// Tool: get_certificate
// ---------------------------------------------------------------------------

describe('tool: get_certificate -- happy path', () => {
  const CERT_ID = 'cap_' + '4'.repeat(32);

  beforeEach(async () => {
    await cleanupCaptures();
    const { createCapture: create, completeCapture: complete } = await import('../src/db.js');
    await create(env.DB, CERT_ID, 'https://example.com', '93.184.216.34', 'default');
    await complete(env.DB, CERT_ID, {
      screenshot: `captures/${CERT_ID}/screenshot.png`,
      html: `captures/${CERT_ID}/rendered.html`,
      headers: `captures/${CERT_ID}/headers.json`,
    }, { key: 'test-wacz-key', bundleHash: 'sha256:' + 'b'.repeat(64), size: 12345, keyId: null }, 'full');
  });

  afterEach(cleanupCaptures);

  it('returns certificate metadata for a complete capture with WACZ', async () => {
    const res = await mcpPost(toolCall('get_certificate', { capture_id: CERT_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBeUndefined();
    const text = body.result.content[0].text;
    expect(text).toContain(CERT_ID);
    expect(text.toLowerCase()).toContain('bundle hash');
    expect(text.toLowerCase()).toContain('certificate');
  });
});

describe('tool: get_certificate -- not found', () => {
  it('returns isError: true for non-existent capture ID', async () => {
    const unknownId = 'cap_' + '5'.repeat(32);
    const res = await mcpPost(toolCall('get_certificate', { capture_id: unknownId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text.toLowerCase()).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// Tool: update_schedule (phase 0132)
// ---------------------------------------------------------------------------

describe('tool: update_schedule', () => {
  const SCHED = 'sch_' + 'd'.repeat(32);

  beforeEach(async () => {
    await cleanDb(env.DB);
    await seedSchedule(env.DB, SCHED, { tenantId: 'default', url: 'https://93.184.216.34/', name: 'Before' });
  });
  afterEach(() => cleanDb(env.DB));

  async function call(args) {
    const res = await mcpPost(toolCall('update_schedule', args));
    expect(res.status).toBe(200);
    return (await res.json()).result;
  }

  it('pauses a schedule', async () => {
    const result = await call({ schedule_id: SCHED, paused: true });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/paused/i);
    const row = await env.DB.prepare('SELECT paused FROM schedules WHERE id = ?').bind(SCHED).first();
    expect(row.paused).toBe(1);
  });

  it('renames a schedule and changes its frequency', async () => {
    const result = await call({ schedule_id: SCHED, name: 'After', cron: '0 0 * * *' });
    expect(result.isError).toBeUndefined();
    const row = await env.DB.prepare('SELECT name, cron FROM schedules WHERE id = ?').bind(SCHED).first();
    expect(row).toEqual({ name: 'After', cron: '0 0 * * *' });
  });

  it('refuses a cron more frequent than hourly with the same message as the API', async () => {
    const result = await call({ schedule_id: SCHED, cron: '*/5 * * * *' });
    expect(result.isError).toBe(true);
    const row = await env.DB.prepare('SELECT cron FROM schedules WHERE id = ?').bind(SCHED).first();
    expect(row.cron).toBe('0 * * * *');
  });

  it('asks for at least one change', async () => {
    const result = await call({ schedule_id: SCHED });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/at least one/i);
  });

  it('returns not found for an unknown schedule', async () => {
    const result = await call({ schedule_id: 'sch_' + '0'.repeat(32), paused: true });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });
});

describe('tool: list_captures -- schedule filter (phase 0132)', () => {
  const SCHED = 'sch_' + 'e'.repeat(32);
  const FROM_SCHEDULE = 'cap_' + '5'.repeat(32);
  const ONE_OFF = 'cap_' + '6'.repeat(32);

  beforeEach(async () => {
    await cleanDb(env.DB);
    await seedSchedule(env.DB, SCHED, { tenantId: 'default' });
    await createCapture(env.DB, FROM_SCHEDULE, 'https://scheduled.example.com/', '1.2.3.4', 'default', SCHED);
    await createCapture(env.DB, ONE_OFF, 'https://one-off.example.com/', '1.2.3.4', 'default');
  });
  afterEach(() => cleanDb(env.DB));

  it('schedule_id returns only that schedule\'s captures', async () => {
    const res = await mcpPost(toolCall('list_captures', { schedule_id: SCHED }));
    const text = (await res.json()).result.content[0].text;
    expect(text).toContain(FROM_SCHEDULE);
    expect(text).not.toContain(ONE_OFF);
  });

  it('rejects a malformed schedule_id', async () => {
    const res = await mcpPost(toolCall('list_captures', { schedule_id: 'not-a-schedule' }));
    expect((await res.json()).result.isError).toBe(true);
  });
});
