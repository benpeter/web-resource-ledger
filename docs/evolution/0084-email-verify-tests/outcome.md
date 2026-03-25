# Outcome — Phase 0084: Email Verify Tests

## What was produced

`test/email-verify.test.js` — 31 tests across 5 describe blocks covering the full email verification flow:

| Block | Tests | Coverage |
|-------|-------|----------|
| Token generation and verification | 14 | Round-trip, expiry boundary, tampered payload/HMAC, 3 domain separation pairs, version mismatch, missing fields, malformed inputs |
| GET /v1/notifications/verify-email | 5 | Valid token, invalid token, expired token, missing token, no-DB-mutation |
| POST /v1/notifications/verify-email | 7 | Happy path (DB swap verified), invalid, expired, stale token, double verification, token in form body, empty token |
| POST /v1/account/notifications/resend-verification | 4 | Happy path, no pending email, rate limit (429), missing CSRF |
| Notification continuity | 1 | Old email stays active during pending, switches after verification |

## What changed

- **New file**: `test/email-verify.test.js` (351 lines, 31 tests)
- **TOCTOU issue created**: #222 — tracks the `swapVerifiedEmail()` WHERE clause fix identified by security-minion
- **No production code modified**

## Test results

- `npx vitest run test/email-verify.test.js`: 31/31 pass
- Full suite: 61 files, 1561 tests pass, 2 skipped, 0 failures

## Surprises

- The resend rate limit test required backdating `verification_sent_at` between two PUT calls to avoid the 60-second rate limiter blocking the second PUT that changes the pending email. Not obvious from the issue description.

## Surface consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — no new/changed endpoints |
| Docs site | No update needed — no new features or behavior changes |
| Landing page | No update needed — no pricing/capability changes |
| MCP server | No update needed — no new API endpoints |
| Legal pages | No update needed — no new data collection or services |

## Backlog changes

- Issue #199 resolved (this PR)
- Issue #222 created (TOCTOU fix for swapVerifiedEmail, deferred from this phase)
