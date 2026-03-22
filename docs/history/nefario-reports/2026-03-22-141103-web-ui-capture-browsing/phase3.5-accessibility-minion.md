## Verdict: ADVISE

The plan is accessibility-aware in several respects: it specifies focus management after hash navigation (Task 1 success criteria), `prefers-reduced-motion`, 16px input font-size to prevent iOS zoom, and asks Task 4 to verify aria-live regions and 44px touch targets. These are good baselines.

However, four issues need explicit specification in the task prompts before implementation begins. Left unspecified, they will likely be implemented incorrectly or inconsistently by the frontend-minion.

---

- [accessibility]: Clickable list rows (`<tr>` or `.card`) will be rendered as non-interactive elements with click handlers, making them unreachable by keyboard-only users and invisible to screen readers as interactive targets.
  SCOPE: `src/ui/ui-list.js` — capture list rows/cards
  CHANGE: Each list item must be either (a) a native `<a href="#/captures/{id}">` wrapping the row content, or (b) if a table row is used, include an explicit `<a>` anchor inside a cell as the clickable target rather than attaching `onclick` to `<tr>`. Do NOT use `cursor: pointer` + `onclick` on `<div>` or `<tr>` elements without a keyboard interaction path. The task prompt currently says "Each row/card is clickable -> navigates to `#/captures/{id}`" with no keyboard specification.
  WHY: WCAG 2.2 SC 2.1.1 (Keyboard, Level A). A `<tr onclick>` or `<div onclick>` is not reachable via Tab and produces no keyboard event. This is a Level A failure that automated tools (axe `focus-order-semantics`) will flag, and screen reader users cannot activate these items at all.
  TASK: Task 2

- [accessibility]: The aria-live region for polling status updates is mentioned only in the Task 4 polish checklist ("Verify all aria-live regions are correct"), but no aria-live markup is specified in Task 2 where the polling output is actually built.
  SCOPE: `src/ui/ui-poll.js` and `src/ui/ui-list.js` — polling status announcements
  CHANGE: Task 2 must specify that the pending item's status display (the "Capturing... 15s" elapsed text and the final complete/failed badge swap) be wrapped in or adjacent to an `aria-live="polite"` region so screen readers announce the transition without moving focus. A single `<div aria-live="polite" aria-atomic="true" class="sr-only" id="capture-status-announcer"></div>` in the view, updated via `textContent` when status changes, is sufficient. This must be specified in Task 2's prompt, not deferred to Task 4.
  WHY: WCAG 2.2 SC 4.1.3 (Status Messages, Level AA). Users who cannot see the visual badge swap will never know a capture completed. Deferring this to a polish pass risks it being overlooked or implemented incorrectly because the polling architecture will already be fixed by then.
  TASK: Task 2

- [accessibility]: The auth gate password input uses `autocomplete="off"`, which prevents password managers from offering credential autofill and forces users to type an API key manually — a significant barrier for users with motor impairments or cognitive disabilities.
  SCOPE: `src/ui/ui-auth.js` — API key input field
  CHANGE: Change `autocomplete="off"` to `autocomplete="current-password"` (the closest semantic match for a bearer token credential). This enables password manager autofill while the sessionStorage-only storage model still prevents the browser's native credential store from learning the key unless the user explicitly saves it. The security posture is unchanged: the key is not stored in the DOM or localStorage.
  WHY: WCAG 2.2 SC 3.3.8 (Accessible Authentication Minimum, Level AA — new in WCAG 2.2). This criterion specifically prohibits requiring users to transcribe or memorize credentials without an alternative. `autocomplete="off"` blocks the clipboard-and-password-manager path that enables compliance.
  TASK: Task 1

- [accessibility]: The detail view's status banner (complete/failed/pending) communicates state via color alone (green/red/neutral), with no text label inside the banner element itself.
  SCOPE: `src/ui/ui-detail.js` — status banner
  CHANGE: The status banner must include a visible text label (e.g., "Status: Complete", "Status: Failed", "Status: Pending") inside the banner element, not only via the `.badge` component elsewhere on the page. The design system's color tokens alone do not convey meaning to users who cannot perceive color.
  WHY: WCAG 2.2 SC 1.4.1 (Use of Color, Level A). The task prompt specifies "Status banner: full-width bar at the top showing status. Use design system status colors" with no requirement for a text label inside the banner. Color alone is insufficient for users with color vision deficiency.
  TASK: Task 3

---

None of these are showstoppers that would block the architecture from proceeding. The plan's structure is sound. The four issues above are task-prompt gaps that, if not corrected before implementation, will require rework after the frontend-minion completes the implementation.
