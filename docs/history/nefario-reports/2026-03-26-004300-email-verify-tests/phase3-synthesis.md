## Delegation Plan

**Team name**: email-verify-tests
**Description**: Add comprehensive test coverage for the email verification flow (email-verify.js) per issue #199.

### Task 1: Write test/email-verify.test.js
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task

    Create `test/email-verify.test.js` -- the test suite for the email verification flow implemented in `src/email-verify.js` and the resend handler in `src/notifications.js`.

    This is issue #199. The scope is tests only -- no production code changes.

    ## Context

    Read these files before writing anything:
    - `src/email-verify.js` -- token generation/verification + GET/POST handlers
    - `src/notifications.js` -- `handleResendVerification` (lines 305-360)
    - `src/unsubscribe.js` -- `generateUnsubscribeToken`, `verifyUnsubscribeToken` (for cross-domain tests)
    - `src/db.js` -- `swapVerifiedEmail`, `getNotificationPreferences`, `setPendingEmail`
    - `test/notifications.test.js` -- existing test patterns (session helpers, cleanDb, ipCounter, token crafting)
    - `test/fixtures.js` -- `createTestSession`, `cleanDb`
    - `vitest.config.js` -- worker pool config and env bindings

    ## File Structure

    Single file: `test/email-verify.test.js`

    Use 5 describe blocks in this order:
    1. **Token generation and verification** (unit, no HTTP)
    2. **GET /v1/notifications/verify-email** (integration via SELF.fetch)
    3. **POST /v1/notifications/verify-email** (integration via SELF.fetch)
    4. **POST /v1/account/notifications/resend-verification** (integration via SELF.fetch)
    5. **Notification continuity** (integration -- notifications go to old email while pending)

    ## Tests to Write (~25 total)

    ### 1. Token generation and verification (unit tests, ~10 tests)

    - **Round-trip**: generate token, verify it, assert `{ ok: true, tenantId, email }`
    - **Expiry (>24h rejected)**: Craft a token with `ts` backdated by 25 hours (90000 seconds). Use the manual HMAC signing pattern from `test/notifications.test.js` lines 397-418. The HMAC input prefix is `"emailverify."`. Assert `{ ok: false, reason: 'token_expired' }`.
    - **Boundary (exactly 24h)**: Craft token with `ts = Math.floor(Date.now()/1000) - 86400`. Code uses `> 86400`, so this should still be valid. Assert `{ ok: true }`.
    - **Tampered payload**: Change a character in the payload portion of a valid token. Assert `{ ok: false, reason: 'invalid_signature' }`.
    - **Tampered HMAC**: Change a character in the HMAC portion. Assert `{ ok: false, reason: 'invalid_signature' }`.
    - **Domain separation -- unsubscribe token rejected by verify**: Generate with `generateUnsubscribeToken`, pass to `verifyEmailVerifyToken`. Must return `{ ok: false }`. Import from `src/unsubscribe.js`.
    - **Domain separation -- verify token rejected by unsubscribe**: Generate with `generateEmailVerifyToken`, pass to `verifyUnsubscribeToken`. Must return `{ ok: false }`.
    - **Domain separation -- session cookie rejected by verify**: Construct a session-style signed value (HMAC of raw ID, no `emailverify.` prefix), pass to `verifyEmailVerifyToken`. Must return `{ ok: false }`. Mirror the existing pattern from `test/notifications.test.js` line 379.
    - **Version mismatch**: Craft a validly-signed token with `v: 2`. Assert `{ ok: false, reason: 'invalid_payload_version' }`.
    - **Missing fields**: Craft validly-signed tokens missing `e` field. Assert `{ ok: false, reason: 'invalid_payload_email' }`. (One test is sufficient -- the pattern is the same for all fields.)
    - **Malformed: dot-only token** (`"."`): Assert `{ ok: false, reason: 'malformed_token' }`.
    - **Malformed: no dot**: Assert `{ ok: false, reason: 'malformed_token' }`.
    - **Missing/empty token**: `verifyEmailVerifyToken(secret, '')` and `verifyEmailVerifyToken(secret, null)`. Assert `{ ok: false, reason: 'missing_token' }`.

    ### 2. GET /v1/notifications/verify-email (integration, ~4 tests)

    - **Valid token**: Generate token for a tenant with pending_email set. GET with `?token=...`. Assert 200, HTML contains "Confirm email address", `Cache-Control: no-store`.
    - **Invalid token**: GET with `?token=garbage`. Assert 200, HTML contains "Invalid or expired link".
    - **Expired token**: Craft backdated token. Assert 200, HTML contains "Invalid or expired link".
    - **Missing token**: GET without `?token`. Assert 200, HTML contains "Invalid or expired link".
    - GET must NOT modify DB state (read prefs before and after, assert identical).

    ### 3. POST /v1/notifications/verify-email (integration, ~7 tests)

    - **Happy path**: Set pending_email via PUT, generate token, POST. Assert 200, HTML contains "Email address verified". Read DB: `email` = new address, `pending_email` = NULL, `email_verified` = 1.
    - **Invalid token**: POST with garbage token. Assert 200, HTML contains "Verification failed".
    - **Expired token**: Craft backdated token, POST. Assert 200, HTML contains "Verification failed".
    - **Stale token (pending_email changed)**: Set pending_email to A, generate token for A, then change pending_email to B via PUT. POST with token for A. Assert failure (pending_email_mismatch).
    - **Double verification**: POST same valid token twice. First succeeds (pending_email swapped to NULL). Second fails (no pending_email to match).
    - **Token in form body**: POST without query param, send token as `application/x-www-form-urlencoded` body. Assert success.
    - **Empty token**: POST with `?token=` (empty). Assert 200, failure page.
    - **Cache-Control: no-store** on all POST responses.

    ### 4. POST /v1/account/notifications/resend-verification (integration, ~4 tests)

    URL: `https://worker.test/v1/account/notifications/resend-verification`

    This is a session-authenticated endpoint. Requires Cookie + X-WRL-CSRF header.

    - **Happy path**: Create session, set pending_email via PUT, call resend. Assert 200, `{ sent: true }`.
    - **No pending email**: Create session (no PUT). Call resend. Assert 400.
    - **Rate limit**: Call resend twice within 60 seconds. Second call returns 429 with `Retry-After: 60`.
    - **Missing CSRF header**: Call without `X-WRL-CSRF`. Assert 403.

    ### 5. Notification continuity (~1 test)

    - Set up a tenant with email "old@example.com", then set pending_email to "new@example.com" via PUT. Read notification preferences: `email` should still be "old@example.com" (notifications continue to old address). After successful POST verify-email, `email` should be "new@example.com".

    ## TOCTOU Finding (Document, Do NOT Fix)

    The `swapVerifiedEmail()` function in `src/db.js` (line 1400) does `SET email = pending_email WHERE tenant_id = ? AND pending_email IS NOT NULL` without conditioning on which email it expects. There is a TOCTOU window where `pending_email` could change between the cross-check (line 427 of email-verify.js) and the swap (line 441).

    **Do NOT fix the production code.** This issue is out of scope for #199.

    Instead, write the "stale token after second email change" test (test 4 in POST section above) and add a code comment:

    ```js
    // NOTE: The existing pending_email cross-check (prefs.pendingEmail !== email)
    // catches the common case, but swapVerifiedEmail() does not include
    // AND pending_email = ? in its WHERE clause. A concurrent request could
    // change pending_email between the check and the swap. See security review
    // notes in docs/evolution/ for details. The fix is tracked separately.
    ```

    ## Implementation Patterns

    Follow the exact conventions from `test/notifications.test.js`:

    - Import `{ env, SELF }` from `'cloudflare:test'`
    - Import `{ describe, it, expect, beforeEach }` from `'vitest'`
    - Import `{ cleanDb, createTestSession }` from `'./fixtures.js'`
    - Use `beforeEach(async () => { await cleanDb(env.DB); })`
    - Use a distinct IP counter range: start at `500` (`let ipCounter = 500; function nextIp() { return \`10.0.5.${ipCounter++}\`; }`)
    - Duplicate the `createTosSession` helper (5 lines, don't extract)
    - For token crafting (expiry, tampered, domain separation, version, missing fields): use inline HMAC signing with `crypto.subtle`. The `toB64url` helper and HMAC signing pattern are shown in the test-minion contribution -- use that exact pattern.
    - The SESSION_SECRET is available as `env.SESSION_SECRET` in vitest-pool-workers

    For resend tests, the session-authenticated requests need:
    ```js
    SELF.fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': ip,
        'X-WRL-CSRF': '1',
      },
    })
    ```

    For GET/POST verify-email (unauthenticated), just use:
    ```js
    SELF.fetch(`https://worker.test/v1/notifications/verify-email?token=${token}`, {
      headers: { 'CF-Connecting-IP': ip },
    })
    ```

    For POST verify-email:
    ```js
    SELF.fetch(`https://worker.test/v1/notifications/verify-email?token=${token}`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': ip },
    })
    ```

    ## What NOT To Do

    - Do NOT modify any production code (src/*.js, src/db.js). Tests only.
    - Do NOT create a GitHub issue for the TOCTOU fix (the human will handle that).
    - Do NOT test timing-safe HMAC verification (platform guarantee, untestable).
    - Do NOT add the static-analysis "no email logging" test (fragile regex linting; out of scope).
    - Do NOT try to test queue contents -- assert HTTP response shape as proxy for queue behavior.
    - Do NOT use `vi.useFakeTimers()` for expiry tests -- craft backdated tokens instead.
    - Do NOT extract shared token helpers into a separate file. Keep everything inline in the test file.
    - Do NOT touch `test/notifications.test.js`.

- **Deliverables**: `test/email-verify.test.js` (~25 tests across 5 describe blocks)
- **Success criteria**: `npx vitest run test/email-verify.test.js` passes. All tests exercise real behavior via SELF.fetch or direct function calls. No mocks of core logic.

### Cross-Cutting Coverage

- **Testing**: This IS the testing task. test-minion is primary.
- **Security**: security-minion findings incorporated into the prompt (domain separation tests, TOCTOU documentation, Cache-Control assertions, malformed token edge cases). No separate security task needed.
- **Usability -- Strategy**: Not applicable. This task produces no user-facing changes. It is a test file for an existing feature.
- **Usability -- Design**: Not applicable. No UI changes.
- **Documentation**: The TOCTOU finding should be noted in the evolution log's `decisions.md` (handled in Phase 8, not a separate task). The test file itself serves as living documentation of the verification flow's contract.
- **Observability**: Not applicable. No runtime components created.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: none
  - ux-design-minion: No -- no UI produced
  - accessibility-minion: No -- no HTML/UI produced
  - sitespeed-minion: No -- no web-facing runtime code
  - observability-minion: No -- no runtime components
  - user-docs-minion: No -- no user-facing behavior changes
- **Not selected**:
  - observability-minion: Test file only, no runtime components to instrument
  - user-docs-minion: No change to what users see or do

### Decisions

- **TOCTOU: document-only vs. fix-in-PR**
  Chosen: Document the gap in a test comment, write the stale-token test that catches the common case, defer the SQL fix
  Over: Including the `AND pending_email = ?` fix in this PR (security-minion recommendation)
  Why: Issue #199 scope is explicitly tests only. The fix is a 2-line change to `swapVerifiedEmail()` + its caller, but mixing code fixes into a test PR muddies the commit history and review. The existing cross-check catches the common case; the TOCTOU requires concurrent requests to exploit, which is extremely unlikely in single-tenant D1. The fix is worth doing but as its own PR.

- **Static analysis "no email logging" test: include vs. skip**
  Chosen: Skip
  Over: Including a regex-based source scan test (security-minion recommendation)
  Why: Regex scanning of source code for log patterns is fragile and produces false positives/negatives as the code evolves. The privacy invariant is better enforced by code review convention. The test would add maintenance burden disproportionate to its value.

- **Resend tests location: email-verify.test.js vs. notifications.test.js**
  Chosen: email-verify.test.js (new file)
  Over: Adding to existing notifications.test.js
  Why: Both specialists agreed. The resend handler is functionally part of the email verification flow. notifications.test.js is already 579 lines. Grouping by feature (verification flow) is more discoverable than grouping by URL prefix.

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Rate limiter cross-contamination between test cases | Distinct IP counter range (start at 500) with `10.0.5.x` subnet, separate from notifications.test.js range |
| DB state leaking between tests | `beforeEach(cleanDb)` -- same proven pattern |
| Token helper code duplication | Inline in test file, consistent with existing codebase pattern. Not worth extracting at ~25 tests |
| Queue assertions impossible via SELF.fetch | Assert HTTP response shape as proxy (`verificationEmailSent: true`, `sent: true`) |

### Execution Order

```
Batch 1: Task 1 (test-minion writes test/email-verify.test.js)
-- no gates, single task --
```

### Verification Steps

1. `npx vitest run test/email-verify.test.js` -- all ~25 tests pass
2. `npx vitest run` -- full suite passes (no regressions in existing tests)
3. No production code files modified (git diff should show only test/ changes)
