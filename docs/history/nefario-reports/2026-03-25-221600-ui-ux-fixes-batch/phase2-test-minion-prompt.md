You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

UI/UX fixes batch (GitHub #213): 4 small fixes.
1. Fix low-contrast Sign In button (CSS change in design-system.js or ui-css.js)
2. Fix duplicate billing status display (DOM change in ui-billing.js)
3. Add docs link to authenticated nav (DOM change in ui-auth.js)
4. Add operator notification on admin key creation (backend change in admin.js)

## Your Planning Question

What test coverage is needed for these fixes? The project has existing test files:
- `test/ui-billing.test.js` -- billing UI tests
- `test/ui-dashboard.test.js` -- dashboard/captures UI tests
- `test/admin-keys.test.js` -- admin key management tests

Are the existing test patterns sufficient, or do new test cases need to be designed? Specifically:
- For the billing status fix: does the existing billing test file cover the status display? Do we need a new test for the deduplication fix?
- For the admin notification: does admin-keys.test.js need a new test asserting the notification is fired?
- For the contrast fix and docs link: are these testable in the existing framework, or are they visual-only?

## Context Files to Read
- `test/ui-billing.test.js`
- `test/admin-keys.test.js`
- `test/ui-dashboard.test.js`
- `package.json` (test framework, scripts)

## Instructions
1. Read the relevant test files
2. Apply your testing expertise
3. Return your contribution with recommendations, proposed tasks, risks

Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase2-test-minion.md
