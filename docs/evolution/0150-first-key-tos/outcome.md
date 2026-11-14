# Outcome

- `src/index.js`: the terms gate exempts only `/v1/account/tos`.
- Tests, red first (dcbed30): `test/first-key.test.js` "answers 403 until the terms are
  accepted, and keeps the key"; the existing first-key tests now sign in with accepted
  terms (`createTosSession`, as in `test/account-usage.test.js`).
- `docs/INTERNALS.md` (auth values), `site/content/security/whitepaper.md` (sign-in
  sequence), CHANGELOG (Unreleased, Security).

## Backlog changes

None.
