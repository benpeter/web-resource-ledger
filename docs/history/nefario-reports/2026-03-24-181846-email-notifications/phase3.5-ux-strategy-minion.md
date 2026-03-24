## UX Strategy Review — Email Notifications (R36)

**Verdict: ADVISE**

The plan is architecturally sound and the scope is well-bounded. Three usability concerns warrant attention before execution.

---

- [usability]: The UI shows "Verification email sent" feedback even though no verification email is sent, creating a false system status signal.
  SCOPE: `src/ui/ui-notifications.js`, Task 4 prompt — email change UX section
  CHANGE: Replace "Verification email sent" with "Email updated. Verification is not yet implemented." or simply suppress the message. The UI should never tell users something happened that didn't happen — this violates Nielsen heuristic 1 (visibility of system status) and erodes trust with technical users who will notice the email never arrives.
  WHY: False feedback is worse than no feedback. When the verification email never arrives, users will retry, contact support, or distrust the product. The Task 4 prompt explicitly acknowledges "even though we don't implement email verification sending yet" — that acknowledgment should translate into honest UI copy, not a placeholder lie. The fix is one string change.
  TASK: Task 4

- [usability]: Six notification toggles presented simultaneously is near the cognitive load ceiling for this kind of preference UI (7±2), and the toggle labels don't communicate who these events are FOR.
  SCOPE: `src/ui/ui-notifications.js` — notification toggles section, Task 4 prompt
  CHANGE: Group the six toggles into two clusters with a lightweight subheading: "Capture alerts" (capture failures, approaching limit, limit reached) and "Billing & summaries" (invoice generated, payment failure, weekly digest). No need for progressive disclosure — just visual chunking. This reduces the apparent complexity without removing any controls. Also make the toggle descriptions action-oriented: "Capture failures" → "When a capture fails" to match the scanning pattern of a settings panel.
  WHY: Six undifferentiated toggles require users to read all of them before understanding the structure. Chunking into two groups with headers lets users satisfice — they can find the category relevant to them and focus there. This is a one-line structural change in the template, zero backend impact.
  TASK: Task 4

- [usability]: The capture failure cooldown (>3 failures → suppress individual emails, "a digest will be sent at window end") promises a digest that the plan does not implement.
  SCOPE: `src/email-dispatch.js` Task 2 prompt — capture_failure cooldown logic, specifically the comment "a digest will be sent at window end"
  CHANGE: Remove the reference to a window-end digest in the code comment and in any log event rationale. The cooldown correctly suppresses flooding, but there is no digest mechanism at window end — the weekly digest is time-based (Monday 9 UTC), not triggered by cooldown expiry. Users who trigger the cooldown will receive at most 3 failure emails and then silence until the cooldown resets. That's acceptable behavior, but the comment creates a false expectation for operators and future developers. Either implement the window-end digest or remove the promise of it.
  WHY: "A digest will be sent at window end" is a commitment the system cannot keep. If an operator sees this comment during an incident and waits for the digest, they will miss the signal. If a developer reads it and assumes the digest is implemented, they may not add it later. False documentation is worse than silence. The fix is removing three words from a comment.
  TASK: Task 2
