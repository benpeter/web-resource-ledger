# Domain Plan Contribution: Accessibility

**Agent**: accessibility-minion
**Planning question**: ARIA attributes for copy button, screen reader announcements for copy success/failure, keyboard interaction within `<details>`.

---

## Recommendations

### 1. Copy Button ARIA Markup

The copy button should be a native `<button>` element (WAI-ARIA first rule: prefer native HTML). No `role` attribute needed.

```html
<button type="button" class="copy-btn" aria-label="Copy command to clipboard">
  <!-- visual icon, hidden from AT -->
  <svg aria-hidden="true" ...>...</svg>
  <span class="sr-only">Copy command to clipboard</span>
</button>
```

**Key attributes:**

- **`aria-label="Copy command to clipboard"`**: Provides the accessible name. The label should describe both the action ("copy") and the target ("command to clipboard") so screen reader users understand what will happen without visual context. If the button includes visible text (e.g., "Copy"), use that visible text as the accessible name instead (WCAG 2.5.3 Label in Name -- the accessible name must contain the visible label text).
- **No `aria-pressed` or `aria-live` on the button itself**: The copy action is a momentary action, not a toggle state. Do not use `aria-pressed`. Feedback belongs in a separate live region (see below).
- **`type="button"`**: Prevents any accidental form submission if the page structure ever changes.

**Important: Do NOT change `aria-label` dynamically on the button** (e.g., swapping between "Copy" and "Copied!"). This is a common anti-pattern -- screen readers do not re-announce an element's label when it changes unless the user re-focuses it. The user would miss the feedback entirely.

### 2. Screen Reader Feedback for Copy Success/Failure

Use a dedicated `aria-live="polite"` region adjacent to the copy button. This region should be present in the DOM at page render time (empty), and its text content updated after the copy operation. Screen readers announce content changes in live regions automatically.

```html
<div class="copy-wrap">
  <pre><code id="npx-command">npx @w-r-l/verify https://...</code></pre>
  <button type="button" class="copy-btn" aria-label="Copy command to clipboard">
    <svg aria-hidden="true">...</svg>
  </button>
  <span class="copy-status sr-only" aria-live="polite" role="status"></span>
</div>
```

**On copy success**, set the live region text:
```javascript
statusEl.textContent = 'Command copied to clipboard';
```

**On copy failure** (clipboard API unavailable, permission denied):
```javascript
statusEl.textContent = 'Could not copy command. Select and copy it manually.';
```

**Why `role="status"` alongside `aria-live="polite"`**: The `role="status"` is semantically correct (status information) and implicitly carries `aria-live="polite"`, but being explicit with both ensures consistent behavior across screen reader/browser combinations. The existing page already uses this pattern on the loading indicator (`role="status"`).

**Timing**: Clear the status message after a delay (e.g., 3-5 seconds) so stale announcements do not confuse users who navigate back to the region later. Use `setTimeout` to reset `textContent = ''`.

**Do NOT use `aria-live="assertive"`**: Copy feedback is not urgent. Assertive interrupts the current screen reader output, which is disruptive. Polite waits for the current speech to finish.

### 3. Keyboard Interaction Within `<details>`

Native `<details>/<summary>` has good built-in keyboard support in all modern browsers:

- **`<summary>` is focusable by default** and responds to Enter and Space to toggle open/close. No custom keyboard handlers needed.
- **Tab order is natural**: After expanding, Tab moves from `<summary>` into the `<details>` content (the code block, then the copy button).
- **No keyboard traps**: Users can Tab past the copy button to the next page element without issues.

**No custom ARIA needed on the `<details>/<summary>`**: The native HTML element provides `aria-expanded` semantics automatically. Do NOT manually add `role="group"` or `aria-expanded` -- browsers handle this natively and adding redundant ARIA can cause double-announcements in some screen readers.

**One concern to address**: The `<code>` element containing the npx command is not interactive and should not be in the tab order. Do NOT add `tabindex` to the code block. The copy button is the interactive element; the code block is just content. If the code block is wrapped in `<pre>`, ensure the `<pre>` does not inadvertently become scrollable (which would require `tabindex="0"` per WCAG 2.1.1 for scrollable-region-focusable). Keep the command short enough to avoid overflow, or use `word-break: break-all` / `overflow-wrap: break-word`.

### 4. Focus Indicators

The copy button must have a visible focus indicator. The page already has a consistent pattern:

```css
.copy-btn:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px; }
```

