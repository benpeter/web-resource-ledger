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
- **Missing fields**: Craft validly-signed tokens missing `e` field. Assert `{ ok: false, reason: 'invalid_payload_email' }`.
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

The `swapVerifiedEmail()` function in `src/db.js` does `SET email = pending_email WHERE tenant_id = ? AND pending_email IS NOT NULL` without conditioning on which email it expects.

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
- For token crafting (expiry, tampered, domain separation, version, missing fields): use inline HMAC signing with `crypto.subtle`. The `toB64url` helper and HMAC signing pattern are shown in the existing tests -- use that exact pattern.
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

## Deliverables
`test/email-verify.test.js` (~25 tests across 5 describe blocks)

## Success Criteria
`npx vitest run test/email-verify.test.js` passes. All tests exercise real behavior via SELF.fetch or direct function calls. No mocks of core logic.

When you finish your task, report:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
