## Advisory Report

**Question**: Should we add a collapsible "Verify independently" section to the verify page with a copy-to-clipboard npx command for the existing @w-r-l/verify CLI tool?

**Confidence**: HIGH

**Recommendation**: Yes -- add the section. All four specialists agree this is a well-scoped, low-risk addition that closes a real trust gap in the verify page. Implementation touches a single file (`src/verify-page.js`), requires no new dependencies, no server-side changes, and no CSP modifications. The section should be shown on both verified and failed pages, not just the success path.

### Executive Summary

The verify page currently shows the server's own verdict about its own capture. For most users, the green (or red) banner and the check list are sufficient. But technically literate users -- the audience that actually reads the "Cryptographic details" disclosure -- face a visible trust seam: the timestamp check is explicitly labeled "not verified cryptographically," and the page offers no path to close that gap. The `@w-r-l/verify` CLI tool does perform full timestamp chain validation, but it is discoverable only through the GitHub repo README. Surfacing a pre-populated `npx` command behind a `<details>` disclosure puts the tool where the trust question forms.

The feature has a clean security profile (both inputs are tightly constrained -- `captureId` by regex `cap_[a-f0-9]{32}`, `origin` by server derivation), uses well-established interaction patterns (native `<details>`, Clipboard API, ghost copy button), and requires approximately 30-40 lines of CSS and 30-40 lines of JS added to the existing inline template. The page already has two `<details>` disclosures; a third follows the same progressive-disclosure pattern with zero additional cognitive load for casual users.

The one substantive disagreement -- whether to show the section only on verification success or also on failure -- resolves clearly in favor of showing it in both states, based on the trust model analysis.

### Team Consensus

