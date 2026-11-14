// tva
// The Worker's configuration is spread over wrangler.toml, docs/INTERNALS.md and
// OPERATIONS.md, and they drifted: PIRSCH_ACCESS_KEY and VERIFICATION_BASE_URL were
// documented nowhere, OPERATIONS.md listed 5 of the 13 production secrets, INTERNALS
// gave TSA_URL as https while wrangler.toml sets http, and STRIPE_PUBLISHABLE_KEY was
// set but never read. Reads the files as text, like rate-limits-sync.test.js.
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const srcNames = new Set(
  readdirSync(join(root, 'src'), { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .flatMap((file) => [...read(join('src', file)).matchAll(/\benv\??\.([A-Z][A-Z0-9_]+)\b/g)].map((m) => m[1])),
);

function section(text, start, end) {
  const from = text.indexOf(start);
  expect(from, `"${start}" not found`).toBeGreaterThan(-1);
  return text.slice(from, text.indexOf(end, from + start.length));
}

const tableNames = (text) => [...text.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm)].map((m) => m[1]);

function tomlVars(toml, header) {
  const rest = toml.slice(toml.indexOf(`\n${header}\n`) + header.length + 2);
  const end = rest.search(/^\[/m);
  const block = end === -1 ? rest : rest.slice(0, end);
  return Object.fromEntries([...block.matchAll(/^([A-Z][A-Z0-9_]+) = "(.*)"$/gm)].map((m) => [m[1], m[2]]));
}

const internals = read('docs/INTERNALS.md');
const toml = read('wrangler.toml');
const prodVars = tomlVars(toml, '[vars]');
const stagingVars = tomlVars(toml, '[env.staging.vars]');
const internalsSecrets = tableNames(section(internals, '### Secrets', '### Variables'));

describe('Worker configuration docs', () => {
  it('name every env value src/ reads in the INTERNALS bindings, secrets or variables tables', () => {
    expect(srcNames.size).toBeGreaterThan(30);
    const documented = new Set(tableNames(section(internals, '## Bindings', '## D1 Schema')));
    expect(documented.has('DB')).toBe(true);
    expect([...srcNames].filter((name) => !documented.has(name)).sort()).toEqual([]);
  });

  it('give the same variable values as wrangler.toml production [vars]', () => {
    const rows = [...section(internals, '### Variables', '\n---').matchAll(/^\| `([A-Z][A-Z0-9_]+)` \| (.+?) \|/gm)];
    expect(rows.length).toBeGreaterThan(10);
    const mismatches = [];
    for (const [, name, cell] of rows) {
      const value = cell.match(/^`"?(.*?)"?`$/)?.[1];
      if (value === undefined || value.endsWith('...')) continue;
      if (prodVars[name] !== value) mismatches.push(`${name}: INTERNALS says ${value}, wrangler.toml says ${prodVars[name]}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('list the same Worker secrets in OPERATIONS.md as in INTERNALS', () => {
    const operations = tableNames(section(read('OPERATIONS.md'), 'Worker runtime secrets:', '\n---'));
    expect(internalsSecrets.length).toBeGreaterThan(5);
    expect(operations.sort()).toEqual([...internalsSecrets].sort());
  });
});

describe('wrangler.toml [vars]', () => {
  it('are all read by src/', () => {
    expect(Object.keys(prodVars).length).toBeGreaterThan(5);
    expect(Object.keys(prodVars).filter((name) => !srcNames.has(name)).sort()).toEqual([]);
  });

  it('point staging emails and webhooks at the staging origin, not production', () => {
    expect(stagingVars.APPLICATION_NAME).toBe('wrl-staging');
    expect(stagingVars.VERIFICATION_BASE_URL).toBe('https://staging.webresourceledger.com');
  });
});
