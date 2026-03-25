# Security Minion: Email Verification Token Security Analysis

## 1. Domain Separation Adequacy

### Current state

Three token domains share the same `SESSION_SECRET`:
- **Session cookies**: HMAC input is the raw session ID (no prefix)
- **Unsubscribe tokens**: HMAC input is `"unsub.{base64url(payload)}"`
- **Email verify tokens**: HMAC input is `"emailverify.{base64url(payload)}"`

The existing unsubscribe tests include one cross-domain test: "rejects session cookie values (unsub. prefix domain-separates them)" (line 379 of `notifications.test.js`). No cross-domain tests exist between email-verify and unsubscribe, or between email-verify and sessions.

### Required cross-domain tests (CRITICAL)

All three cross-domain pairs must be tested bidirectionally:

1. **Email-verify token rejected by unsubscribe verifier** -- generate a valid email-verify token, pass it to `verifyUnsubscribeToken()`. Must return `{ ok: false }`. This is critical because both token formats use `{base64url}.{base64url}` and share the same key. Only the prefix in the HMAC input differentiates them.

2. **Unsubscribe token rejected by email-verify verifier** -- generate a valid unsubscribe token, pass it to `verifyEmailVerifyToken()`. Must return `{ ok: false }`.

3. **Session cookie rejected by email-verify verifier** -- construct a session-style signed value (HMAC of raw ID, no prefix), pass it to `verifyEmailVerifyToken()`. Must return `{ ok: false }`. Mirror the pattern from the existing test at line 379.

All three are **critical** tests. The domain separation is the only thing preventing cross-use between these token types. A regression (e.g., someone removes the prefix during refactoring) would allow an unsubscribe link to verify an email address, which is a privilege escalation.

### Implementation note

For tests 1 and 2, import both `generateUnsubscribeToken`/`verifyUnsubscribeToken` from `unsubscribe.js` and `generateEmailVerifyToken`/`verifyEmailVerifyToken` from `email-verify.js`. Generate with one module, verify with the other. The test is a pure unit test -- no HTTP needed.

## 2. TOCTOU Race Condition

### Analysis

The POST handler has this sequence:
1. `verifyEmailVerifyToken()` -- extracts `email` from token
2. `getNotificationPreferences()` -- reads `prefs.pendingEmail` from DB
3. Checks `prefs.pendingEmail !== email` -- rejects if mismatch
4. `swapVerifiedEmail()` -- atomically does `SET email = pending_email WHERE pending_email IS NOT NULL`

There IS a TOCTOU window between steps 2 and 4: if another request clears `pending_email` (e.g., user sets a different email via PUT, or sets email to null) between the read and the swap, `swapVerifiedEmail()` would either:
- Swap in a *different* email than what the token authorized (if a new `pending_email` was set)
- No-op and return `{ ok: false }` (if `pending_email` was cleared to NULL)

The first scenario is the dangerous one: token for `old@example.com` could promote `new@example.com` if the `pending_email` changed between steps 2 and 4.

### Severity: HIGH (design issue, not just a test gap)

The fix is straightforward: `swapVerifiedEmail()` should accept the expected email as a parameter and include `AND pending_email = ?` in its WHERE clause. This makes the swap conditional on the email still matching, closing the TOCTOU gap atomically.

### Test recommendation

**Should be tested**: YES, but after fixing the design. The test would:
1. Set `pending_email = 'a@example.com'`
2. Generate token for `a@example.com`
3. Between token verification and swap, update `pending_email` to `b@example.com` (simulated by direct DB write)
4. Call POST with the token for `a@example.com`
5. Assert that `b@example.com` was NOT promoted

In vitest-pool-workers (single-threaded), you cannot create a true race, but you CAN test the defensive invariant by manipulating the DB between steps. This is a valid test pattern -- it verifies the WHERE clause guards correctly.

**Suggested fix for `swapVerifiedEmail`:**
```js
// Add expected_email parameter
export async function swapVerifiedEmail(db, tenantId, expectedEmail) {
  // ...
  WHERE tenant_id = ? AND pending_email = ?
  // Bind: (now, tenantId, expectedEmail)
}
```

