// tva
// The route table in docs/INTERNALS.md is kept by hand, and it fell behind the
// router (sitemap, schedule edits, email sign-in and admin dashboard routes were
// missing) and got the diff route's auth wrong. openapi.yaml declared the
// session-only notification routes as needing no auth. Every route in
// src/index.js has a row, and each OpenAPI operation's `security` matches the
// row's Auth column; reads the sources as text, like mcp-sync.test.js.
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

// "GET /v1/captures/{}": path parameters and regex groups both become {}
function routerRoutes() {
  const source = read('src/index.js');
  return [...source.matchAll(/^\s*\['(GET|POST|PUT|PATCH|DELETE)',\s*\/\^(.*)\$\/,/gm)]
    .map(([, method, pattern]) => `${method} ${pattern.replace(/\([^)]*\)/g, '{}').replace(/\\(.)/g, '$1')}`);
}

function tableRows() {
  const rows = new Map();
  for (const [, method, path, auth] of read('docs/INTERNALS.md').matchAll(/^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)` \| ([^|]+) \|/gm)) {
    rows.set(`${method} ${path.replace(/\{[^}]+\}/g, '{}')}`, auth.trim());
  }
  return rows;
}

// Handled in fetch() before the regex router
const BEFORE_ROUTER = ['POST /mcp'];

const SECURITY_FOR_AUTH = {
  none: [],
  'none (optional dual)': [],
  dual: [{ bearerAuth: [] }],
  'api-key': [{ bearerAuth: [] }],
  'admin-key': [{ adminAuth: [] }],
  session: [{ sessionCookie: [] }],
};

describe('INTERNALS.md route table', () => {
  it('has a row for every route in the router', () => {
    const rows = tableRows();
    const routes = routerRoutes();
    expect(routes.length).toBeGreaterThan(50);
    expect(routes.filter((route) => !rows.has(route))).toEqual([]);
  });

  it('lists only routes that exist', () => {
    const routes = new Set([...routerRoutes(), ...BEFORE_ROUTER]);
    expect([...tableRows().keys()].filter((row) => !routes.has(row))).toEqual([]);
  });
});

describe('openapi.yaml security', () => {
  it('matches the Auth column of the route table', () => {
    const rows = tableRows();
    const spec = parse(read('openapi.yaml'));
    const mismatches = [];
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (!item[method]) continue;
        const key = `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, '{}')}`;
        const auth = rows.get(key);
        const security = item[method].security ?? [];
        if (JSON.stringify(security) !== JSON.stringify(SECURITY_FOR_AUTH[auth])) {
          mismatches.push(`${key}: table says ${auth ?? '(no row)'}, spec says ${JSON.stringify(security)}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});