1. **"Verify independently" is the right summary text.** All specialists who evaluated naming agreed it communicates the benefit (independence from the server's verdict) rather than the mechanism (CLI tool). It creates a natural contrast with the server-side checks displayed above it.

2. **Placement: new `<details>` after "Cryptographic details", before footer.** Unanimous. The page's information architecture flows from high-level summary down through increasing specificity. "Run it yourself" is the most specific action and belongs at the bottom of that gradient. Nesting inside the crypto details `<details>` was explicitly rejected -- each disclosure on this page covers a single concern.

3. **Pre-populated `npx @w-r-l/verify {origin}/v1/captures/{captureId}` command.** Unanimous. The remote-capture syntax is the zero-configuration path. No flags, no pipes, no prior downloads. The command is constructed from variables already in scope (`origin`, `captureId`).

4. **Native `<button>` with Clipboard API, ghost visual treatment, icon swap to checkmark on success.** All specialists aligned on: `navigator.clipboard.writeText()` inside click handler, clipboard icon swapping to checkmark for 2 seconds, `aria-label="Copy command to clipboard"`, and a separate `<span aria-live="polite" role="status">` for screen reader feedback. No `aria-pressed`, no dynamic `aria-label` swaps (anti-pattern -- screen readers do not re-announce label changes).

5. **`textContent` rendering, never `innerHTML` for the command string.** Security-minion confirmed both inputs are safe (regex-validated hex and server-derived origin), and the existing codebase consistently uses `textContent` for dynamic content. Maintaining this discipline is the only security requirement.

6. **No server-side changes, no CSP changes, no new dependencies.** Unanimous. The Clipboard API is a browser API that works within the existing `script-src 'unsafe-inline'` policy. No `Permissions-Policy` header blocks it. The feature is entirely client-side, contained within `src/verify-page.js`.

7. **Brief explanatory text inside the disclosure.** Both ux-strategy-minion and accessibility-minion recommended a one-to-two sentence explanation of what the CLI adds beyond the page checks (specifically: timestamp certificate chain validation against a trusted root). This serves both cognitive accessibility (WCAG COGA) and the trust narrative.

8. **Graceful clipboard fallback.** On API failure: programmatically select the command text so the user can Ctrl+C/Cmd+C manually, and announce the fallback in the live region. Do not silently fail (per project's "fail loudly" principle). Do not show a modal or error toast.

### Dissenting Views

- **Show only on success vs. show on both outcomes**: ux-design-minion recommends rendering only when `verified === true`, arguing that showing the CLI on failure "adds confusion" because users might wonder if the CLI would give a different result. ux-strategy-minion recommends showing on both verified and failed pages, arguing that independent verification is MORE valuable on failure -- it can disambiguate "server-side issue" from "actual tampering," and hiding it on failure removes it from the exact moment where it matters most.

  **Resolution**: ux-strategy-minion's position is adopted. The trust model analysis is compelling: the four outcome permutations (page-pass/CLI-pass, page-fail/CLI-pass, page-fail/CLI-fail, page-pass/CLI-fail) all have distinct informational value, and three of the four are only reachable when the CLI is available on failure pages. The "confusion" concern is addressed by the explanatory text, which makes clear that the CLI runs the same checks plus additional timestamp validation -- users will understand that the tool is independent, not contradictory. The section should NOT render in the error state (when the API call itself fails and no verification data is available), since there is nothing meaningful to verify in that case.

### Supporting Evidence

#### UX Strategy

The verify page serves two jobs-to-be-done: (1) casual confirmation ("is this capture authentic?") and (2) cryptographic accountability ("can I prove this independently?"). The page currently serves only the first job. The CLI tool serves the second, but is discoverable only through the GitHub README. The `<details>` disclosure bridges this gap at exactly the right moment in the user journey -- after viewing the server's checks, when the natural next question is "but how do I check independently?" The progressive disclosure pattern ensures zero additional cognitive load for the 95%+ of users who never need this.

The explanatory text should acknowledge the trust architecture transparently. ux-strategy-minion's suggested framing: "This page verifies file integrity, bundle integrity, and the digital signature. The CLI tool additionally validates the timestamp certificate chain against a trusted root -- a check that cannot be performed in the browser." This gives technical users a concrete reason to run the command.

#### UX Design

The visual treatment follows the page's established design language precisely: `#f5f5f5` background for the code block (one step darker than page background), `1px solid #e0e0e0` border (matches `<main>` border), `4px` border-radius (matches screenshot), existing monospace stack from `.crypto-value`. The copy button is a ghost button (no border/background in rest state, subtle `rgba(0,0,0,0.06)` hover) positioned `absolute` in the top-right of the code block -- the universally established pattern from GitHub, MDN, and every documentation site.

Right padding on the `<pre>` (`2.75rem`) reserves space so command text never tucks under the button. `white-space: pre-wrap` with `word-break: break-all` handles long capture URLs on narrow viewports without horizontal scroll. The 44x44px effective touch target (32px icon + `0.5rem` padding) meets mobile usability requirements.

#### Security

The feature has a clean security profile. Both inputs are constrained: `captureId` matches `cap_[a-f0-9]{32}` (zero shell metacharacters), `origin` is derived from `new URL(request.url).origin` (server-controlled, not user-supplied). The output contexts (clipboard text, DOM textContent) do not interpret content as code or HTML. No new attack surface is introduced. The scoped npm namespace `@w-r-l/verify` mitigates typosquatting of the package name. The social engineering risk of displaying a `npx` command is acceptable because the command is simple, inspectable, contains no flags or pipes, and uses a scoped package.

#### Accessibility

The implementation requires: native `<button type="button">` (no custom ARIA roles), `aria-label="Copy command to clipboard"`, SVG icon with `aria-hidden="true"`, and a dedicated `<span class="copy-status sr-only" aria-live="polite" role="status">` that is present in the DOM at render time (not injected dynamically -- screen readers may not detect dynamically added live regions). The live region receives "Command copied to clipboard" on success and "Could not copy command. Select and copy it manually." on failure, then clears after 3-5 seconds.

The `<details>/<summary>` element provides built-in keyboard support (Enter/Space to toggle, automatic `aria-expanded` semantics). No custom ARIA is needed on the disclosure. The `<code>` block must not have `tabindex` (it is not interactive). Focus indicator follows the existing page pattern: `outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px`. Minimum 24x24px target size per WCAG 2.5.8, with 32px recommended.

Anti-patterns to avoid: do NOT swap `aria-label` dynamically on the button (screen readers will not re-announce), do NOT use `aria-pressed` (copy is a momentary action, not a toggle), do NOT use `role="tooltip"` for "Copied!" feedback, do NOT add `tabindex` to the code block.

### Risks and Caveats

1. **Command rot if `@w-r-l/verify` is renamed or unpublished.** The `npx` command will fail. Mitigate by constructing the package name in one place in the codebase, not as a scattered magic string. This is a standing maintenance concern, not a blocker.

2. **Node.js 20+ prerequisite limits the audience.** The command requires a Node.js installation. However, the target audience (technical users who expand the disclosure) is the same audience likely to have Node.js installed. The progressive disclosure pattern ensures this prerequisite does not confuse the wrong audience.

3. **Command length on narrow viewports (320px).** The full command with capture URL is 80-100 characters and wraps across 3-4 lines at 0.8rem monospace. This is acceptable inside a collapsed `<details>` for technical users, but should be tested at 320px to verify the copy button does not overlap wrapped text.

4. **Clipboard API permissions in corporate environments.** Some corporate browser policies disable clipboard access. The graceful fallback (text selection + live region announcement) handles this. Not a blocker.

### Next Steps

If the recommendation is adopted, implementation is a single-file change to `src/verify-page.js`:

1. **CSS additions** (~35 lines): `.cli-section` (the `<details>` wrapper), `.cli-desc` (explanatory text), `.cli-block` (code container with relative positioning), `.cli-block pre` / `.cli-block code` (monospace styling), `.cli-copy-btn` (ghost button with hover/focus states), `.cli-copy-btn:focus-visible`, `.cli-copied` (success icon state), `.copy-status` (sr-only live region). Plus `prefers-reduced-motion` override for the icon swap transition.

2. **SVG icon constants** (~2 lines): Add `SVG_CLIPBOARD` and `SVG_CHECK_SMALL` (16x16 variants) alongside existing `SVG_CHECK`, `SVG_X`, `SVG_DASH` declarations.

3. **HTML in `buildResult()`** (~15 lines): Insert the new `<details>` after the cryptographic details block. Gate on `verified !== undefined` (renders for both `true` and `false`, but not in error state). Include the empty `<span aria-live="polite" role="status">` in the template.

4. **Copy handler in `populate()`** (~30 lines): Wire up `navigator.clipboard.writeText()` with icon swap, live region text update, 2-second revert timeout, and fallback text selection on failure.

Estimated scope: ~80 lines of code added to a single file. No new files, no new dependencies, no server-side changes, no build changes.

### Conflict Resolutions

**Verified-only vs. always-show**: Resolved in favor of always-show (both `verified: true` and `verified: false`), excluding the error state. ux-strategy-minion's trust model analysis -- that independent verification has higher value on failure than on success -- is the decisive argument. The "confusion" concern raised by ux-design-minion is addressed by the explanatory text making the relationship between page checks and CLI checks explicit.

**Touch target size**: ux-design-minion specified 44x44px effective target (32px icon + padding), accessibility-minion specified 24x24px minimum (WCAG 2.5.8). These are compatible, not conflicting -- 44x44px exceeds the 24px minimum. The 44x44px target from ux-design-minion is adopted as the implementation target.

**Status message clear timeout**: ux-design-minion specified 2 seconds for the icon revert, accessibility-minion specified 3-5 seconds for the live region clear. These can coexist: the visual icon reverts at 2 seconds, the sr-only status text clears at 3 seconds. This gives screen readers slightly longer to announce while keeping the visual feedback snappy.
