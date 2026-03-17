# Domain Plan Contribution: UX Design -- Verify Page "Verify Independently" Section

## Recommendations

### 1. Placement: New `<details>` Section After "Cryptographic details"

The section should be a standalone `<details>` element positioned **between "Cryptographic details" and the footer**. Rationale:

- It belongs with the "trust verification" cluster of content (crypto details, signature checks) but is a distinct action, not a sub-detail of the cryptographic values. Nesting it inside "Cryptographic details" would bury it behind two disclosure levels and conflate "inspect the evidence" with "reproduce the verification."
- Placing it last in the `<main>` content flow (just above footer) means it never pushes higher-priority content down. Casual users -- the majority -- never see it. Power users scanning for "what else can I do" will naturally reach it.
- The page's existing information architecture flows from high-level summary (status banner) down through increasing specificity. "Do it yourself on your machine" is the most specific action and belongs at the bottom of that gradient.

Do **not** place it inside the crypto details `<details>` or the capture details `<details>`. Each `<details>` on this page covers a single concern. Adding a second concern inside one of them breaks that pattern.

### 2. Visual Treatment of the Code Block

**Summary line:**
```
Verify independently
```
Use the existing `<summary>` style: `font-size: 0.875rem`, `font-weight: 600`, `color: #444`. No icon in the summary -- the disclosure triangle is sufficient, matching the existing "Capture details" and "Cryptographic details" sections.

**Explanatory text (inside, above the code block):**
One sentence of context: "Run this command in your terminal to verify the capture archive independently using the WRL CLI."
Style as `font-size: 0.8rem; color: #6d6d6d; margin-bottom: 0.75rem;` -- matching `.check-desc` / `.crypto-label` secondary text.

**Code block container:**
- Background: `#f5f5f5` -- a half-step darker than the page background (`#f8f8f8`) but lighter than borders. This is the standard "code block" shading convention users recognize instantly.
- Border: `1px solid #e0e0e0` -- matches `.screenshot-img` border and the `<main>` border.
- Border-radius: `4px` -- matches screenshot border-radius.
- Padding: `0.75rem 2.75rem 0.75rem 0.875rem` -- left padding gives breathing room; right padding reserves space for the copy button so the command text never tucks under it.
- The code block is a `<pre>` wrapping a `<code>` element. The `<code>` content is the npx command with the full capture URL pre-filled.
- Font: use the existing `.crypto-value` monospace stack: `"SF Mono", "Fira Code", Menlo, Consolas, monospace` at `font-size: 0.8rem`.
- `word-break: break-all` on the `<code>` to handle long capture URLs on narrow viewports. Since the URL is the longest segment and it already word-breaks throughout the page (see `.meta-url`, `.crypto-value`), this is consistent.
- `white-space: pre-wrap` so the command wraps rather than horizontally scrolling. Horizontal scroll inside a small container on mobile is hostile UX -- users may not discover the scrollable area and will copy an incomplete command.
- `overflow-x: hidden` -- there is no scenario where horizontal scroll should appear.

**Container relationship:**
The code block sits inside the `<details>` element, which already has `padding: 1.5rem 2rem` (or `1.25rem` on mobile). The code block itself adds its own padding, creating a visually distinct inset region that reads as "this is something you copy" without needing a separate card frame.

### 3. Copy Button: Placement, Icon, and Interaction

**Placement:**
- A `<button>` element positioned `absolute` in the top-right corner of the code block container (the `<pre>` or a wrapper `<div>` with `position: relative`).
- Offset: `top: 0.5rem; right: 0.5rem`.
- This is the universally established pattern for code-block copy buttons (GitHub, MDN, every documentation site). Users will look for it here without instruction.

**Icon:**
- A small clipboard SVG icon, 16x16px, rendered inline. The icon doubles as the button's visual affordance.
- Use `currentColor` fill, colored `#6d6d6d` (matching secondary text), transitioning to `#1a1a1a` on hover.
- The button itself is 32x32px minimum tap target (padded with `padding: 0.5rem`) for a 44x44px effective touch target including the padding. The visual icon stays small; the hit area is generous.
- No visible border or background in default state -- a "ghost" button. On hover: `background: rgba(0,0,0,0.06); border-radius: 4px` for a subtle highlight.
- `cursor: pointer` on hover.
- Include an `aria-label="Copy command to clipboard"` since the button has no visible text.

**Focus indicator:**
- `outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px` -- matching the existing `:focus-visible` style used throughout the page (see `.meta-url a:focus-visible`, `summary:focus-visible`).

**Copy interaction:**
1. On click, call `navigator.clipboard.writeText(commandText)`.
2. On success:
   - **Icon swap**: Replace clipboard icon with a checkmark icon (reuse the existing `SVG_CHECK` path from the checks section, but at 16x16px). The checkmark is green (`#2e7d32`, matching `.check-icon.pass`).
   - **Tooltip**: Show a small text label "Copied!" positioned below or beside the button. Style: `font-size: 0.75rem; color: #2e7d32; font-weight: 600`. Use absolute positioning relative to the button. This provides redundant feedback (icon change + text) so the state change does not rely on color alone.
   - **Duration**: After 2 seconds, revert to the clipboard icon and remove the "Copied!" label. Use a simple opacity fade (150ms) for the transition. Under `prefers-reduced-motion: reduce`, skip the fade and swap instantly.
   - **ARIA announcement**: Set `aria-label` temporarily to "Copied to clipboard" so screen readers announce the state change. Alternatively, use a visually hidden `role="status"` live region adjacent to the button that receives the "Copied!" text on success. The live region approach is more robust since it does not depend on the screen reader re-reading the button label.
