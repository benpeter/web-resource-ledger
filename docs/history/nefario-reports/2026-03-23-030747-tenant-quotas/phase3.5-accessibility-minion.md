## Verdict: ADVISE

The plan's ARIA fundamentals are sound: `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-label` are all specified. The numeric "N of M" redundancy alongside color states satisfies 1.4.1 Use of Color. These are the right instincts. The issues below are gaps or ambiguities that need clarifying instructions to frontend-minion before implementation.

---

- [accessibility]: The `role="progressbar"` is placed on the outer `.usage-bar` container div, but `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` must reflect the percentage value (0-100), not the raw count, when the max is not the count.
  SCOPE: Task 4 -- `src/ui/ui-settings.js`, progress bar HTML structure (plan lines 663-675)
  CHANGE: The plan shows `aria-valuenow="42"` and `aria-valuemax="100"` which happens to work for the captures example (count and percentage max are both 100). But for storage, the raw bytes are used -- `aria-valuemax` should be the quota limit in the same unit as `aria-valuenow`. The plan shows bytes in the API response but does not specify whether the ARIA attributes use raw bytes or a normalized percentage. Specify explicitly: ARIA attributes must use consistent units. Either use percentage (valuenow=42, valuemin=0, valuemax=100) consistently across both metrics, OR use raw values consistently (valuenow=captureCount, valuemax=quota.capturesPerMonth for captures; valuenow=storageBytes, valuemax=quota.storageBytes for storage). The `aria-label` must then match the unit used. Raw bytes in `aria-valuenow` with a human-readable `aria-label` is valid but requires care.
  WHY: WCAG 4.1.2 Name, Role, Value (Level A). If the ARIA value attributes are inconsistent between metrics, or the label does not accurately reflect the current value, screen readers will announce incorrect information to users.
  TASK: Task 4

- [accessibility]: The `aria-label` text for storage uses "524 MB of 1 GB storage used this month" -- this requires the label to be generated from the formatted bytes string, but the plan does not explicitly instruct frontend-minion to use `formatBytes()` output inside the `aria-label`. The plan specifies `formatBytes` for the visible `.usage-metric-value` text but the `aria-label` construction is left implicit.
  SCOPE: Task 4 -- `src/ui/ui-settings.js`, aria-label generation for storage progress bar
  CHANGE: Explicitly instruct frontend-minion: the `aria-label` for the storage progress bar must use `formatBytes()` for both the used and limit values (e.g., `"${formatBytes(storageBytes.used)} of ${formatBytes(storageBytes.limit)} storage used this month"`), not raw byte integers. Raw bytes would produce announcements like "524288000 of 1073741824 storage used this month" which is unintelligible.
  WHY: WCAG 3.3.2 Labels or Instructions (Level A) and general WCAG 1.3.1 Info and Relationships. An accessible label conveying raw byte counts provides no meaningful information to a screen reader user.
  TASK: Task 4

- [accessibility]: The plan specifies 8px height for `.usage-bar`. Progress bars with 8px height have an effective click/pointer target area of 8px, which fails WCAG 2.2 SC 2.5.8 Target Size (Minimum) (Level AA) if the bar is interactive. The plan says the bar is display-only (no interaction), which avoids the target size requirement -- but this needs to be confirmed and the bar must not receive focus or have click handlers.
  SCOPE: Task 4 -- `src/ui/ui-css.js`, `.usage-bar` at 8px height
  CHANGE: Confirm in the Task 4 prompt that the progress bar is purely presentational with no keyboard focus, click interaction, or pointer events that make it an interactive target. If the element receives `tabindex` at any point, the 8px height creates a 2.5.8 violation. Add an explicit "do not make the progress bar focusable or interactive" instruction.
  WHY: WCAG 2.2 SC 2.5.8 Target Size Minimum (Level AA). An 8px-tall interactive element would fail the 24x24 CSS pixel minimum. Making the intent explicit prevents frontend-minion from accidentally adding a tooltip-on-hover or focus handler.
  TASK: Task 4

- [accessibility]: The plan specifies `settingsAnnounce('Usage data loaded.')` via a live region for when usage data loads. However, the plan does not specify what to announce when usage data fails -- the error state ("Could not load usage data.") is inserted into the DOM but there is no instruction to announce the failure to screen reader users.
  SCOPE: Task 4 -- `src/ui/ui-settings.js`, error state handling (plan lines 736-739)
  CHANGE: Add an explicit instruction: when the usage fetch fails and the error message is rendered, also call `settingsAnnounce('Could not load usage data.')` (or equivalent) so screen reader users are notified of the failure without needing to navigate to the card.
  WHY: WCAG 4.1.3 Status Messages (Level AA). Error states that appear in the DOM without an announcement are invisible to screen reader users who are not currently navigating that region.
  TASK: Task 4

- [accessibility]: The plan specifies three color states (default/warning/critical) for the progress bar fill and notes "the threshold color change alone is not sufficient -- the numeric 'N of M' text beside the bar provides the same information non-visually." This is correct for 1.4.1. However, the `--color-warning` and `--color-error` CSS custom property values are not specified in the plan, and the plan does not verify that these colors meet the 3:1 contrast ratio against the `.usage-bar` track background (`--color-surface-muted`) required for non-text graphical elements (WCAG 1.4.11 Non-text Contrast, Level AA).
  SCOPE: Task 4 -- `src/ui/ui-css.js`, `.usage-bar-fill--warning` and `.usage-bar-fill--critical` colors against `.usage-bar` background
  CHANGE: Instruct frontend-minion to verify that `--color-warning` and `--color-error` achieve at least 3:1 contrast ratio against `--color-surface-muted` (the track background). If the design token values are not confirmed to meet this threshold, the plan should specify fallback values or flag this for ux-design-minion confirmation before implementation.
  WHY: WCAG 1.4.11 Non-text Contrast (Level AA). Progress bar fill colors are graphical UI components. If warning/error fill colors have insufficient contrast against the track, users with low vision cannot perceive the visual state even with the numeric fallback.
  TASK: Task 4
