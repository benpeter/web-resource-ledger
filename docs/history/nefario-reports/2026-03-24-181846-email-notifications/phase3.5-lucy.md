# Lucy Review -- R36 Email Notifications Plan

## Verdict: ADVISE

The plan is well-aligned with the original R36 issue requirements. All six notification types, the preferences API, unsubscribe handling, and email templates map directly to stated success criteria. No significant drift, no missing requirements. Five issues below, all resolvable without restructuring.

---

### Requirements Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|------------------------------|--------------|--------|
| Email delivery via Resend or CF Email Workers | Task 2 Part D (Resend via direct fetch) | Covered |
| Capture failure notification | Task 2 template + Task 3 trigger 3a | Covered |
| Approaching free limit (80/100) | Task 2 template + Task 3 trigger 3b | Mismatch (see ADVISE #1) |
| Free limit reached (100/100) | Task 2 template + Task 3 trigger 3c | Mismatch (see ADVISE #1) |
| Invoice generated | Task 2 template + Task 3 trigger 3d | Covered |
| Payment failure | Task 2 template + Task 3 trigger 3e | Covered |
| Weekly schedule digest | Task 2 template + Task 3 trigger 3f | Covered |
| Per-tenant notification preferences (email + event types) | Task 1 Part A-C | Covered |
| GET/PUT /v1/tenant/notifications | Task 1 Part C (uses /v1/account/notifications) | Path differs (see ADVISE #2) |
| One-click unsubscribe (RFC 8058) | Task 1 Part D + Task 2 Part D | Covered |
| HTML + plain text templates | Task 2 Part C | Covered |
| Vanilla HTML/CSS templates | Task 2 constraints | Covered |
| Email delivery failures logged | Task 2 Part D (handleEmailMessage error logging) | Covered |

---

### Findings

### ADVISE #1 [DRIFT] -- Free limit threshold values contradict the issue spec
SCOPE: Task 3 trigger 3b (approaching limit) and 3c (limit reached), `src/quotas.js`
CHANGE: The issue spec says "triggered at 80/100 free captures" and "triggered at 100/100 free captures." The plan uses FREE_LIMIT = 200 with 80% threshold (160/200). The codebase confirms `FREE_CAPTURE_LIMIT = 200` in `src/quotas.js:9`. The plan's values are correct for the actual system; the issue spec's "80/100" and "100/100" are stale.
WHY: The minion implementing Task 3 sees the issue spec's "80/100" numbers repeated in the prompt. If they follow the issue literally instead of the plan's code, they will hardcode wrong thresholds. The plan correctly derives from the codebase (200-based), but the spec discrepancy should be acknowledged in the prompt to prevent confusion.
TASK: Task 3

### ADVISE #2 [DRIFT] -- API path differs from issue spec
SCOPE: Task 1 Part C route registration, `src/index.js`
CHANGE: The issue spec says "GET/PUT /v1/tenant/notifications". The plan uses `/v1/account/notifications`. The codebase's existing session-gated routes use `/v1/account/` (settings, usage, billing), not `/v1/tenant/`. The plan is correct to follow the codebase convention.
WHY: Informational only. The plan made the right call by following codebase convention over the issue spec's path naming. No action needed unless the issue spec is authoritative and the path must match exactly. Flag so the human is aware of the deviation.
TASK: Task 1

### ADVISE #3 [COMPLIANCE] -- `.catch(() => {})` on dispatchNotification conflicts with "fail loudly" principle
SCOPE: Task 3 trigger code snippets (3a through 3e), CLAUDE.md Engineering Philosophy
CHANGE: Task 3 instructs the minion to write `dispatchNotification(...).catch(() => {})`. The CLAUDE.md "fail loudly" rule states: "Every catch must either log the error or handle a specific, named error type." The existing `dispatchWebhooks` pattern in `src/index.js:229-237` uses an async IIFE with try/catch that logs errors -- it does NOT use `.catch(() => {})`. The plan should follow the same pattern: `ctx.waitUntil((async () => { try { await dispatchNotification(...) } catch (err) { log(env, 4, 'email', { event: 'email.dispatch_error', tenantId, error: err.message }) } })())`.
WHY: This exact issue was flagged by Lucy in a prior review (content-security-scanning, `phase3.5-lucy.md` line 34). The codebase has an established pattern for non-blocking dispatch with error logging. Using `.catch(() => {})` would be the first silent swallow in core application code outside of consent.js browser-context interactions.
TASK: Task 3

### ADVISE #4 [SCOPE] -- Capture failure KV cooldown adds complexity not in the issue spec
SCOPE: Task 2 Part D (dispatchNotification), KV cooldown logic for capture_failure
CHANGE: The plan adds a per-tenant KV-based cooldown (5-minute window, max 3 then digest) for capture failure emails. The issue spec does not mention rate limiting notification delivery, only that capture failure notifications should be sent. The cooldown logic involves KV reads/writes on every failure, a window counter, and a digest mechanism that is not specified anywhere.
WHY: The flooding risk (Risk #4) is real, but the mitigation adds ~30 lines of non-trivial stateful logic (KV window counter, digest trigger) to the dispatch function. A simpler YAGNI-compliant approach: use the existing `notification_sent` dedup table with a per-hour period key (e.g., `2026-03-W13-capture_failure-{tenantId}`) to limit to one capture failure email per hour. This uses infrastructure already in the plan without adding a new KV access pattern. If the human wants the full cooldown+digest, keep it -- but flag as scope expansion that warrants explicit approval.
TASK: Task 2

### ADVISE #5 [COMPLIANCE] -- Weekly digest cron trigger requires wrangler.toml change not mentioned in plan
SCOPE: Task 3 trigger 3f, `wrangler.toml` [triggers] crons
CHANGE: The plan's weekly digest fires at "Monday 9:00 UTC" by checking `getUTCDay() === 1 && getUTCHours() === 9` inside the `scheduled()` handler. But the current cron schedule is `*/1 * * * *` (every minute) and `0 3 * * *` (daily at 3am). The every-minute cron would fire `scheduled()` at 09:00 on Mondays, so the check would work -- but only if the minute check is also included (`getUTCMinutes() === 0`), which the plan does include. This works correctly with the existing cron.
WHY: Informational -- the implementation is sound. The plan correctly uses the existing every-minute cron rather than adding a new weekly cron trigger. No change needed.
TASK: Task 3 (no action)
