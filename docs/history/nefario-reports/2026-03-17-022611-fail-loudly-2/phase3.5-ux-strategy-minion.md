# UX Strategy Review — fail-loudly-2

**Verdict: APPROVE**

## Assessment

### User-facing exposure

The synthesis plan states `timestampStatus` is internal (KV records and logs only, not surfaced in API responses). I verified this directly: `timestampStatus` appears only in `src/wacz.js` and `src/capture.js`. It is absent from `src/index.js`, `src/verify.js`, and `src/verify-page.js`. No user-facing surface is touched.

The plan's cross-cutting note ("No user-facing behavior changes") is accurate.

### Operator-facing UX: the three-way status

The rename from `'absent'` to `'skipped'` improves operator comprehension in logs. The distinction matters:

- `'present'` — timestamp was applied
- `'skipped'` — TSA not configured; intentional absence
- `'error'` — TSA attempted and failed

`'absent'` was ambiguous because it conflated two operationally distinct states (intentionally unconfigured vs. broken). Operators reading a Coralogix event or KV record could not distinguish "working as designed" from "silently broken" — exactly what hid the DigiCert misconfiguration in issue #66.

`'skipped'` is the correct word: it signals intentional bypass, not failure. This is consistent with the verify API's use of `status: 'skip'` for tolerated absent timestamps (`verify.js:24`). The vocabulary is now coherent across the stack.

### Cognitive load of the three-way distinction

The three states are mutually exclusive and exhaustive. They map cleanly to operator mental models: worked / deliberately not used / failed to work. No confusion arises from showing all three because they never co-occur for a given capture. The distinction is low-frequency (operators see it only when investigating a specific capture), so even if `'skipped'` requires a moment of interpretation the first time, it is not a recurring tax.

### Simplification opportunities

None identified. The changes are narrowly scoped: add error details to existing catch blocks, rename one enum value. The plan correctly excludes retry logic, circuit breakers, and new API surface. The consent.js frame-level catches are correctly left silent (cross-origin frame lifecycle is a named, expected failure type). The `console.warn` / `log()` split is pragmatic: hot-path calls use `console.warn` to avoid latency, infrequent critical paths use structured Coralogix events.

### One observation (non-blocking)

`capture.js:231` already uses `'skipped'` as the fallback (`waczInfo?.timestampStatus ?? 'skipped'`), suggesting `'skipped'` was the intended value all along. The rename corrects the inconsistency that existed between `wacz.js` (`'absent'`) and `capture.js` (already `'skipped'` as fallback). This makes the change lower-risk than the plan implies — production captures where `buildWacz` returns null already store `'skipped'` in KV. Only captures where `buildWacz` succeeded but TSA was unconfigured stored `'absent'`. The terminology is being unified, not introduced.

No UX concerns. Proceed.
