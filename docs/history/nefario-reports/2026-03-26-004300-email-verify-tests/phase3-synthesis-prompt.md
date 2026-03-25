MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Add tests for email verification flow (email-verify.js). Issue #199.

Phase 0080 (#195) added the email verification flow with `src/email-verify.js` (token module + GET/POST verification handlers) and the resend handler in `src/notifications.js`. The existing `test/notifications.test.js` was updated for the pending-email PUT behavior, but `email-verify.js` itself has no dedicated test file.

What needs testing:
1. Token generation/verification round-trip
2. Token expiry (reject tokens older than 24 hours)
3. Token replay protection (token for email A cannot verify email B)
4. Domain separation (unsubscribe tokens rejected by verify, and vice versa)
5. Tampered payload/HMAC rejection
6. GET /v1/notifications/verify-email — valid/invalid/expired/missing token
7. POST /v1/notifications/verify-email — valid token swaps pending_email to email atomically
8. POST /v1/account/notifications/resend-verification — session + CSRF, 429 cooldown, 400 no pending
9. Notification continuity — notifications continue to old email while verification is pending

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-DWNuqs/email-verify-tests/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-DWNuqs/email-verify-tests/phase2-security-minion.md

## Key consensus across specialists:

### test-minion
- Single test/email-verify.test.js with describe blocks (token unit, GET handler, POST handler, resend, continuity)
- Use backdated ts + real HMAC signing for expiry tests (proven pattern from notifications.test.js)
- Resend handler tests go in new file (group by feature, not URL prefix)
- ~25 tests total across 5 describe blocks

### security-minion
- Bidirectional domain separation tests are critical (all 3 cross-domain pairs)
- TOCTOU race condition in swapVerifiedEmail: recommends SQL fix (AND pending_email = ?) alongside tests
- Skip timing attack tests (platform guarantee)
- Test malformed token edge cases: "." (empty parts), multiple dots, valid-HMAC-but-non-JSON, missing fields
- Test no-email-logging via static source analysis

### Conflict: TOCTOU fix
security-minion recommends a code fix to `swapVerifiedEmail()` in `src/db.js`. The issue scope (#199) is tests only. Resolution options:
1. Include the fix as a small prerequisite task (defense in depth)
2. Write the test to document the gap, defer the fix to a follow-up issue
3. Skip the TOCTOU test entirely

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve the TOCTOU conflict
3. Create the final execution plan in structured format
4. This is a single-task plan: one test-minion agent writes test/email-verify.test.js
5. No approval gates needed (single file, easily reversible)
6. Keep it lean — this is a test file, not architecture
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-DWNuqs/email-verify-tests/phase3-synthesis.md
