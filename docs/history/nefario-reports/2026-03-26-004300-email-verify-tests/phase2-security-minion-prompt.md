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

## Your Planning Question
Review the token scheme's security properties in `src/email-verify.js` and identify test coverage gaps:

1. **Domain separation adequacy**: The token uses "emailverify." prefix vs "unsub." for unsubscribe tokens. Both use the same SESSION_SECRET. The existing unsubscribe tests verify that session cookies can't be used as unsubscribe tokens. What cross-domain tests are needed for email verification tokens? Should we test that an email verify token can't be used as an unsubscribe token AND vice versa?

2. **Race conditions**: The POST handler does a cross-check: `prefs.pendingEmail !== email`. Between reading prefs and calling `swapVerifiedEmail()`, the pending_email could theoretically change. Should we test this TOCTOU scenario, and if so, how within vitest-pool-workers (single-threaded)?

3. **Timing attack verification**: The code uses `crypto.subtle.verify` (timing-safe). Should we test that invalid signatures still take roughly the same time as valid ones, or is this a property of the platform that we trust?

4. **Token structure edge cases**: What malformed token inputs should we test beyond the obvious (missing dot, empty string)? Consider: multiple dots, very long tokens, unicode in base64url, null bytes, URL-encoded special characters.

5. **"No email logging" claim**: The source code header says "Email addresses are never logged." Should this be tested, and if so, how?

## Context
- Token format: {base64url(JSON payload)}.{base64url(HMAC-SHA256)}
- HMAC input: "emailverify.{base64url(payload)}" — domain-separated
- Payload: { t: tenantId, e: pendingEmail, ts: unix_seconds, v: 1 }
- Expiry: 24 hours from ts
- Both GET and POST return 200 for invalid/expired tokens (no information leakage)
- POST cross-checks token email against DB pending_email before swapping
- SESSION_SECRET in tests: 'deadbeef'.repeat(8) (from vitest.config.js)

## Instructions
1. Read the source files to understand the security properties
2. Apply your security expertise to identify test coverage gaps
3. Prioritize: which security tests are critical vs nice-to-have?
4. Return your contribution in the format specified
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-DWNuqs/email-verify-tests/phase2-security-minion.md`