3. On failure (clipboard API not available or permission denied):
   - Select the full text of the `<code>` element programmatically (`window.getSelection().selectAllChildren(codeEl)`) so the user can Cmd+C / Ctrl+C manually.
   - Change the tooltip text to "Press Ctrl+C to copy" (or "Cmd+C" on macOS, detectable via `navigator.platform`).
   - Do not show an error toast or modal -- the fallback is seamless enough that drawing attention to the failure creates more friction than the failure itself.

**Clipboard API note for CSP:**
The current Content-Security-Policy is `default-src 'none'; script-src 'unsafe-inline'`. `navigator.clipboard.writeText()` does not require any CSP changes -- it is a browser API, not a network request or script load. No CSP modification needed.

### 4. Responsive Behavior

**Desktop (>640px):**
- Code block at full width within the `<details>` padding. Copy button floats top-right.

**Mobile (<=640px):**
- The `<details>` padding reduces to `1.25rem` (existing mobile rule). The code block inherits this narrower context.
- The copy button remains top-right of the code block. At this width the command will wrap across 2-3 lines due to the long capture URL -- this is fine and expected given `white-space: pre-wrap` and `word-break: break-all`.
- Touch target of 44x44px is critical here. The 32px icon + 0.5rem padding achieves this.

### 5. Command Content

The pre-filled command should be:

```
npx @w-r-l/verify {origin}/v1/captures/{captureId}
```

where `{origin}` and `{captureId}` are the actual values already available in the page's JavaScript scope. This is the "remote capture" usage from the CLI README -- the simplest invocation that automatically resolves the signing key from the server.

Do not include `--json` or other flags. The bare command is the most useful default. Users who want machine output will read the CLI docs.

### 6. Conditional Rendering

Only render this section when verification succeeded (`verified === true`). Rationale:
- If verification failed, suggesting the user run the CLI adds confusion: "Should I trust this page's failure result, or might the CLI say something different?" The answer is no (same checks), but the UX implication is doubt.
- If verification data failed to load entirely (error state), there is nothing to copy a URL for.

This keeps the feature tightly scoped to the success path where it adds real value: "You saw it pass here -- now prove it yourself."

## Proposed Tasks

1. **Add CSS for the code block and copy button** -- new styles: `.cli-block` (the container), `.cli-block pre` (the code area), `.cli-copy-btn` (the button), `.cli-copy-btn:hover`, `.cli-copy-btn:focus-visible`, `.cli-copied` (success state), `.cli-copy-status` (the `role="status"` live region). Approximately 30-40 lines of CSS added to the existing `<style>` block.

2. **Add the `<details>` HTML in `buildResult()`** -- Insert the new section after the cryptographic details `<details>`, gated on `verified === true`. The code block content is constructed from `origin` and `captureId` which are already in scope.

3. **Add the copy button click handler in `populate()`** -- Wire up `navigator.clipboard.writeText()` with icon swap, live region update, and 2-second revert timeout. Add the fallback selection behavior for environments without clipboard API. Approximately 30-40 lines of JS.

4. **Define the two SVG icons** (clipboard, checkmark-small) as inline string constants alongside the existing `SVG_CHECK`, `SVG_X`, `SVG_DASH` declarations at the top of the script.

All four tasks touch a single file: `src/verify-page.js`. No new files, no new dependencies, no build changes.

## Risks and Concerns

**Low risk: clipboard API availability.** `navigator.clipboard` is supported in all modern browsers and has been baseline since 2021. The fallback (text selection) handles edge cases. No concern here.

**Low risk: CSP compatibility.** As noted, clipboard API requires no CSP changes. No risk.

**Medium risk: command length on mobile.** The full `npx @w-r-l/verify https://wrl.benpeter.workers.dev/v1/captures/cap_abc123...` string is roughly 80-100 characters. On a 320px-wide viewport with 0.8rem monospace, this wraps across 3-4 lines. This is acceptable -- it is inside a collapsed `<details>` that only technical users will open, and the copy button means they never need to manually select the text. But it should be tested at 320px to verify the copy button does not overlap the wrapped text.

**Zero risk: clutter for casual users.** The section is collapsed by default (`<details>` without `open` attribute). Casual users scanning the page will see only the one-line summary "Verify independently" alongside the other disclosure summaries. It adds approximately 20px of visual footprint (one summary line + border-top) to the page -- negligible.

**Note: the `<details>` pattern is already accessible.** Native `<details>/<summary>` provides built-in keyboard operation (Enter/Space to toggle), ARIA semantics, and screen reader support without any additional ARIA attributes. The existing page already uses this pattern successfully.

## Additional Agents Needed

- **Frontend minion** -- to implement the actual code changes in `src/verify-page.js`. All design decisions, CSS specifications, JS behavior, and HTML structure are fully specified above. Implementation should be straightforward.
- **Accessibility minion** -- for a post-implementation audit to verify: (1) the `role="status"` live region announces correctly in VoiceOver and NVDA, (2) the copy button's focus order is logical within the `<details>` content, (3) the icon swap does not cause an unexpected focus loss. This is a quick check, not a full audit.
