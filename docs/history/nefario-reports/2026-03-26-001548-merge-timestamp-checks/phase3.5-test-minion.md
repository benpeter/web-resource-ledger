## Verdict: ADVISE

---

[testing]: Verdict count test for merged "qualified only" state uses wrong expected count

SCOPE: New test case 1 in the proposed `describe('formatHuman -- timestamp merging')` block

CHANGE: The plan specifies: "qualifiedTimestamp: pass, timestamp: skip — Assert verdict: `All 4 cryptographic checks passed` (3 core + 1 merged pass)". But reading `makeSkipResult()` — the nearest analogue — its 4 raw checks (3 core + 1 timestamp:skip) merge to 3 core + 1 merged = 4 display checks. The merged timestamp:skip becomes `timeVerification:skip`, so `buildVerdict` would see 3 applicable + 1 skip → "3 of 3 applicable, 1 not applicable". For the qualified-only case (qualifiedTimestamp:pass, timestamp:skip), the merge produces status:pass (fail > pass > skip priority), so verdict is "All 4 checks passed". That part is correct. However: the inline test factory must include `qualifiedTimestamp` in the checks array. The plan does not specify what the inline test objects look like, leaving it to the implementer. If the implementer forgets to include `qualifiedTimestamp` as a raw check in addition to `timestamp`, the merge function has nothing to promote and the test silently tests a different scenario.

WHY: The plan delegates construction of inline result objects entirely to the implementer, with no factory spec showing the required shape. The merge function operates on `result.checks` — it needs to see both raw check names to merge them. The existing factories in the file (`makePassResult`, `makeSkipResult`) have no `qualifiedTimestamp` entry at all, so the implementer has no prior art to follow.

TASK: The task prompt for frontend-minion should specify the shape of at least one inline test object, e.g.:
```
// Qualified-only test fixture (raw verifier output)
{
  verified: true,
  checks: [
    { name: 'artifactHashes', status: 'pass' },
    { name: 'bundleHash', status: 'pass' },
    { name: 'signature', status: 'pass' },
    { name: 'qualifiedTimestamp', status: 'pass', detail: 'Qualified timestamp verified' },
    { name: 'timestamp', status: 'skip', detail: 'No independent timestamp was obtained for this capture' },
  ],
  capture: { bundleHash: 'sha256:' + 'a'.repeat(64), signature: 'dGVzdA==', publicKey: 'dGVzdHB1YmxpY2tleQ==', signedAt: '2026-03-16T12:00:00.000Z' },
  keyResolution: { keyId: 'aabbccdd', source: 'pinned', origin: null, endpoint: null },
  source: 'test.wacz',
}
```
Or add a `makeQualifiedResult()` factory at the top of the test file for reuse across all 3 timestamp-state tests.

---

[testing]: The "both present" test (case 3) needs explicit assertion that exactly ONE "Time verification" row appears

SCOPE: New test case 3 — both qualifiedTimestamp:pass and timestamp:pass

CHANGE: The plan says "Assert single `Time verification` row with `pass`". The current check uses `assert.match(stdoutOutput, /Time verification/)` which passes even if the label appears twice. An implementer who accidentally runs the merge only once but still emits both original rows would pass this test.

WHY: The primary bug being fixed is the presence of two rows. The regression test for "exactly one row" is the most valuable assertion here and the plan's wording leaves it implicit.

TASK: Add an explicit count assertion:
```js
const matches = [...stdoutOutput.matchAll(/Time verification/g)];
assert.strictEqual(matches.length, 1, 'Should show exactly one Time verification row');
```
Also assert neither `Timestamp imprint` nor `Qualified timestamp` appears as a label.

---

[testing]: Verdict count assertion for "both present" case depends on CHECK_ORDER position behavior

SCOPE: New test case 3

CHANGE: The plan states "Assert verdict: `All 4 cryptographic checks passed` (not 5)". The "(not 5)" parenthetical acknowledges the risk of double-counting. But if `mergeTimestampChecks` is implemented incorrectly and returns 5 entries, `buildVerdict` will say "All 5 checks passed" — a string that won't match the regex `/All 4/` and the test will catch it. This is actually fine. However: the plan does not specify whether `timestampChain` should be present in the "both present" fixture. If it is, the expected count shifts to 5, not 4. Clarify.

WHY: `timestampChain` appears in CHECK_ORDER and validates the certificate chain of the standard timestamp. In a "both timestamps present" scenario, a real verifier would also run `timestampChain`. If the test fixture omits it but a reviewer compares against production output, the count will be wrong.

TASK: The task prompt should specify explicitly whether `timestampChain` is in-scope for any of the new test fixtures. Simplest resolution: omit `timestampChain` from all new test fixtures (consistent with existing `makeSkipResult` which also omits it) and note this in a comment.

---

[testing]: JSON backward-compat test (case 6) covers check names but not check labels

SCOPE: New test case 6

CHANGE: The plan says "assert the JSON output still has separate `timestamp` and `qualifiedTimestamp` entries". `checkLabel()` uses CHECK_LABELS, and the plan says to keep old `timestamp`/`qualifiedTimestamp` entries in CHECK_LABELS. But if an implementer accidentally removes those old entries (they're no longer in CHECK_ORDER), `checkLabel()` falls back to the raw name (the `?? name` fallback in `checkLabel()`). The test should assert the `label` field values, not just the `name` field.

WHY: The JSON contract includes both `name` and `label`. Consumers may rely on `label: "Timestamp imprint"` or `label: "Qualified timestamp"`. The fallback `?? name` would produce `"timestamp"` instead of `"Timestamp imprint"` — a silent regression.

TASK: The JSON backward-compat test should assert both:
```js
assert.strictEqual(tsCheck.label, 'Timestamp imprint');
assert.strictEqual(qtCheck.label, 'Qualified timestamp');
```

---

## What the plan gets right

- Test cases 1-6 cover all timestamp states plus failure propagation and JSON backward compatibility. That is the right scope.
- Preserving existing factories as-is is correct. The existing verdict tests (lines 179-196) remain valid because `makePassResult` (3 checks, no timestamps) and `makeFailResult` (3 checks) are unaffected by the merge function.
- The `makeSkipResult` verdict test (line 184-188) — the plan correctly identifies that 4 raw → 4 display (3 core + 1 merged skip) and the numbers hold unchanged.
- Passing the merged array to `buildVerdict` rather than modifying `buildVerdict` itself is correct and keeps the verdict count logic clean.
- Explicit JSON immutability test is the right call for a backward-compat guarantee.

None of these concerns are blockers. They are fixable within the implementation task. The largest risk is the inline fixture shape being left unspecified — that's the one most likely to produce a test that passes while testing the wrong thing.
