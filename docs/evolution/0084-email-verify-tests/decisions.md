# Decisions — Phase 0084: Email Verify Tests

## File structure: single file vs split

**Chosen**: Single `test/email-verify.test.js` with 5 describe blocks
**Over**: Splitting unit tests and integration tests into separate files
**Why**: Matches the established pattern in `test/notifications.test.js` which mixes token unit tests with HTTP integration tests in one file. The verification flow is a single feature — splitting would scatter related tests.

## Resend tests location: new file vs existing

**Chosen**: Include resend-verification tests in `test/email-verify.test.js`
**Over**: Adding to existing `test/notifications.test.js`
**Why**: Both test-minion and security-minion agreed. The resend handler is functionally part of the verification flow, not the notification preferences CRUD. `notifications.test.js` is already 579 lines. Grouping by feature is more discoverable.

## Token expiry testing approach

**Chosen**: Craft tokens with manually backdated `ts` field, sign with real HMAC key
**Over**: Mocking `Date.now()` with `vi.useFakeTimers()`
**Why**: `Date.now()` mocking is unreliable across the workerd runtime boundary when using `SELF.fetch()`. The backdated-token approach is already proven in `test/notifications.test.js` lines 397-418.

## TOCTOU in swapVerifiedEmail: document vs fix

**Chosen**: Document the gap in a test comment, write stale-token test, defer SQL fix
**Over**: Including the `AND pending_email = ?` fix in this PR (security-minion recommendation)
**Why**: Issue #199 scope is explicitly tests only. The fix is a 2-line SQL change but mixing code fixes into a test PR muddies commit history. The existing cross-check catches the common case; the TOCTOU requires concurrent requests to exploit, extremely unlikely in single-tenant D1. Worth fixing separately.

## Static analysis "no email logging" test

**Chosen**: Skip
**Over**: Regex-based source scan test (security-minion recommendation)
**Why**: Regex scanning of source code for log patterns is fragile and produces false positives/negatives as code evolves. The privacy invariant is better enforced by code review convention.

## IP counter range

**Chosen**: Start at 500 with `10.0.5.x` subnet
**Over**: Reusing existing ranges
**Why**: Prevents rate limiter cross-contamination between test files. Each test file uses a distinct range (notifications.test.js uses 400/`10.0.4.x`).