Then update the POST handler to pass `email` from the token result. Flag this as a finding in the test file with a comment pointing to the issue.

## 3. Timing Attack Verification

### Recommendation: Do NOT test this

`crypto.subtle.verify` is a platform primitive implemented in constant-time by the Workers runtime (backed by BoringSSL). Testing timing properties:
- Is unreliable in a test environment (JIT, GC, miniflare overhead make timing measurements meaningless)
- Would produce flaky tests
- Tests a platform guarantee, not application logic

The code already uses the correct API (`crypto.subtle.verify` rather than manual byte comparison). This is sufficient. Document in a test comment why timing-safe verification is trusted to the platform.

## 4. Token Structure Edge Cases

### Critical malformed inputs to test

Priority ordered:

1. **Token with only a dot** (`"."`) -- both `payloadB64` and `hmacB64` would be empty strings. The code checks `if (!payloadB64 || !hmacB64)` at line 126, so this should return `malformed_token`. **Must test** to confirm the guard works.

2. **Token with multiple dots** (`"a.b.c.d"`) -- `lastIndexOf('.')` splits at the final dot. The payload portion would be `"a.b.c"` which includes dots. The base64url decode of `"a.b.c"` will produce garbage, so the HMAC will fail. **Should test** to confirm it fails gracefully (no exception, returns `{ ok: false }`).

3. **Token with valid structure but non-JSON payload** -- base64url-encode a non-JSON string, sign it correctly with `"emailverify."` prefix. The HMAC will pass but `JSON.parse` will throw. **Should test** to verify the catch at line 151 works and returns `malformed_payload`.

4. **Token with valid JSON but missing required fields** -- payload `{ v: 1 }` (no `t`, `e`, `ts`). HMAC will pass. **Should test** all three missing-field cases to verify the field validation at lines 155-172.

5. **Very long token** (>64KB) -- verify it does not cause OOM or hang. Returns `{ ok: false }` of some form. **Nice-to-have** -- the Workers runtime has its own request size limits that would prevent this in practice.

6. **Null bytes in token** (`"abc\x00def.xyz"`) -- `atob()` behavior with null bytes is platform-dependent. **Nice-to-have** -- verify it does not crash.

7. **Unicode in base64url position** -- characters outside the base64url alphabet. `atob()` will throw, caught by the try/catch. **Nice-to-have** -- one test with a token like `"emoji\u{1F600}.valid"` to confirm graceful failure.

### NOT worth testing

- URL-encoded special characters (`%2B`, `%3D`) -- the URL parsing (`searchParams.get`) handles decoding before the token reaches `verifyEmailVerifyToken`. This is a platform guarantee of `URLSearchParams`, not application logic. The token function itself receives the already-decoded string.

## 5. "No Email Logging" Claim

### Should this be tested? YES -- Medium priority

The source header at line 25 states: "Email addresses are never logged." This is a privacy invariant that should be enforced by tests to prevent regression. If a developer adds a log call with the email in a future change, the test should catch it.

### How to test

**Static analysis approach** (preferred -- deterministic, no flakiness):

Scan the source file for log calls that include email-like field names. This can be done as a unit test:

```js
import { readFileSync } from 'fs';

it('email-verify.js never logs email addresses', () => {
  const source = readFileSync('src/email-verify.js', 'utf8');
  // Find all log() calls
  const logCalls = source.match(/log\(env,[\s\S]*?\)\s*\?\?/g) || [];
  for (const call of logCalls) {
    // None of the log payloads should contain email-like field names
    expect(call).not.toMatch(/\bemail\b.*:/);
    expect(call).not.toMatch(/\bto\b.*:/);
    expect(call).not.toMatch(/\bpendingEmail\b/);
    expect(call).not.toMatch(/result\.email/);
  }
});
```

This is a "linter-as-test" pattern. It guards the invariant without needing to intercept log output at runtime.

**Alternative: runtime interception** -- mock or spy on `log()` during handler tests, inspect all logged payloads for email-like values. More robust but more complex and coupled to the log implementation.

Recommend the static analysis approach. It is simpler, does not depend on test infrastructure, and catches the most likely regression (someone adding an email field to an existing log call).

## 6. Additional Security Findings

