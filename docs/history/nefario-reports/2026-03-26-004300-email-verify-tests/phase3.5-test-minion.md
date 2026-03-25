# test-minion Review

**Verdict: APPROVE**

## Coverage Assessment

All 9 scenarios from the issue are addressed:

1. Token generation/verification round-trip -- covered (describe block 1, round-trip test)
2. Token expiry -- covered (>24h test + boundary at exactly 24h)
3. Token replay protection / email binding -- covered (stale token test in POST block)
4. Domain separation -- covered (3 tests: unsubscribe->verify, verify->unsubscribe, session->verify)
5. Tampered payload/HMAC rejection -- covered (2 dedicated unit tests)
6. GET handler -- covered (valid, invalid, expired, missing token; no-DB-mutation assertion)
7. POST handler -- covered (happy path, invalid, expired, stale, double-verify, form body, empty token)
8. Resend endpoint -- covered (happy path, no-pending-email 400, rate-limit 429, missing CSRF 403)
9. Notification continuity -- covered (describe block 5)

Total: ~26 tests, modestly above the 25 estimate. Acceptable.

## Test Design

The plan is grounded in the real source code. Specific checks:

- Boundary condition (exactly 24h): plan's assertion (`{ ok: true }`) is correct. `email-verify.js` line 176 uses `> 86400`, not `>=`, so `ts = now - 86400` is not expired.
- "Dot-only token": payload and HMAC are both empty strings; the `!payloadB64 || !hmacB64` guard at line 126 fires before HMAC verification. Returns `malformed_token`. Correct.
- Version mismatch (`v: 2`): the `parsed.v !== 1` check at line 155 fires after HMAC validation. Requires a validly-signed token. The plan correctly instructs inline HMAC crafting for this case.
- Missing `e` field: hits `invalid_payload_email` at line 167, not `invalid_payload_version` (because `v: 1` is present). Correct.
- Double-verification: second POST finds `pending_email = NULL`, so `prefs.pendingEmail !== email` fires at line 427. Returns failure page. Correct.

## Patterns and Conventions

The plan correctly adopts all conventions from `test/notifications.test.js`:
- `SELF.fetch` for integration, direct function calls for unit
- `beforeEach(cleanDb)` for isolation
- Distinct IP range (`10.0.5.x`, starting at 500) -- no collision with the existing `10.0.4.x` range
- Inline HMAC crafting (no extraction) -- consistent with existing codebase pattern
- Duplicate `createTosSession` helper -- acceptable at this scale

## Minor Observations (non-blocking)

1. **Form body test -- example code gap**: The prompt shows the `POST verify-email` fetch pattern using `?token=` in the URL, but the form-body test specifically tests the case where the token is absent from the query string and sent in the body instead. The implementing agent will need to construct the fetch call with `body: new URLSearchParams({token})` and `Content-Type: application/x-www-form-urlencoded` without the query param. The description is clear enough that a competent agent will get this right, but the example code omits it. Not a blocker.

2. **GET no-DB-mutation assertion**: The plan says "read prefs before and after, assert identical" but the test setup requires a tenant with `pending_email` set (otherwise there is no prefs row to compare). The implementing agent should set up a complete tenant before the before/after comparison. This is derivable from the context but worth noting.

3. **TOCTOU documentation placement**: The comment is to be placed in the test file. This is appropriate -- a test comment that documents a known gap is a reasonable record until the fix PR is opened.

These are implementation details the agent can handle without guidance. No changes to the plan are required.
