# Meta-Plan: Email Verification Tests

## Task Summary

Add a dedicated test file for `src/email-verify.js` covering token generation/verification round-trips, expiry, replay protection, domain separation, tampered payload rejection, and the GET/POST HTTP handlers. Also cover the resend-verification handler in `src/notifications.js` and notification continuity during pending verification.

## Planning Consultations

### Consultation 1: Test Strategy for Email Verification

- **Agent**: test-minion
- **Planning question**: Given the existing test patterns in this Cloudflare Workers project (vitest + `@cloudflare/vitest-pool-workers`, `SELF.fetch()` integration tests, D1-backed miniflare, shared fixtures in `test/fixtures.js`), what is the optimal test structure for `email-verify.js`? Specifically: (a) Should token unit tests (generate/verify round-trip, expiry, tamper, domain separation) live in the same file as the HTTP handler integration tests, or separate files? (b) The existing `test/notifications.test.js` already covers the PUT handler's pending-email behavior and unsubscribe tokens -- should the resend-verification tests go in the existing file or the new `email-verify.test.js`? (c) How should token expiry be tested without real 24-hour waits -- the codebase uses `Date.now()` directly in `verifyEmailVerifyToken`, so what mocking approach works within the vitest-pool-workers environment? (d) What edge cases should be prioritized beyond the 9 items already listed in the task?
- **Context to provide**: `src/email-verify.js` (full file), `test/notifications.test.js` (existing patterns, especially unsubscribe token tests at lines 332-428 which are structurally identical), `test/fixtures.js` (session helpers, cleanDb), `vitest.config.js` (miniflare bindings, SESSION_SECRET = `'deadbeef'.repeat(8)`).
- **Why this agent**: test-minion can evaluate whether the task's 9 test scenarios are complete, recommend file organization that matches project conventions, and identify the right mocking strategy for time-dependent token expiry within the Workers test runtime.

### Consultation 2: Security Review of Token Test Coverage

- **Agent**: security-minion
- **Planning question**: Review the email verification token scheme in `email-verify.js` and the proposed test scenarios. Are there security-critical edge cases not covered by the 9 items listed? Specifically: (a) Is the domain separation between `emailverify.` and `unsub.` prefixes adequately testable with the proposed cross-domain rejection test? (b) Does the POST handler's cross-check of `result.email` against `prefs.pendingEmail` have race condition risks that should be tested? (c) Are there timing attack vectors that the test suite should verify are mitigated (the code uses `crypto.subtle.verify` which is timing-safe, but should tests assert this property)? (d) Should we test that email addresses are never logged (the code comments claim this)?
- **Context to provide**: `src/email-verify.js` (full file, especially the security notes in the header comment and the POST handler's cross-check logic), `src/unsubscribe.js` (for domain separation comparison).
- **Why this agent**: The email verification flow handles authentication tokens and PII (email addresses). Security-minion can identify gaps in the proposed test coverage that could leave vulnerabilities undetected.

### Cross-Cutting Checklist

- **Testing**: INCLUDED -- test-minion is the primary planning consultant (Consultation 1). This task is entirely about testing.
- **Security**: INCLUDED -- security-minion reviews token test coverage for gaps (Consultation 2). Email verification is an authentication-adjacent flow with PII handling.
- **Usability -- Strategy**: NOT INCLUDED -- this task adds tests for an existing, shipped feature. No user journey or UX changes. The verification flow UX was reviewed during Phase 0080.
- **Usability -- Design**: NOT INCLUDED -- no UI changes. Tests only exercise existing HTML rendering functions.
- **Documentation**: NOT INCLUDED -- test files are self-documenting. The source file header already references `test/email-verify.test.js` (line 33). No API surface changes.
- **Observability**: NOT INCLUDED -- no runtime components being added or changed. Tests verify existing log calls but don't introduce new observability.

### Notable Exclusions

- **ux-strategy-minion**: Pure test-authoring task for an already-shipped feature; no user journey changes to review.
- **software-docs-minion**: Test files don't require architecture documentation updates; the source file already cross-references the test file.
- **debugger-minion**: No bugs to diagnose; this is greenfield test coverage for working code.

### Anticipated Approval Gates

None. This task produces a single test file (possibly extending an existing one) with no architectural decisions, no API contracts, and no downstream dependents. All test scenarios are already specified in the task description. File organization is the only judgment call, and it is easily reversible.

### Rationale

This is a focused test-authoring task for a security-sensitive module (email verification tokens). Two specialists are needed for planning:

1. **test-minion** because the project has specific testing conventions (vitest-pool-workers, SELF.fetch integration tests, shared fixtures, IP counter pattern for rate-limit isolation) that the test file must follow, and the time-dependent token expiry needs a mocking strategy compatible with the Workers runtime.

2. **security-minion** because the module handles HMAC-signed tokens with domain separation, PII (email addresses), and has explicit security properties documented in the source (timing-safe verification, no email logging, stale token replay prevention). The test suite should verify these security properties, not just functional correctness.

### Scope

**In scope:**
- New test file `test/email-verify.test.js` with unit tests for `generateEmailVerifyToken` / `verifyEmailVerifyToken`
- Integration tests for GET/POST `/v1/notifications/verify-email` handlers
- Tests for `handleResendVerification` in `src/notifications.js` (may go in existing `test/notifications.test.js` or new file)
- Token expiry, replay, domain separation, and tamper resistance tests

**Out of scope:**
- Changes to source code (`src/email-verify.js`, `src/notifications.js`)
- Changes to existing tests in `test/notifications.test.js` (unless extending with resend tests)
- Email template rendering tests (covered by `test/email-templates.test.js`)
- Email dispatch/queue tests (covered by `test/email-dispatch.test.js`)

### External Skill Integration

#### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | Operations/admin procedures | Not relevant -- operational runbook for tenant management, not test authoring |

#### Precedence Decisions

No precedence conflicts. The ops-runbook skill covers operational procedures and has no overlap with test authoring.
