## UX Design Minion Review

ADVISE

---

- [design]: The email token spec hardcodes `colorWarning: '#e6a817'` but `design-system.css` defines `--color-warning-text: #7a5800` -- the warning text color -- which is absent from the token module. If the frontend-minion uses `colorWarning` (the background accent color) as foreground text color on the warning-style templates (approaching-limit), the result will be near-black hex on a very light yellow, likely failing contrast at small sizes.
  SCOPE: `src/email/email-tokens.js`, `src/email/templates/approaching-limit.js`
  CHANGE: Add `colorWarningText: '#7a5800'` and `colorWarningBg: '#fff8e1'` (already included), plus `colorInfoText: '#0d47a1'` and `colorInfoBg: '#e3f2fd'` to the EMAIL token object. The template instructions distinguish "warning style" and "info style" but the token object does not expose the text-color variants needed to render them safely -- the agent will have to improvise and may pick the wrong hex.
  WHY: Email clients do not support CSS custom properties. Without explicit text-color tokens for each semantic tier, the agent must hardcode or guess values that are already defined in the design system. A wrong guess on warning or info text color can easily drop below WCAG 4.5:1 on the `#fff8e1` or `#e3f2fd` backgrounds.
  TASK: Task 2

---

- [design]: The unsubscribe confirmation page (`GET /v1/notifications/unsubscribe`) is told to follow the `verify-page.js` pattern, but the Task 1 prompt gives no design spec for the two page states: valid-token-confirmation-form and invalid-token-error. The agent will invent layout, copy, and button treatment without guidance.
  SCOPE: `src/unsubscribe.js` -- GET handler HTML output
  CHANGE: Add a minimal spec to the Task 1 prompt: (1) valid state shows a single centered card with the notification type being unsubscribed, a descriptive sentence ("You will no longer receive [Capture failure] emails"), and a single "Unsubscribe" submit button using the `.btn--primary` style; (2) invalid/expired state shows a short error message with a link back to the dashboard -- no form. Both states use the existing `verify-page.js` card structure for consistency.
  WHY: Without a spec, the page may not clearly communicate what the user is unsubscribing from. The notification type (`eventType`) extracted from the token should be surfaced in human-readable form (not the raw snake_case key) so the user can confirm before submitting.
  TASK: Task 1

---

- [design]: The notification preferences UI prompt (Task 4) calls for an "Edit" button next to the email address that "reveals an input," but specifies no error or loading state for the inline edit flow. The existing codebase (ui-settings.js) handles toggle API errors by reverting state and announcing via an `aria-live` region -- that same pattern is not explicitly called out for the email edit flow.
  SCOPE: `src/ui/ui-notifications.js` -- email edit subcomponent
  CHANGE: Add to the Task 4 prompt: on PUT error, revert the input to the previous email value, show an inline error message below the input (not just an announce), and keep focus in the input so the user can correct and retry. On pending state, disable the Save button and show a loading indicator (text change is sufficient -- "Saving..."). Reference the `settingsAnnounce()` pattern from `ui-settings.js` explicitly so the agent uses the established aria-live mechanism.
  WHY: The "verification email sent" copy the prompt mandates is a false confirmation -- the backend does not send a verification email in this phase. If the PUT also fails silently (network error, validation error), the user will see "Verification email sent" with no email ever arriving. The gap is partly a UX strategy issue, but the design instruction should at minimum not promise an action that will not occur, and should show real error states.
  TASK: Task 4

---

- [design]: The toggle grouping in the UI spec mixes urgency levels without visual separation. "Capture failures" and "Payment failure" are error/blocking events; "Approaching limit" and "Limit reached" are warning/threshold events; "Invoice generated" and "Weekly digest" are informational. Presenting all six as a flat undifferentiated list reduces scannability and makes it harder for a user to understand what they are turning off.
  SCOPE: `src/ui/ui-notifications.js` -- notification toggle list
  CHANGE: Group the six toggles under two subheadings within the section: "Alerts" (capture failure, approaching limit, limit reached, payment failure) and "Summaries" (invoice generated, weekly digest). This requires no new components -- a small `<h3>` or label row styled as the existing `.section h2` uppercase label pattern is sufficient. The grouping clarifies consequence: disabling items under "Alerts" has service-affecting implications; disabling "Summaries" does not.
  WHY: All six toggles are currently "on" by default (opt-out model). A user who wants to reduce noise will need to scan all six to understand which ones are safe to disable. Ungrouped, the cognitive load is higher than necessary and raises the risk of a user accidentally disabling a critical billing alert.
  TASK: Task 4
