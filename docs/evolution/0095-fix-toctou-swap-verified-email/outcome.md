# Outcome: Fix TOCTOU gap in swapVerifiedEmail()

## Summary

Closed the TOCTOU race condition in `swapVerifiedEmail()` by replacing
`AND pending_email IS NOT NULL` with `AND pending_email = ?` in the SQL
WHERE clause. The expected email is passed from the caller (sourced from
the HMAC-verified token payload). Added two direct unit tests exercising
the DB-level guard.

## Changes

| File | Change |
|------|--------|
| `src/db.js` | Added `expectedEmail` parameter, updated WHERE clause and bind, updated JSDoc |
| `src/email-verify.js` | Pass `email` as third argument to `swapVerifiedEmail()` |
| `test/email-verify.test.js` | Updated TOCTOU comment, added `swapVerifiedEmail` import, added 2 direct unit tests |

## Test Results

- 1636 passed, 2 skipped (pre-existing), 0 failed
- New tests: `swapVerifiedEmail -- TOCTOU guard` (2 tests)
  - Rejects swap when expectedEmail does not match pending_email
  - Succeeds when expectedEmail matches pending_email

## Surface Consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — no API contract changes (same endpoints, same responses) |
| Docs site | No update needed — internal DB function change, not user-visible |
| Landing page | No update needed — no feature or pricing changes |
| MCP server | No update needed — no endpoint changes |
| Legal pages | No update needed — no new data collection or third-party services |

## Backlog Changes

No backlog changes. The item was already tracked as issue #222 and is now
resolved by this PR.
