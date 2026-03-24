## Delegation Plan

**Team name**: ui-fixes-batch
**Description**: Three small UI fixes shipped as a single phase: URL auto-prepend in capture form, verify page text correction, billing page CSS spacing.

### Task 1: URL auto-prepend, verify page text, and billing CSS fixes
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are making three small UI fixes in a single pass. All changes are scoped to client-side UI code only -- no server/API changes.

    ## Fix 1: URL auto-prepend in safeUrl() (issue #179)

    **File**: src/ui/ui-submit.js

    The safeUrl() function (lines 10-17) currently rejects bare hostnames like example.com because the URL constructor throws on them. Users expect to type example.com and have it work.

    **What to do:**

    1. Modify safeUrl() to try prepending "https://" when the initial URL parse throws AND the input does not contain "://". The "://" guard prevents mangling inputs like "htt://example.com" where the user intended a scheme but got it wrong. Structure:
       - First try: parse urlStr as-is. If protocol is http: or https:, return u.href.
       - Catch: if urlStr is truthy and does not include "://", try parsing "https://" + urlStr. If that succeeds and protocol is https:, return u2.href. Otherwise fall through.
       - Default: return null.

    2. In handleSubmit() (line 380, after validation succeeds and before submitBtn.disabled = true), add urlInput.value = safe; so the input briefly reflects the normalized URL before it clears on success. This gives the user immediate visual feedback of what was submitted.

    3. Update the error message on line 373 from "Enter a valid http:// or https:// URL." to "Enter a valid URL (e.g. example.com or https://example.com)." to reflect that bare hostnames are now accepted.

    **What NOT to do:**
    - Do NOT modify safeUrl() in src/ui/ui-detail.js or src/verify-page.js. Those are display validators for server-provided URLs that already have schemes. Changing them would mask API bugs.
    - Do NOT add a separate normalizeUrl() function. The logic belongs inline in safeUrl().

    ## Fix 2: Verify page text (issue #180)

    **File**: src/verify-page.js

    On line 344, replace "eIDAS Art. 41" with "eIDAS Article 41". This is the only occurrence. The CLI formatter (packages/verify/lib/format.js) has no "Art." references -- confirmed, no change needed there.

    ## Fix 3: Billing page spacing (issue #183)

    **File**: src/ui/ui-css.js

    The .billing-stat container (line 1504-1506) contains two span children: .billing-stat-value and .billing-stat-label. Spans are inline by default, so the margin-top: var(--space-1) on .billing-stat-label (line 1515) has no effect -- inline elements ignore vertical margins.

    **What to do:** Add "display: block;" to both the .billing-stat-value rule (after line 1511, before the closing bracket) and the .billing-stat-label rule (after line 1514, before margin-top). This makes the spans render as blocks, allowing the existing margin-top to create visible spacing.

    Do NOT use flexbox on the parent -- display: block on the children is the minimal fix.

    ## Constraints
    - This codebase uses var (not let/const) in the inline JS string constants (SUBMIT_VIEW_JS etc.) because the JS is embedded as template literal strings, not modules.
    - The code signature comment already exists at line 1 of ui-submit.js -- do not add another.
    - Follow the project's engineering philosophy: KISS, minimal changes, no over-engineering.

- **Deliverables**: Modified src/ui/ui-submit.js, modified src/verify-page.js, modified src/ui/ui-css.js
- **Success criteria**: safeUrl("example.com") returns "https://example.com/"; safeUrl("https://example.com") unchanged; safeUrl("htt://example.com") returns null; verify page shows "Article 41"; billing stat spans are block-level with visible spacing.

### Task 2: Tests for URL auto-prepend
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Create test/ui-submit.test.js with unit tests for the safeUrl() function in src/ui/ui-submit.js.

    ## Pattern to follow

    This project uses an evalFromSource() pattern to extract functions from JS string constants. See test/ui-billing.test.js for the exact pattern -- copy the evalFromSource helper from there and adapt it. Import SUBMIT_VIEW_JS from "../src/ui/ui-submit.js" and extract the safeUrl function.

    ## Test cases

    Write a single describe("safeUrl -- URL normalization") block with these cases:

    1. safeUrl("https://example.com") returns "https://example.com/" -- full https URL unchanged
    2. safeUrl("http://example.com") returns "http://example.com/" -- full http URL unchanged
    3. safeUrl("example.com") returns "https://example.com/" -- bare hostname gets https prepended
    4. safeUrl("example.com/page?q=1") returns "https://example.com/page?q=1" -- bare hostname with path
    5. safeUrl("htt://example.com") returns null -- has "://" so we don't "fix" it
    6. safeUrl("ftp://example.com") returns null -- wrong scheme
    7. safeUrl("javascript:alert(1)") returns null -- dangerous scheme
    8. safeUrl("") returns null -- empty string
    9. safeUrl("not a url at all") returns null -- gibberish (even with prepend, spaces make it invalid)

    Use the naming convention from ui-billing.test.js: prefix test names with a partition letter and number (e.g., A1:, A2:, etc.).

    ## Constraints
    - Import SUBMIT_VIEW_JS from "../src/ui/ui-submit.js"
    - File: test/ui-submit.test.js
    - Use vitest (describe, it, expect)
    - No DOM, no fetch, no document -- pure function tests only

