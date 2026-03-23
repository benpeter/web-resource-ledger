# UX Strategy Review — Scheduled Captures Cron Feature

**Verdict: APPROVE**

---

## Assessment Summary

The plan is well-scoped, user-centered, and applies progressive disclosure correctly. The decisions document shows the team already processed UX tradeoffs before reaching this review. I have no blockers and two advisories to carry forward.

---

## Journey Coherence

The user journey for scheduled captures is coherent end-to-end:

1. User discovers scheduling via the "Schedules" nav link (session-gated, appropriate)
2. Creates a schedule using preset frequencies (lowest cognitive entry point)
3. Sees confirmation via schedule count indicator and list row
4. Monitors status through badges that reflect last capture outcome (not just running/paused)
5. Filters captures by schedule from the existing captures view (no orphaned data)
6. Deletes using the established inline confirmation pattern from key revocation

The cross-surface linkage — captures showing "Scheduled" labels, capture detail linking back to the schedule, `GET /v1/captures?schedule_id=` filter — closes the loop so users never lose the thread between a schedule and its outputs. That is good information architecture.

The decision to defer the schedule detail view (execution history) is correct for MVP. The list + captures-filter combination gives users what they need without an extra layer.

---

## Cognitive Load Assessment

**Load is appropriate.** The feature introduces genuine complexity (cron, scheduling, quota interaction) but the plan manages it well:

**Positive load controls:**
- Preset dropdown (5 options) eliminates cron syntax knowledge for the common case. Hick's Law: 5 presets + 1 escape hatch is a tight, scannable set.
- "Next capture" preview on frequency change gives immediate feedback that the selection is understood — reduces the anxiety of "did I set this right?"
- Reuse of existing badge classes (`.badge--pass`, `.badge--fail`, `.badge--skip`) means users who know the captures view need no new vocabulary.
- Delete confirmation pattern mirrors key revocation exactly — zero relearning cost.
- The 10-schedule limit indicator (N of M) sets expectations before users hit the 429 wall.

**One load concern (advisory, not a block):** The status badge logic has a subtle ambiguity: "Active + last capture failed" shows `.badge--fail "Error"` while "Active + never run" shows `.badge--pass "Active"`. A brand new schedule and a healthy schedule both show `.badge--pass "Active"` but one has no run history. At small scale this is fine, but if a user creates a schedule and it silently fails on the first run (say, bad URL that passed validation), the `.badge--fail` will eventually appear — that is the right behavior. The concern is that there is no "pending first run" state distinguishable from "running fine." This is a minor cosmetic issue, not a blocker. If the team wants to add a `.badge--pending "Pending"` for `lastRunAt === null` schedules, that would improve signal without adding complexity. File as backlog.

---

## Simplification Opportunities

**None that warrant blocking.** The plan is already lean.

The one place I would have flagged — the "Custom..." cron input — was already debated in the Decisions section. The synthesis made the right call: "Custom..." as progressive disclosure is the correct middle ground between presets-only (too restrictive for a developer API product) and a raw input field as default (too intimidating for non-technical users). The escape hatch is properly hidden behind a selection, not presented upfront.

The decision NOT to build a visual cron picker widget is correct. Visual cron pickers are high-complexity widgets that rarely improve on a simple preset list + raw string fallback for this audience.

---

## Jobs-to-be-Done Alignment

The feature serves three distinct user jobs clearly:

1. **"I want to automatically capture a URL on a schedule"** (primary job) — served by POST /v1/schedules + UI create form
2. **"I want to see what a URL looked like at a specific past time"** (review job) — served by captures linked to `scheduleId`, filterable via GET /v1/captures
3. **"I want to manage my scheduled automations without using the API"** (management job) — served by the Web UI with pause/resume/delete

The quota interaction documentation in Task 6 addresses a critical job-awareness gap: users who set up 5 daily schedules don't realize they are consuming 150/200 of their free tier captures per month. The docs handle this; the UI does not surface it at schedule creation time. The plan flags this as a risk and explicitly defers a projected-usage display to post-MVP. That deferral is acceptable — documenting it is the minimum viable transparency, and in-UI projection is a post-MVP improvement. This is correctly scoped.

---

## Advisories (Non-Blocking)

**Advisory 1 — "Pending first run" badge state**
The `.badge--pass "Active"` state covers both "never run" and "running successfully." Consider adding `.badge--pending "Pending"` for schedules where `lastRunAt === null`. This makes it visually obvious that a schedule hasn't fired yet vs. is running healthily. Low effort, reduces user confusion in the first hour after creating a schedule. Backlog candidate.

**Advisory 2 — Quota warning at creation time**
The 429 error message at schedule creation (when the limit is reached) is handled. But quota exhaustion during execution (schedule fires, quota is empty, capture is skipped) is invisible to users until they notice captures stopped appearing. The plan defers projected-usage UI to post-MVP correctly. However, consider whether the schedule list could surface a low-quota warning state (e.g., if the tenant's remaining quota falls below one month of projected schedule usage). This is genuinely post-MVP scope — noting it for the backlog, not requesting action now.

---

## Conclusion

The plan applies the right UX principles where they count: progressive disclosure for cron input, established patterns for destructive actions, user-visible limits before hitting error states, and contextual linkage between schedules and their outputs. The scope is tight and every user-facing decision is grounded in a real user need. Proceed to execution.
