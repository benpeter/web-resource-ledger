MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
Batch of three small UI fixes shipped as a single phase:

1. **URL auto-prepend** (#179): Add `https://` to bare hostnames in the capture form's `safeUrl()` helper (`src/ui/ui-submit.js`), plus tests.
2. **Verify page text** (#180): Replace "Art." with "Article" in the eIDAS reference on the verify page (`src/verify-page.js` line 344). The CLI formatter (`packages/verify/lib/format.js`) has no "Art." references -- no change needed there.
3. **Billing page spacing** (#183): The `.billing-stat` CSS lacks spacing between value and label spans. Fix in `src/ui/ui-css.js` around line 1504.

Success criteria:
- Entering `example.com` in capture URL field submits `https://example.com`
- Entering `https://example.com` or `http://example.com` is unchanged
- All "Art." references on verify page replaced with "Article"
- Billing page shows space between numbers and units
- No regressions on other pages
- Existing tests pass; add/update tests for URL prepend logic

Scope: UI URL input normalization, verify page text, billing page CSS
Out: API-level URL normalization, i18n infrastructure, billing logic changes

## Specialist Contributions

Read the following scratch file for the full specialist contribution:
/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Ua2lf1/ui-fixes-url-prepend-verify-text-billing-spacing/phase2-frontend-minion.md

## Key consensus across specialists:

## Summary: frontend-minion
Phase: planning
Recommendation: Modify `safeUrl()` inline with `!urlStr.includes('://')` guard; update input value to show normalized URL; add `display: block` to billing stat spans; single string replacement for verify page.
Tasks: 4 -- Modify safeUrl() in ui-submit.js; Create test/ui-submit.test.js with 9 test cases; Replace "Art. 41" with "Article 41" in verify-page.js; Add display:block to billing stat value/label spans
Risks: Auto-prepend could mask typos (server catches); safeUrl() exists in 3 files, only modify ui-submit.js; no existing test file for ui-submit.js
Conflicts: none

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. If external skills were discovered, include them in the execution plan:
   - ORCHESTRATION skills: create DEFERRED macro-tasks (see Core Knowledge)
   - LEAF skills: list in the Available Skills section of relevant task prompts
   - Apply precedence rules when skills overlap with internal specialists
7. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Ua2lf1/ui-fixes-url-prepend-verify-text-billing-spacing/phase3-synthesis.md`