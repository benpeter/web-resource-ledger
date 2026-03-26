Fix TOCTOU gap in swapVerifiedEmail() WHERE clause (#222)

During Phase 0084 (#199) architecture review, security-minion identified a
TOCTOU (time-of-check-time-of-use) gap in `swapVerifiedEmail()` in `src/db.js`.

`swapVerifiedEmail()` executes an UPDATE without constraining `pending_email`
to the expected value. If `pending_email` changes between the cross-check in
the POST handler and the swap, the wrong email gets promoted.

Fix: Add `AND pending_email = ?` to the WHERE clause and pass the expected
email as a parameter. Return `{ ok: false }` if no rows were updated.
