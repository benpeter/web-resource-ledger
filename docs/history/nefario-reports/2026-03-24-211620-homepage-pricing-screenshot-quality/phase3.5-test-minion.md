## Verdict: APPROVE

The verification strategy is appropriate for the scope of this change.

**Rationale:**

The three changed files have no unit test coverage and none is warranted:
- `landing/public/index.html` and `landing/public/css/landing.css` are static presentational assets. The project has no HTML/CSS test tooling and adding snapshot tests for a one-time content update would cost more than it protects.
- `src/capture.js` `deviceScaleFactor` is a single constant inside `defaultRenderer`. The existing unit tests (`responses.test.js`, `url-validation.test.js`, `signing.test.js`, `canonical-json.test.js`) do not import or exercise `capture.js`, so they provide no regression surface for this change — and that is fine, because the constant's effect is only observable end-to-end against a real browser binding.

The plan's verification steps (manual visual inspection + `grep` for removed strings + run existing test suite) are the right approach. The existing E2E suite (`capture-verify.spec.js`) will exercise `deviceScaleFactor: 4` through the real capture path on staging, which is the only meaningful test for that constant per the project's own philosophy ("test the real boundaries").

No missing edge cases from a test-strategy perspective.
