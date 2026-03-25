You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Add tests for email verification flow (email-verify.js).

Phase 0080 (#195) added the email verification flow with `src/email-verify.js` (token module + GET/POST verification handlers) and the resend handler in `src/notifications.js`. The existing `test/notifications.test.js` was updated for the pending-email PUT behavior, but `email-verify.js` itself has no dedicated test file.

What needs testing:
1. Token generation/verification round-trip
2. Token expiry (reject tokens older than 24 hours)
3. Token replay protection (token for email A cannot verify email B)
4. Domain separation (unsubscribe tokens rejected by verify, and vice versa)
5. Tampered payload/HMAC rejection
6. GET /v1/notifications/verify-email — valid/invalid/expired/missing token renders correct page; always returns 200
7. POST /v1/notifications/verify-email — valid token swaps pending_email to email atomically; invalid token shows error; email mismatch rejects
8. POST /v1/account/notifications/resend-verification — requires session + CSRF; returns 429 within 60s cooldown; returns 400 when no pending_email
9. Notification continuity — notifications continue to old email while verification is pending

Files involved:
- `src/email-verify.js` — token functions + GET/POST handlers
- `src/notifications.js` — resend handler, PUT handler pending-email path
- `test/notifications.test.js` — existing tests (extend or create new file)

## Your Planning Question
1. Should we create a single `test/email-verify.test.js` or split unit-level token tests from integration-level HTTP handler tests? The existing `test/notifications.test.js` mixes both unit tests (unsubscribe token generation/verification) and integration tests (HTTP endpoint behavior). Should the new file follow the same pattern?

2. The token expiry test needs to verify rejection of tokens older than 24 hours. In the vitest-pool-workers environment with miniflare, how should we handle time manipulation? Options: (a) construct a token with a manually backdated `ts` field and sign it with the real HMAC key, (b) mock Date.now(), (c) other approach. What's the most reliable and maintainable approach?

3. Where should the resend-verification endpoint tests live — in the new `test/email-verify.test.js` (groups all verification-related tests together) or in the existing `test/notifications.test.js` (groups by router path /v1/account/notifications/*)?

4. What edge cases beyond the 9 listed scenarios should we consider? Look at the source code in `src/email-verify.js` and `src/notifications.js` for boundary conditions.

## Context
- Test framework: vitest with @cloudflare/vitest-pool-workers
- Integration tests use SELF.fetch() — requests go through the real worker
- D1 is real (miniflare-backed)
- Session auth via createTestSession() from test/fixtures.js
- IP counter pattern for rate-limit isolation (see test/notifications.test.js)
- SESSION_SECRET in tests: 'deadbeef'.repeat(8) (from vitest.config.js)
- Existing unsubscribe token tests in test/notifications.test.js show the pattern for token unit tests
- The project follows the Helix Manifesto: KISS, YAGNI, lean and mean

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the format specified
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-DWNuqs/email-verify-tests/phase2-test-minion.md`
