## Task: Canonical JSON Module and Tests

Working directory: /Users/ben/github/benpeter/web-resource-ledger

### Context
You are implementing canonical JSON serialization for the WACZ signing pipeline. The `bundleHash` (SHA-256 of the manifest) must be deterministic -- identical input always produces identical bytes. This is a pure function with no dependencies.

The project uses vanilla JS (no TypeScript, no frameworks). Tests use `@cloudflare/vitest-pool-workers`.

### What to do

**Part A: Create `src/canonical-json.js`**

Implement a `canonicalize(obj)` function that:
- Recursively sorts object keys lexicographically (default JS sort -- UTF-16 code unit order)
- Produces JSON with no whitespace (no spaces, no newlines)
- Handles nested objects, arrays, strings, numbers, booleans, null
- Arrays preserve element order (do not sort array contents)
- Export as a named export

Reference implementation (~5 lines):
```javascript
export function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}
```

Keep it simple. No special handling for undefined, BigInt, Symbol, Date -- these are not valid in our manifests. No dependency on any library.

**Part B: Create `test/canonical-json.test.js`**

**IMPORTANT (advisory from architecture review -- margo)**: Keep tests proportionate to the implementation. This is a ~5-line function that delegates to JSON.stringify. Focus on the function's OWN novel behavior (recursive key sorting), not on testing JSON.stringify's behavior.

Include 4-5 focused test cases:
1. **Key sorting**: `{b:1, a:2}` produces `{"a":2,"b":1}` (including nested objects)
2. **Determinism guarantee**: Two objects with same keys in different insertion order produce identical output
3. **Arrays preserve order**: `[3,1,2]` stays `[3,1,2]`; arrays containing objects have their object keys sorted but array order preserved
4. **Round-trip**: `JSON.parse(canonicalize(input))` succeeds and produces equivalent data

Do NOT include tests for: unicode string escaping, number representation, string escaping with control characters, empty containers as separate tests -- these test JSON.stringify's behavior, not canonicalize's behavior.

### What NOT to do
- Do NOT handle BigInt, Symbol, undefined, Date, or Infinity -- these will never appear in our manifests
- Do NOT test deeply nested structures (>3 levels) -- our manifest is shallow
- Do NOT add any npm dependencies
- Do NOT use TypeScript
- Do NOT modify any existing files
- Do NOT write 10+ test cases -- keep it proportionate (4-5 tests for a 5-line function)

### Existing patterns to follow
- Look at `test/capture.test.js` for test structure conventions
- Keep the module minimal -- this is a utility function, not a framework

### Deliverables
1. `src/canonical-json.js` -- the canonicalize function
2. `test/canonical-json.test.js` -- 4-5 focused test cases

### Success criteria
- `vitest run test/canonical-json.test.js` passes
- Two objects with same keys in different insertion order produce byte-identical canonical JSON
