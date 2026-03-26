// tva
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hashApiKey } from '../src/auth.js';
import { seedApiKey, seedSchedule, cleanDb, TEST_SCHEDULE_ID } from './fixtures.js';
import { createCapture } from '../src/db.js';

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

function mcpPost(body, authHeader = AUTH) {
  const headers = {
    'Content-Type': 'application/json',
    // MCP Streamable HTTP requires both content types in Accept
    'Accept': 'application/json, text/event-stream',
  };
  if (authHeader !== null) headers['Authorization'] = authHeader;
  return SELF.fetch('http://localhost/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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
  it('lists all 11 WRL tools', async () => {
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
    expect(tools).toHaveLength(11);
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
