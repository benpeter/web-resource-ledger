# Margo Review: Fix TOCTOU gap in swapVerifiedEmail()

## Verdict: APPROVE

This is a textbook minimal fix. The entire plan changes:

- One SQL WHERE clause (replacing `AND pending_email IS NOT NULL` with `AND pending_email = ?`)
- One `.bind()` call (adding the expected email parameter)
- One caller (passing the already-in-scope `email` variable)
- One JSDoc line
- One comment block

**Complexity cost**: zero new abstractions, zero new dependencies, zero new files, zero new concepts. The function signature gains one parameter that narrows the existing behavior. The SQL change is actually simpler to reason about (`pending_email = ?` is more specific than `IS NOT NULL`).

**YAGNI check**: nothing speculative here. No new error types, no new retry logic, no new validation layers. The plan correctly avoids adding a dedicated TOCTOU integration test (the existing test covers the scenario, and the DB-level guard is defense-in-depth).

**Proportionality**: a security race condition fix that touches three lines of logic across two files. Proportional to the risk.

No concerns.
