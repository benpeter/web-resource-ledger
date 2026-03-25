# Test Minion -- Planning Contribution: Email Verification Tests

## Question 1: File Organization

**Recommendation: Create a single `test/email-verify.test.js` that contains both unit-level token tests and integration-level HTTP handler tests.**

Rationale:
- The existing `test/notifications.test.js` already follows this mixed pattern (unsubscribe token unit tests lines 332-428, then HTTP endpoint tests lines 434-578). A new file following the same convention is consistent and discoverable.
- `email-verify.js` is a self-contained module with its own token functions and its own HTTP handlers. Grouping its tests in one file mirrors the source structure.
- The resend-verification handler (`handleResendVerification`) should also live in this new file (see Question 3).
- Splitting into two files (e.g., `test/email-verify-token.test.js` and `test/email-verify-handlers.test.js`) adds navigational overhead for ~15-20 tests total. Not worth it at this scale.

The file should be structured with `describe` blocks in this order:
1. Token generation and verification (unit, no HTTP)
2. GET /v1/notifications/verify-email (integration via SELF.fetch)
3. POST /v1/notifications/verify-email (integration via SELF.fetch)
4. POST /v1/account/notifications/resend-verification (integration via SELF.fetch)

## Question 2: Time Manipulation for Token Expiry

**Recommendation: Option (a) -- construct a token with a manually backdated `ts` field and sign it with the known HMAC key.**

This is the most reliable and maintainable approach for this codebase. Here is the concrete implementation pattern:

```js
it('rejects token older than 24 hours', async () => {
  const enc = new TextEncoder();
  function toB64url(bytes) {
    const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  const sessionSecret = 'deadbeef'.repeat(8);
  // Backdate by 25 hours (90000 seconds)
  const payload = JSON.stringify({
    t: 'gh-test',
    e: 'test@example.com',
    ts: Math.floor(Date.now() / 1000) - 90000,
    v: 1,
  });
  const payloadB64 = toB64url(enc.encode(payload));
  const hmacInput = `emailverify.${payloadB64}`;
  const keyBytes = new Uint8Array(sessionSecret.match(/.{2}/g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(hmacInput));
  const hmacB64 = toB64url(new Uint8Array(sig));
  const token = `${payloadB64}.${hmacB64}`;

  const result = await verifyEmailVerifyToken(sessionSecret, token);
  expect(result.ok).toBe(false);
  expect(result.reason).toBe('token_expired');
});
```

Why not the alternatives:
- **(b) Mock Date.now()**: In `@cloudflare/vitest-pool-workers`, tests run inside the workerd runtime. `vi.useFakeTimers()` / `vi.spyOn(Date, 'now')` behavior in the miniflare worker context is unreliable -- the timer mocking may not propagate into the worker's `Date.now()` when called via `SELF.fetch()`. This approach works for pure unit tests of the token functions but breaks for integration tests where the handler calls `Date.now()` inside workerd.
- The manually-signed token approach is already the established pattern in this codebase (see `test/notifications.test.js` lines 397-418 where an unknown eventType token is crafted by hand). It is consistent, explicit, and has zero runtime coupling.

**Additional consideration**: Also test a token that is exactly at the 24-hour boundary (86400 seconds old). The code uses `> 86400` (strictly greater than), so a token exactly 86400 seconds old should still be valid. This boundary test catches off-by-one errors.

## Question 3: Where to Put Resend-Verification Tests

**Recommendation: Put them in the new `test/email-verify.test.js`.**

Rationale:
- The resend handler is functionally part of the email verification flow -- it generates a new verification token, calls `setPendingEmail`, and enqueues a verification email. It is tightly coupled to `email-verify.js`'s `generateEmailVerifyToken`.
- Testing it alongside the GET/POST verify-email handlers enables natural test sequencing: set up a pending email via PUT, then test resend, then test verify-email POST. The DB state flows naturally.
- The `/v1/account/notifications/*` router path grouping is an implementation detail of URL design. Test files should group by feature/flow, not by URL prefix.
- `test/notifications.test.js` is already 579 lines. Adding more tests there makes it harder to navigate.

## Question 4: Additional Edge Cases

After reading the source code in detail, these edge cases should be covered beyond the 9 listed scenarios:

### Token-level edge cases (unit tests)

1. **Token at exact 24-hour boundary**: `ts = now - 86400` should still pass (code uses `> 86400`). Catches off-by-one.

2. **Token with future timestamp**: `ts` set to a time in the future. The code only checks `now - ts > 86400`, so a future-dated token would pass. This is worth documenting in a test even if the current behavior is acceptable -- it establishes the contract.

