ADVISE

- [testing]: The existing stale-token test at line 343 does not exercise the new DB-level guard because the application-level cross-check (`prefs.pendingEmail !== email`) returns early before `swapVerifiedEmail()` is ever called — the new `AND pending_email = ?` WHERE clause is dead code from the test's perspective.
  SCOPE: `test/email-verify.test.js` — stale-token test + new direct unit test for `swapVerifiedEmail()`
  CHANGE: Add a direct unit test for `swapVerifiedEmail()` in `db.js` (or a new integration test case) that calls the function with a mismatched `expectedEmail` and asserts `{ ok: false }` is returned and the row is unchanged. This is the only way to verify the WHERE clause and bind order are correct.
  WHY: A bug in the new parameter bind (wrong position, wrong value) silently passes all existing tests because execution never reaches the SQL. The defense-in-depth guard could be broken at deploy time with no test signal.
  TASK: Task 1

- [testing]: The updated comment in the test correctly describes the new behavior, but it now implies the DB guard is exercised by this test — a reader will assume this test covers the fix when it does not.
  SCOPE: `test/email-verify.test.js` line 344 comment block
  CHANGE: Add a clarifying note in the comment that this test exercises the app-level check; a separate test exercises the DB-level guard directly.
  WHY: Misleading test comments cause future maintainers to remove the DB-level guard assuming it is redundant (because "the test passes" either way).
  TASK: Task 1
