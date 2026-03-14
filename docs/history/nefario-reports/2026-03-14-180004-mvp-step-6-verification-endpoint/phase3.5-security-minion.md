## Security Minion Review -- Verification Endpoint (Phase 3.5)

**Verdict: ADVISE**

The core security architecture is sound. The conflict resolutions went the right way on every major decision: server-key-only trust model, conditional cache-control split, no hash values in detail messages, and run-all-checks behavior are all correct. The key-substitution attack test in Task 3 is exactly what is needed. The following items are warnings, not blockers.

---

### Warnings

- [security]: The verification response exposes `capture.url` on a public, unauthenticated, cacheable endpoint
  SCOPE: Task 2, `handleVerifyCapture` response body (Step 7), `capture.url` field
  CHANGE: Remove `capture.url` from the public verification response body, or replace it with a non-reversible URL-hash fingerprint. The `capture.id`, `createdAt`, and `completedAt` fields carry the evidentiary value; the raw URL is not needed for verification correctness.
  WHY: The retrieval endpoint (`GET /v1/captures/{id}`) has `Cache-Control: private, no-store` specifically because the capture ID acts as an access secret and the URL is considered sensitive (legal/compliance captures may contain confidential URLs). The verification endpoint caches `verified: true` responses publicly for 24 hours with `stale-while-revalidate=604800`. Publishing `capture.url` on a public, long-cached, CORS-open endpoint breaks the access-control model that private caching of the retrieval endpoint was designed to enforce. Anyone who discovers a capture ID can now also retrieve the captured URL without any credential -- for up to 7 days from cache. This is an information disclosure regression (A01, A02).
  TASK: 2

- [security]: The 100MB size guard runs AFTER `obj.arrayBuffer()` loads the full object into memory
  SCOPE: Task 2, `handleVerifyCapture` Step 5 (size guard)
  CHANGE: Check `obj.size` BEFORE calling `obj.arrayBuffer()`. The plan states "Check `obj.size`. If > 100MB...return 422", but Step 6 calls `obj.arrayBuffer()` immediately after. Reorder: check `obj.size` first, reject if over limit, then call `arrayBuffer()` only if within limit.
  WHY: If a WACZ stored in R2 is unexpectedly large (data corruption, attacker-supplied via a different path), the size check must gate the memory allocation, not follow it. As written in the plan, the arrayBuffer call at Step 6 will allocate up to the R2 object's full size before the size check at Step 5 can reject it. The plan description implies the right order but the Step numbers in the prompt reverse it. This is a resource exhaustion vector (CWE-400, A10 Mishandling of Exceptional Conditions).
  TASK: 2

- [security]: ZIP parsing in Task 1 uses `unzipSync` which throws on malformed input -- the thrown exception must be caught in `verifyWacz`, not propagate to the handler
  SCOPE: Task 1, `src/verify.js`, ZIP parsing step
  CHANGE: Wrap `unzipSync(waczBytes)` in a try/catch. On any exception, return all three checks as `'fail'` with `detail: 'WACZ bundle is not a valid ZIP archive'`. The Task 1 prompt says to do this but phrases it as "If the ZIP is invalid, return all checks as fail" without explicitly requiring try/catch. The implementing agent (debugger-minion) may assume `unzipSync` signals invalidity via a return value rather than an exception. Confirm the prompt makes the try/catch requirement unambiguous.
  WHY: `fflate`'s `unzipSync` throws a `Error` on malformed input; it does not return null. An unhandled throw from a pure function propagates to the handler and becomes an unhandled promise rejection or a 500. The handler in Task 2 has no try/catch around the `verifyWacz` call. A malformed byte sequence (even without the 100MB guard being triggered) would produce a 500 instead of the intended `verified: false`. This is both a DoS vector (crash-the-worker on demand with malformed 1-byte payloads) and an A10 failure.
  TASK: 1

- [security]: `detail` field appears in the `capture` return value of `verifyWacz` when extraction fails -- the handler must not forward that to the public response
  SCOPE: Task 2, `handleVerifyCapture` Step 7, `wacz: result.capture || null`
  CHANGE: The plan's Step 7 passes `result.capture` directly to the response as `wacz`. If `result.capture` contains a `detail` field from a partial parse failure, that detail propagates publicly. Confirm Task 1's specification that `detail` only lives on check objects and never on the `capture` field. Document in Task 2's prompt that `result.capture` is structurally trusted but should never include a `detail` key.
  WHY: Low probability but the data flow from Task 1's output shape to Task 2's response assembly is implicit. If an implementing agent adds diagnostic information to the `capture` object (which is reasonable for debugging), it surfaces publicly. Belt-and-suspenders clarification prevents information leakage without code cost.
  TASK: 2

- [security]: Rate limiting keys on `CF-Connecting-IP` only -- this is correct but the fallback `'unknown'` collapses all no-IP requests to a single bucket
  SCOPE: Task 2, `handleVerifyCapture` Step 1, rate limiter key selection
  CHANGE: Change the fallback from `'unknown'` to a random or session-scoped string, or document explicitly that the `'unknown'` bucket is an accepted shared rate limit for requests without a visible IP (Cloudflare Workers should always have CF-Connecting-IP in production, so this only fires in local dev or misconfigured proxies). A comment in the handler is sufficient.
  WHY: In practice this is low risk because CF-Connecting-IP is always present in Cloudflare Workers production. However, if the endpoint is tested behind a proxy in staging without CF-Connecting-IP, all test traffic shares one rate limit bucket, potentially causing spurious 429s that could be misread as a real rate limit configuration error. Not a security vulnerability, but operationally confusing and worth a code comment.
  TASK: 2

---

### Confirmed Correct (no changes needed)

- **Server-key-only trust model**: The conflict resolution is correct. `publicKeyBytes` flows in from `getSigningKeys(env)`. The embedded `signedData.publicKey` is returned in the response for informational use but never passed to `verifySignature`. This is the right architecture.
- **No hash values in detail messages**: The constraint is stated clearly in Task 1 and tested in Task 3 (test 11). Correct.
- **Run-all-checks behavior**: All three checks run regardless of earlier failures. Correct -- this prevents timing oracle and enumeration attacks.
- **KV-first fast-fail**: Cheap KV read before expensive R2 fetch is the right resource exhaustion defense.
- **503 on missing `SIGNING_KEY`**: Never silently skips verification. Correct.
- **`verified: false` on R2 data loss (not 500)**: Graceful degradation is correct. A missing WACZ is a verification result.
- **`Cache-Control: no-store` on `verified: false`**: Correct -- transient failures must not be cached.
- **Key-substitution attack test (Task 3, test 7)**: This is the most important security test in the suite. Its presence and the specification of what "must fail" is correct.
- **Integration test 16 (IP absent from response) and 17 (R2 keys absent)**: Critical privacy tests. Both are present. Correct.
