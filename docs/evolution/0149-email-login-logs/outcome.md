# Outcome

- `src/email-login.js`: both background catches log instead of discarding the error.
- Tests, red first (c2a9a71): `test/email-login.test.js`, a failing KV and a failing
  D1 each produce their event while the request still answers 202.
- `docs/operations/coralogix-events.md`: the two events.

## Backlog changes

None.