### FINDING: TOCTOU in POST handler enables wrong-email swap (HIGH)

**Location**: `src/email-verify.js`, lines 427-441

**Description**: The cross-check `prefs.pendingEmail !== email` at line 427 reads the current pending email, but `swapVerifiedEmail()` at line 441 does `SET email = pending_email` without conditioning on which email it expects. If `pending_email` changes between the read and the write (concurrent PUT request), the wrong email gets promoted.

**Impact**: An attacker who controls the timing (or a legitimate user making concurrent requests) could cause an email address to be verified that does not match the verification token. The token for `alice@example.com` could promote `attacker@example.com` if `pending_email` was changed to `attacker@example.com` between the check and the swap.

**Remediation**: Pass the expected email to `swapVerifiedEmail()` and add `AND pending_email = ?` to the UPDATE's WHERE clause. This is a one-line SQL change + one parameter addition.

### FINDING: Token has no nonce -- identical inputs produce time-dependent duplicates (LOW)

**Description**: Two tokens generated for the same tenant+email within the same second will be identical (same payload, same HMAC). This is not exploitable because the token is emailed privately and the timestamp provides sufficient uniqueness in practice (sub-second token generation for the same input is not a realistic scenario). However, it means the token is not suitable as a unique identifier.

**Impact**: Negligible. Mentioned for completeness only.

**Remediation**: None required. If this ever matters, add a random nonce field to the payload.

### FINDING: No test for Cache-Control: no-store on verify endpoints (MEDIUM)

**Description**: Both GET and POST handlers set `Cache-Control: no-store`, which is important because the verification page contains the email address and the form action contains the token. If this header were accidentally removed, shared caches or browser caches could store the token and email.

**Remediation**: Add assertions for `Cache-Control: no-store` on all HTTP-level tests for the verify-email endpoint.

## 7. Prioritized Test List

### Critical (must have before merge)

| # | Test | Type | Rationale |
|---|------|------|-----------|
| 1 | Token round-trip (generate + verify) | Unit | Basic correctness |
| 2 | Token expiry (>24h rejected) | Unit | Expiry enforcement |
| 3 | Tampered payload rejected | Unit | HMAC integrity |
| 4 | Tampered HMAC rejected | Unit | HMAC integrity |
| 5 | Email-verify token rejected by unsubscribe verifier | Unit | Domain separation |
| 6 | Unsubscribe token rejected by email-verify verifier | Unit | Domain separation |
| 7 | Session cookie rejected by email-verify verifier | Unit | Domain separation |
| 8 | Token for email A cannot verify email B (DB cross-check) | Integration | Replay protection |
| 9 | POST with valid token + matching pending_email swaps successfully | Integration | Happy path |
| 10 | POST with valid token but pending_email mismatch rejects | Integration | Stale token defense |
| 11 | GET and POST return 200 for invalid/expired tokens | Integration | No information leakage |

### High (should have)

| # | Test | Type | Rationale |
|---|------|------|-----------|
| 12 | Missing token (empty, null, undefined) | Unit | Input validation |
| 13 | Malformed: no dot, only dot, multiple dots | Unit | Parser robustness |
| 14 | Valid JSON payload but missing required fields (t, e, ts, v) | Unit | Schema validation |
| 15 | GET does not modify DB (like the existing unsubscribe test) | Integration | GET safety |
| 16 | Cache-Control: no-store on GET and POST responses | Integration | Caching safety |
| 17 | POST with expired token shows error page (not just unit verify) | Integration | End-to-end expiry |
| 18 | TOCTOU: pending_email changes between check and swap | Integration | Race condition (after fix) |

### Medium (nice to have)

| # | Test | Type | Rationale |
|---|------|------|-----------|
| 19 | No email addresses in log calls (static analysis) | Unit | Privacy invariant |
| 20 | Token with non-JSON payload (valid HMAC, invalid JSON) | Unit | Error handling |
| 21 | POST reads token from form body when query param is missing | Integration | Input source fallback |
| 22 | XSS: email in token is HTML-escaped in rendered page | Integration | Output encoding |
| 23 | Very long token (>64KB) | Unit | Resource limits |
| 24 | HTML response contains no raw email in non-escaped context | Integration | Output encoding |
