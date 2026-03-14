## UX Strategy Review

**Verdict: ADVISE**

---

- [usability]: The 503 error message for the global rate limiter uses vague natural-language timing ("Try again shortly") when a precise machine-readable value is already present in `Retry-After: 10`.
  SCOPE: `src/index.js` -- `handleCreateCapture` global rate limit response (Task 2)
  CHANGE: Align the human-readable message with the machine header: "Service is at capacity. Retry in 10 seconds." The current phrasing "Try again shortly" duplicates the intent of `Retry-After` without adding information, and leaves integrators guessing what "shortly" means if they parse message text rather than headers.
  WHY: Integrators who surface error messages directly to users or logs will see an imprecise message. The `Retry-After` header carries the authoritative value; the message body should echo it literally so both channels tell the same story. Low severity -- existing `Retry-After: 10` is the correct signal -- but the message is a missed opportunity to make the response self-contained.
  TASK: Task 2

---

**No blocking concerns.**

The rest of the plan is sound from a UX strategy perspective:

- The public key link scoped to the collapsed `<details>` element correctly applies progressive disclosure. Casual users see nothing new; technical verifiers find it exactly where they would look.
- Conflict resolutions on `keyId`/`createdAt` (YAGNI), `signingKeyUrl` in response bodies (coupling without user job), and key versioning elevation (documentation over premature feature work) are all correct calls.
- The verification journey is coherent: capture -> verify page -> crypto details -> public key endpoint. No orphaned steps.
- Key rotation documentation with the warning block appearing before the steps (Task 6 success criteria) directly reduces the highest-severity user error in this flow.
- The 503 vs 429 distinction for global vs per-IP rate limiting is correct UX: different user interpretations, different recovery actions.