3. **Token with version != 1**: Craft a validly-signed token with `v: 2`. Should return `{ ok: false, reason: 'invalid_payload_version' }`. Tests forward compatibility rejection.

4. **Token with missing fields**: Craft a validly-signed token with `{ t: 'gh-1', v: 1 }` (no `e` field). Should return `{ ok: false, reason: 'invalid_payload_email' }`. Same for missing `t` or `ts`.

5. **Unsubscribe token rejected by verify-email**: Generate a token with `generateUnsubscribeToken` and pass it to `verifyEmailVerifyToken`. Must fail because the HMAC domain prefix is `unsub.` vs `emailverify.`. This is the domain separation test from the task description -- the test proves the two token families cannot cross-contaminate.

6. **Verify-email token rejected by unsubscribe**: The reverse direction. Generate with `generateEmailVerifyToken`, verify with `verifyUnsubscribeToken`. Must fail.

### POST handler edge cases (integration tests)

7. **Stale token after second email change**: User sets pending email to A, gets token for A, then changes pending email to B. Token for A should be rejected because `prefs.pendingEmail !== email` (line 427). This is the replay protection test.

8. **Token for non-existent tenant**: Token is validly signed but the tenant has no `notification_preferences` row. `getNotificationPreferences` returns null, so `!prefs` on line 427 triggers failure. Should render the failure page.

9. **POST with token in form body instead of query string**: The handler supports both `?token=` in the URL and `token=` in the form-urlencoded body (lines 370-380). Test the body path to ensure it works.

10. **POST with empty token (query param present but blank)**: `?token=` (empty string). Should render failure page, not crash.

11. **Double verification (POST same valid token twice)**: First POST succeeds and swaps the email. Second POST should fail because `pending_email` is now NULL after the swap, so `prefs.pendingEmail !== email` triggers.

### Resend handler edge cases (integration tests)

12. **Resend without pending email**: No prior PUT with an email address. Should return 400 per line 315.

13. **Resend without CSRF header**: Should return 403.

14. **Resend rate limit**: Two resend calls within 60 seconds. Second should return 429 with `Retry-After: 60`.

### GET handler edge cases

15. **GET with missing SESSION_SECRET**: The handler checks `env.SESSION_SECRET` on line 333. In a real deployment failure this would be undefined. This is probably not testable via SELF.fetch since vitest.config.js always binds it, but it is worth noting as a known untestable path. No test needed.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Rate limiter cross-contamination between test cases | Use the `ipCounter` pattern from `notifications.test.js` with a distinct range (e.g., start at 500). Each describe block or rate-limit-sensitive test uses `nextIp()`. |
| DB state leaking between tests | Use `beforeEach(cleanDb)` exactly as `notifications.test.js` does. |
| Token helper duplication between test file and source | Extract `toB64url` / HMAC-signing into a `test/token-helpers.js` if more than 3 tests craft tokens by hand. But given the existing pattern in `notifications.test.js` (inline helpers), keep it inline unless the implementor finds it unwieldy. |
| EMAIL_QUEUE assertions | The queue is a miniflare stub. Tests cannot directly inspect what was enqueued via SELF.fetch. For resend/PUT tests, assert the HTTP response shape (`verificationEmailSent: true`, `sent: true`) as the proxy for queue behavior. Do not try to read from the queue binding. |

## Dependencies

- `generateEmailVerifyToken` and `verifyEmailVerifyToken` must be exported from `src/email-verify.js` (they already are).
- `generateUnsubscribeToken` and `verifyUnsubscribeToken` must be importable for the cross-domain rejection tests (already exported from `src/unsubscribe.js`).
- `createTestSession` and `cleanDb` from `test/fixtures.js` (already available).
- The `createTosSession` helper pattern from `test/notifications.test.js` should be duplicated or extracted. Given KISS, duplicating the 5-line helper is fine.

## Estimated Test Count

- Token unit tests: ~10 (round-trip, expiry, boundary, tampered payload, tampered HMAC, malformed, empty, domain separation x2, version mismatch)
- GET handler integration: ~4 (valid token, invalid token, expired token, missing token)
- POST handler integration: ~7 (valid token swaps email, invalid token, expired token, stale token after second change, double verification, token in body, empty token)
- Resend integration: ~4 (happy path, no pending email, rate limit, missing CSRF)

Total: ~25 tests. All in one file, organized by describe blocks. Execution time should be well under 10 seconds given the miniflare-backed D1 pattern.