- **Deliverables**: New test/ui-submit.test.js
- **Success criteria**: All 9 test cases pass with "npx vitest run test/ui-submit.test.js"

### Cross-Cutting Coverage

- **Testing**: Covered by Task 2 (new test file for safeUrl). Post-execution Phase 6 will run the full test suite.
- **Security**: Not needed. The URL auto-prepend does not create new attack surface -- it only adds "https://" to bare hostnames, and the server's validateUrl() remains the real security boundary. XSS via safeUrl is already guarded by protocol check (http: or https: only). javascript: scheme returns null.
- **Usability -- Strategy**: Not needed for this batch. These are bug fixes to existing UI elements, not new features or journey changes. The UX improvement (accepting bare hostnames) is well-established convention and was specified in the issue.
- **Usability -- Design**: Not applicable -- no new UI components or visual layouts. The billing fix restores intended spacing; the URL fix updates an error message.
- **Documentation**: Not needed. No API surface changes, no architectural changes. The fixes are self-explanatory from the code and issue descriptions.
- **Observability**: Not applicable -- all changes are client-side UI with no runtime services, logging, or metrics impact.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: none
  - ux-design-minion: No -- fixes restore intended behavior, no new UI components or interaction patterns
  - accessibility-minion: No -- no HTML structure changes; the billing fix adds display: block to spans (no accessibility impact); the error message update is an improvement
  - sitespeed-minion: No -- no new runtime code, assets, or pages
  - observability-minion: No -- client-side only, no services or APIs
  - user-docs-minion: No -- the changes are invisible to documentation (URL field now accepts bare hostnames, which is self-discoverable; the error message update is the documentation)
- **Not selected**:
  - ux-design-minion: Fixes restore intended behavior, no new visual design decisions
  - accessibility-minion: No HTML structure changes, no WCAG-relevant modifications
  - sitespeed-minion: No new pages, assets, or runtime code paths

### Decisions

- **Inline modification vs. separate normalizeUrl()**
  Chosen: Modify safeUrl() inline to include the prepend logic
  Over: Adding a separate normalizeUrl() called before safeUrl() in handleSubmit()
  Why: safeUrl() is a 7-line function with a single caller. Two coordinated functions would be more code with no additional clarity. The normalization is logically part of "parse this string as a safe URL."

- **display: block on children vs. flexbox on parent**
  Chosen: display: block on .billing-stat-value and .billing-stat-label spans
  Over: Adding display: flex; flex-direction: column; align-items: center to .billing-stat parent
  Why: The spans already have the right styling (font-size, margin-top) -- they just need to be blocks for those styles to work. Adding flexbox is overkill for two stacked elements and changes more properties than needed.

### Risks and Mitigations

1. **Auto-prepend on ambiguous input**: safeUrl("example") will try "https://example" which is technically a valid URL (no TLD required per WHATWG spec). The server's validateUrl() and SSRF protection will reject hostnames that don't resolve, so this is acceptable. The client form catches obvious syntax errors; hostname validity is the server's job.

2. **safeUrl() exists in 3 files**: Only ui-submit.js is modified. The safeUrl() in ui-detail.js and verify-page.js are display validators for server-provided data. Task 1 prompt explicitly forbids modifying them.

3. **No existing tests for ui-submit.js**: Task 2 creates the test file from scratch, following the established evalFromSource() pattern from ui-billing.test.js. Risk is low since the pattern is proven.

### Execution Order

```
Batch 1 (sequential):
  Task 1: Code changes (safeUrl, verify text, billing CSS)  [no gate]
  Task 2: Tests for safeUrl                                  [no gate, blocked by Task 1]

Post-execution:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (full suite)
```

### External Skills
No external skills detected in project.

### Verification Steps

1. Run "npx vitest run test/ui-submit.test.js" -- all 9 cases pass
2. Run "npx vitest run" -- full suite passes, no regressions
3. Manual spot-check: grep for "://" in safeUrl to confirm guard logic is present
4. Manual spot-check: grep for "Art." in src/verify-page.js returns zero results
5. Manual spot-check: grep for "display: block" in billing-stat CSS rules confirms both spans are block-level
