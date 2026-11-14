// tva
// scripts/provision-alerts.sh defines the Coralogix alert rules. The ops guide,
// the public incident-response page and the security whitepaper describe them by
// hand; the two public pages said "nine" and lacked Captures Dead-Lettered and
// New API Key Created. Every alert in the script is named in all three; reads the
// files as text, like mcp-sync.test.js.
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const DOCS = [
  'docs/operations/alerts.md',
  'site/content/security/incident-response.md',
  'site/content/security/whitepaper.md',
];

describe('Coralogix alert docs', () => {
  const alerts = [...read('scripts/provision-alerts.sh').matchAll(/"name": "(\[WRL\] [^"]+)"/g)].map(([, name]) => name);

  it.each(DOCS)('%s names every provisioned alert', (path) => {
    const doc = read(path);
    expect(alerts.length).toBeGreaterThan(10);
    expect(alerts.filter((name) => !doc.includes(name))).toEqual([]);
  });
});
