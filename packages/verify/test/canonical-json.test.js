/**
 * canonical-json.test.js -- Edge cases for canonicalize()
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize } from '../lib/canonical-json.js';

describe('canonicalize -- key sorting', () => {
  it('sorts keys alphabetically', () => {
    const result = canonicalize({ z: 1, a: 2, m: 3 });
    assert.strictEqual(result, '{"a":2,"m":3,"z":1}');
  });

  it('produces stable output for the same input object', () => {
    const obj = { hash: 'sha256:abc', created: '2026-01-01', version: '0.1.0' };
    assert.strictEqual(canonicalize(obj), canonicalize(obj));
  });

  it('sorts nested object keys', () => {
    const result = canonicalize({ outer: { z: 1, a: 2 } });
    assert.strictEqual(result, '{"outer":{"a":2,"z":1}}');
  });
});

describe('canonicalize -- type handling', () => {
  it('serializes null', () => {
    assert.strictEqual(canonicalize(null), 'null');
  });

  it('serializes strings', () => {
    assert.strictEqual(canonicalize('hello'), '"hello"');
  });

  it('serializes numbers', () => {
    assert.strictEqual(canonicalize(42), '42');
    assert.strictEqual(canonicalize(3.14), '3.14');
    assert.strictEqual(canonicalize(0), '0');
  });

  it('serializes booleans', () => {
    assert.strictEqual(canonicalize(true), 'true');
    assert.strictEqual(canonicalize(false), 'false');
  });

  it('serializes arrays (no sorting of elements)', () => {
    assert.strictEqual(canonicalize([3, 1, 2]), '[3,1,2]');
  });

  it('serializes arrays of objects (each object has sorted keys)', () => {
    const result = canonicalize([{ z: 1, a: 2 }, { m: 3, b: 4 }]);
    assert.strictEqual(result, '[{"a":2,"z":1},{"b":4,"m":3}]');
  });

  it('serializes empty object', () => {
    assert.strictEqual(canonicalize({}), '{}');
  });

  it('serializes empty array', () => {
    assert.strictEqual(canonicalize([]), '[]');
  });
});

describe('canonicalize -- special characters', () => {
  it('escapes double quotes in string values', () => {
    const result = canonicalize({ key: 'say "hello"' });
    assert.strictEqual(result, '{"key":"say \\"hello\\""}');
  });

  it('handles unicode characters', () => {
    const result = canonicalize({ emoji: '\u2603' });
    // JSON.stringify handles unicode encoding
    assert.ok(result.includes('"emoji"'));
  });

  it('handles newlines in values', () => {
    const result = canonicalize({ text: 'line1\nline2' });
    assert.match(result, /\\n/);
  });
});

describe('canonicalize -- no whitespace', () => {
  it('produces no whitespace between tokens', () => {
    const result = canonicalize({ a: 1, b: [2, 3] });
    assert.ok(!result.includes(' '), 'output must not contain spaces');
    assert.ok(!result.includes('\n'), 'output must not contain newlines');
  });
});

describe('canonicalize -- datapackage.json equivalence', () => {
  it('two equivalent objects canonicalize to the same string regardless of key order', () => {
    const a = { wacz_version: '1.1.1', profile: 'data-package', resources: [] };
    const b = { resources: [], profile: 'data-package', wacz_version: '1.1.1' };
    assert.strictEqual(canonicalize(a), canonicalize(b));
  });
});
