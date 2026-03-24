You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Batch of three small UI fixes shipped as a single phase:

1. **URL auto-prepend** (#179): Add `https://` to bare hostnames in the capture form's `safeUrl()` helper (`src/ui/ui-submit.js`), plus tests.
2. **Verify page text** (#180): Replace "Art." with "Article" in the eIDAS reference on the verify page (`src/verify-page.js` line 344). The CLI formatter (`packages/verify/lib/format.js`) has no "Art." references -- no change needed there.
3. **Billing page spacing** (#183): The `.billing-stat` CSS lacks spacing between value and label spans. Fix in `src/ui/ui-css.js` around line 1504.

## Your Planning Question
The `safeUrl()` function in `ui-submit.js` currently rejects bare hostnames (no scheme). The fix should auto-prepend `https://` when no scheme is present, but leave `http://` and `https://` URLs untouched, and not "fix" partial schemes like `htt://`. What is the cleanest approach -- modify `safeUrl()` to try prepending before failing, or add a separate `normalizeUrl()` step before `safeUrl()` in `handleSubmit()`? Should the input field visually update to show the normalized URL, or should normalization be silent? Consider that the server-side SSRF boundary (`url-validation.js`) expects a full URL with scheme -- client-side normalization must produce valid input for that.

## Context
Read these files for context:
- `src/ui/ui-submit.js` (especially `safeUrl()` and `handleSubmit()`)
- `src/url-validation.js` (server-side expectations)
- `src/verify-page.js` (line ~344 for "Art." reference)
- `src/ui/ui-css.js` (line ~1504 for billing stat CSS)
- `packages/verify/lib/format.js` (confirm no "Art." references)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: frontend-minion

### Recommendations
Your expert recommendations for this aspect of the task

### Proposed Tasks
Specific tasks that should be in the execution plan.
For each task: what to do, deliverables, dependencies

### Risks and Concerns
Things that could go wrong from your domain perspective

### Additional Agents Needed
Any specialists not yet involved who should be, and why
(or "None" if the current team is sufficient)

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Ua2lf1/ui-fixes-url-prepend-verify-text-billing-spacing/phase2-frontend-minion.md`