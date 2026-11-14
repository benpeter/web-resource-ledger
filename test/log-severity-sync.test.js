// tva
// Coralogix severities run from 1 (debug) to 6 (critical). Phase 0136 found
// telemetry logged as 6 that showed up as Critical, and email.dispatch_skipped
// was logged as 7, outside the range. Every log() call in the three Workers
// uses 1 to 5; reads the source as text, like mcp-sync.test.js.
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

describe('log severities in the source', () => {
  it('every log() call uses a severity from 1 to 5', () => {
    const calls = [];
    for (const dir of ['src', 'landing/src', 'site/src']) {
      for (const file of jsFiles(resolve(root, dir))) {
        for (const m of readFileSync(file, 'utf8').matchAll(/\blog\(env, (\d+),/g)) {
          calls.push({ where: `${file.slice(root.length + 1)}: ${m[0]}`, severity: Number(m[1]) });
        }
      }
    }
    expect(calls.length).toBeGreaterThan(100);
    expect(calls.filter((c) => c.severity < 1 || c.severity > 5).map((c) => c.where)).toEqual([]);
  });
});
