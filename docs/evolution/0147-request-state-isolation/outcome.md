# Outcome

- `src/index.js`: `env = Object.create(env)` at the top of `fetch()`.
- Tests, red first (596346b): `test/capture-retrieval.test.js` "auth does not carry
  over to the next request" (three tests).
- `docs/INTERNALS.md` (request auth context), CHANGELOG (Unreleased, Security).

## Backlog changes

- benpeter/wrl-backlog#85 (vitest 4): commented; the env sharing in pool-workers 0.13+
  was hiding this bug, and the migration continues on top of the fix.
