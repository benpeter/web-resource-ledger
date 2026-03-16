You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Issue #58: Dual-screenshot cookie consent dismissal for captures. Add dual screenshot support with autoconsent integration.

## Your Planning Question
How should tests be structured for the dual-screenshot feature?
1. The existing `stubRenderer` pattern returns `{ screenshot, html, partial, render }` -- how should it evolve for two screenshots?
2. Should autoconsent detection/dismissal be mockable independently of the renderer?
3. What WACZ round-trip test changes are needed for dual-screenshot bundles?
4. Integration test strategy for consent flow?
5. What new test cases are needed for: both screenshots present, only before screenshot (autoconsent fails), partial captures (still no consent attempt)?
6. How should the verification page tests (test/verify-page.test.js) evolve for dual screenshot display?

## Context
Key files to read:
- `test/capture.test.js` -- the stubRenderer pattern, existing capture tests
- `test/wacz.test.js` -- WACZ round-trip tests
- `test/verify-page.test.js` and `test/verify-html.test.js` -- verification page tests
- `test/capture-integration.test.js` -- integration test patterns

## Instructions
1. Read the test files listed above
2. Design the test strategy aligning with code change structure
3. Identify specific test cases needed
4. Return your contribution in structured format
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-test-minion.md`
