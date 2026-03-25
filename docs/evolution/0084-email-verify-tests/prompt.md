## Context

Phase 0080 (#195) added the email verification flow with `src/email-verify.js` (token module + GET/POST verification handlers) and the resend handler in `src/notifications.js`. The existing `test/notifications.test.js` was updated for the pending-email PUT behavior, but `email-verify.js` itself has no dedicated test file.

This was flagged during the Phase 3.5 architecture review by test-minion (9 test gaps identified) and confirmed during post-phase supervisor verification.

## What needs testing

1. **Token generation/verification round-trip** — generate then verify returns tenantId and email
2. **Token expiry** — reject tokens older than 24 hours (stale `ts` payload)
3. **Token replay protection** — token for email A cannot verify email B (email binding)
4. **Domain separation** — unsubscribe tokens rejected by verify, and vice versa
5. **Tampered payload/HMAC rejection**
6. **GET /v1/notifications/verify-email** — valid token renders confirmation page; invalid/expired/missing token renders error page; always returns 200
7. **POST /v1/notifications/verify-email** — valid token swaps pending_email to email atomically; invalid token shows error; email mismatch (pending_email changed since token issued) rejects
8. **POST /v1/account/notifications/resend-verification** — requires session + CSRF; returns 429 within 60s cooldown; returns 400 when no pending_email
9. **Notification continuity** — notifications continue to old email while verification is pending (validates the core pending-email design decision)

## Files involved

- `src/email-verify.js` — token functions + GET/POST handlers
- `src/notifications.js` — resend handler, PUT handler pending-email path
- `test/notifications.test.js` — existing tests (extend or create new file)