Follow this exact pattern. This satisfies WCAG 2.4.13 Focus Appearance (AA) as long as the outline contrasts sufficiently against the background (2px solid #1a1a1a against white/light background is well above the 3:1 minimum for non-text contrast).

### 5. Target Size

Per WCAG 2.5.8 Target Size (Minimum) (AA), the copy button must be at least 24x24 CSS pixels. If using an icon-only button, ensure the clickable area (including padding) meets this minimum. A common approach:

```css
.copy-btn {
  min-width: 32px;
  min-height: 32px;
  /* or use padding to reach 24x24 minimum */
}
```

32px is a comfortable touch target that exceeds the 24px minimum.

### 6. Summary Text Clarity

The `<summary>` text "Verify independently" is concise but may not be immediately clear to all users (cognitive accessibility concern, COGA guidelines). Consider whether the summary alone conveys enough context, or if a brief sentence inside the expanded content should explain the purpose. For example:

```html
<details>
  <summary>Verify independently</summary>
  <p class="verify-desc">Run this command in your terminal to verify this capture using the open-source CLI tool, independent of this page.</p>
  <div class="copy-wrap">...</div>
</details>
```

This addresses WCAG 3.3.2 Labels or Instructions (A) and supports cognitive accessibility by providing context before the command.

### 7. Clipboard API Fallback

`navigator.clipboard.writeText()` is widely supported but can fail (insecure contexts, permission policy, or browsers that require HTTPS). The implementation should:

1. Check `navigator.clipboard` existence before attempting.
2. On failure, do NOT silently fail (per the project's "fail loudly" principle). Announce the failure in the live region.
3. Consider making the `<code>` element selectable (it already is by default) so users can fall back to manual select-and-copy. No additional ARIA needed for this -- it is the browser's native text selection behavior.

### 8. Visual Feedback Must Not Be Color-Only

If the copy button visually changes (e.g., icon changes from clipboard to checkmark, or color changes to green), this must NOT rely solely on color to convey the state change (WCAG 1.4.1 Use of Color, Level A). The icon shape change (clipboard to checkmark) is sufficient as a non-color differentiator. The `sr-only` live region handles the non-visual channel.

---

## Proposed Tasks

1. **Add `<button>` with `aria-label` for copy action** -- native `<button type="button">`, icon with `aria-hidden="true"`, accessible name via `aria-label` or visible text label.
2. **Add `<span aria-live="polite" role="status">` for copy feedback** -- empty at render, populated on copy success/failure, cleared after timeout.
3. **Add `:focus-visible` style for copy button** -- follow existing page pattern (`2px solid #1a1a1a`, `outline-offset: 2px`).
4. **Ensure 24x24px minimum target size** on copy button (WCAG 2.5.8).
5. **Add brief explanatory text** inside the expanded `<details>` before the command block (cognitive accessibility).
6. **Handle clipboard API failure** with live region announcement (not silent failure).

---

## Risks and Concerns

### Low Risk: `<details>` Screen Reader Support

Native `<details>/<summary>` has had inconsistent screen reader support historically (particularly VoiceOver on older macOS versions not announcing expanded/collapsed state). As of 2025-2026, support is robust across NVDA + Firefox, JAWS + Chrome, and VoiceOver + Safari (macOS 13+). No custom ARIA workaround needed for current browser targets. If the project must support older Safari/VoiceOver combinations, manual testing would confirm.

### Low Risk: Clipboard API Permissions

The Clipboard API requires a user gesture (button click) and a secure context (HTTPS). The verify page is served over HTTPS from a Cloudflare Worker. The CSP (`script-src 'unsafe-inline'`) does not restrict clipboard access. No `Permissions-Policy` header blocks clipboard. This should work without issues, but the failure path must still be handled for edge cases (corporate browser policies, etc.).

### No Risk: Keyboard Interaction

No custom keyboard handling is needed. Native `<button>` responds to Enter and Space. Native `<details>/<summary>` responds to Enter and Space. Tab order flows naturally. No keyboard traps are introduced.

### Concern: Avoid Common Anti-Patterns

The implementation must NOT:
- Swap `aria-label` on the button to "Copied!" (screen readers won't re-announce).
- Use `aria-pressed` (copy is not a toggle).
- Add `role="button"` to a `<button>` (redundant ARIA, violates rule 2).
- Use a tooltip (`role="tooltip"`) for the "Copied!" feedback -- tooltips are announced on focus/hover, not on action completion. A live region is the correct pattern.
- Add `tabindex` to the `<code>` block (it is not interactive).

---

## Additional Agents Needed

None beyond those already identified in the meta-plan. The accessibility requirements are self-contained and do not require input from other specialists. The recommendations integrate cleanly with whatever UX design decisions are made for placement and visual treatment -- they are orthogonal to design choices.

**Coordination note for frontend-minion** (at implementation time): The live region `<span>` must be present in the DOM at page render, not injected dynamically. Screen readers may not detect dynamically added live regions. Since the verify page builds HTML as a string in `buildResult()`, the live region should be included in that HTML template string (empty), then populated via `textContent` in the copy handler.
