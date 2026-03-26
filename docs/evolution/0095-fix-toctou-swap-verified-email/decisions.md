# Decisions: Fix TOCTOU gap in swapVerifiedEmail()

## D1: Replace `IS NOT NULL` with `= ?` (not add both)

- **Chosen**: Replace `AND pending_email IS NOT NULL` with `AND pending_email = ?`
- **Over**: Adding `AND pending_email = ?` alongside `IS NOT NULL`
- **Why**: In SQL, `NULL != any_value` evaluates to NULL (falsy), so
  `pending_email = ?` implicitly excludes NULL rows. The `IS NOT NULL` check
  becomes redundant. Keeping both would add visual noise with no behavioral
  difference.

## D2: Add direct unit test for DB-level guard

- **Chosen**: Add a new `describe` block with two direct tests calling
  `swapVerifiedEmail()` — one with wrong email (rejects), one with correct
  email (succeeds)
- **Over**: Only updating the comment in the existing stale-token test
- **Why**: test-minion advisory identified that the existing integration test
  never actually exercises the DB-level WHERE clause (the app-level
  cross-check rejects first). Without a direct test, a bind-order bug or
  SQL typo would pass all tests silently.

## D3: Source expectedEmail from token, not from request

- **Chosen**: Pass `email` (from HMAC-verified token payload) to
  `swapVerifiedEmail()` at the call site
- **Why**: The `email` at line 407 of `email-verify.js` comes from
  `verifyEmailVerifyToken()`, which validates HMAC-SHA256 before decoding.
  This ensures the expectedEmail cannot be attacker-supplied. security-minion
  confirmed this sourcing is correct.
