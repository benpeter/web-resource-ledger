import { describe, it, expect } from 'vitest';
import { canonicalize } from '../src/canonical-json.js';

describe('canonicalize -- key sorting', () => {
  it('sorts top-level keys lexicographically', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sorts nested object keys recursively', () => {
    expect(canonicalize({ z: { b: 1, a: 2 }, y: 3 })).toBe('{"y":3,"z":{"a":2,"b":1}}');
  });
});

describe('canonicalize -- determinism', () => {
  it('produces identical output regardless of key insertion order', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { z: 3, x: 1, y: 2 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });
});

describe('canonicalize -- arrays', () => {
  it('preserves array element order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('sorts object keys inside array elements but preserves array order', () => {
    const input = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
    expect(canonicalize(input)).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });
});

describe('canonicalize -- round-trip', () => {
  it('produces valid JSON that round-trips to equivalent data', () => {
    const input = { url: 'https://example.com', status: 200, ok: true, meta: null };
    const parsed = JSON.parse(canonicalize(input));
    expect(parsed).toEqual(input);
  });
});
