You are making three small UI fixes in a single pass. All changes are scoped to client-side UI code only -- no server/API changes.

## Fix 1: URL auto-prepend in safeUrl() (issue #179)

**File**: src/ui/ui-submit.js

The safeUrl() function (lines 10-17) currently rejects bare hostnames like example.com because the URL constructor throws on them. Users expect to type example.com and have it work.

**What to do:**

1. Modify safeUrl() to try prepending "https://" when the initial URL parse throws AND the input does not contain "://". The "://" guard prevents mangling inputs like "htt://example.com" where the user intended a scheme but got it wrong. Structure:
   - First try: parse urlStr as-is. If protocol is http: or https:, return u.href.
   - Catch: if urlStr is truthy and does not include "://", try parsing "https://" + urlStr. If that succeeds and protocol is https:, return u2.href. Otherwise fall through.
   - Default: return null.

2. Update the error message from "Enter a valid http:// or https:// URL." to "Enter a valid URL (e.g. example.com or https://example.com)." to reflect that bare hostnames are now accepted.

3. Do NOT add urlInput.value = safe — per UX review, the field clears too fast for the update to be visible, creating a false affordance.

**What NOT to do:**
- Do NOT modify safeUrl() in src/ui/ui-detail.js or src/verify-page.js. Those are display validators for server-provided URLs that already have schemes.
- Do NOT add a separate normalizeUrl() function. The logic belongs inline in safeUrl().

## Fix 2: Verify page text (issue #180)

**File**: src/verify-page.js

On line 344, replace "eIDAS Art. 41" with "eIDAS Article 41". This is the only occurrence. The CLI formatter (packages/verify/lib/format.js) has no "Art." references -- no change needed there.

Also search for any other "Art." references in verify-page.js and replace with "Article" if found.

## Fix 3: Billing page spacing (issue #183)

**File**: src/ui/ui-css.js

The .billing-stat container contains two span children: .billing-stat-value and .billing-stat-label. Spans are inline by default, so the margin-top: var(--space-1) on .billing-stat-label has no effect.

**What to do:** Add "display: block;" to both the .billing-stat-value rule and the .billing-stat-label rule. This makes the spans render as blocks, allowing the existing margin-top to create visible spacing.

Do NOT use flexbox on the parent -- display: block on the children is the minimal fix.

## Constraints
- This codebase uses var (not let/const) in the inline JS string constants (SUBMIT_VIEW_JS etc.) because the JS is embedded as template literal strings, not modules.
- Follow the project's engineering philosophy: KISS, minimal changes, no over-engineering.

## Deliverables
Modified src/ui/ui-submit.js, modified src/verify-page.js, modified src/ui/ui-css.js

## Success criteria
safeUrl("example.com") returns "https://example.com/"; safeUrl("https://example.com") unchanged; safeUrl("htt://example.com") returns null; verify page shows "Article 41"; billing stat spans are block-level with visible spacing.