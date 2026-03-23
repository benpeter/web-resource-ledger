## UX Strategy Review

**Verdict: ADVISE**

The core user journey is coherent and well-scoped. The plan correctly identifies that quota feedback belongs at two moments: the settings dashboard (proactive awareness) and the capture submit form (reactive correction). These are the right integration points and the right jobs-to-be-done. The decision to hide internal tier names (`free`/`pro`) behind display names (`Starter`/`Pro`) is the right call. The three concerns below are about friction in edge cases, not structural problems.

---

- [usability]: The 429 error message for quota-exceeded captures in the UI does not tell the user where to see their remaining quota or how to recover, leaving them in a dead end.
  SCOPE: `src/ui/ui-captures.js` — quota-specific 429 error handling (Task 4, step 7)
  CHANGE: The message "Monthly capture limit reached. Your quota resets on {date}." should include a link or navigation cue to the Usage section in Settings. Something like: "Monthly capture limit reached. Your quota resets on {date}. View usage in Settings."
  WHY: The error tells the user what happened but not what to do next. Nielsen H10 (help users recover from errors) requires actionable guidance. The Settings page is one navigation step away — pointing there converts a dead end into a recovery path. Without it, users experiencing quota exhaustion for the first time have no self-serve recovery path and no way to understand their remaining capacity.
  TASK: Task 4

- [usability]: Storage bytes are formatted with SI units (1000-based: KB, MB, GB) but quota limits are defined in binary units (1 GB = 1,073,741,824 bytes). This creates a mismatch: a "1 GB" quota will display as "1.07 GB" when full, which is confusing.
  SCOPE: `src/ui/ui-settings.js` — `formatBytes()` helper (Task 4, step 2)
  CHANGE: Either (a) use binary units (GiB/MiB/KiB) consistently, or (b) use SI units (1000-based) AND store quota limits in SI-rounded values (1,000,000,000 bytes for "1 GB"). Option (b) is simpler since it keeps numbers round in the UI. The spec currently says `1 * 1024 * 1024 * 1024` in `TIER_QUOTAS` — this should be reconciled with whatever display unit is chosen.
  WHY: A user whose quota says "1 GB" sees a progress bar that hits 100% at "1.07 GB" in SI, or never quite reaches "1 GiB" in binary display because the label on the tier says "1 GB." This is a small but predictable source of confusion that erodes trust in the accuracy of usage data. Consistency between the label (what the tier promises) and the display (what is shown) is a basic feedback heuristic.
  TASK: Task 4 (and touches Task 1 constants if option b is chosen)

- [usability]: The usage dashboard loads data only on page load with no refresh mechanism, but the plan also shows quota status headers (`X-Quota-*`) on every successful capture response. A user who makes captures in one tab and then checks settings in another will see stale quota data with no way to refresh short of a full page reload.
  SCOPE: `src/ui/ui-settings.js` — `mountSettings()` fetch (Task 4)
  CHANGE: Add a lightweight manual refresh affordance to the usage card — a small "Refresh" button or link that re-fetches `/v1/account/usage` and re-renders the section in place. This is a few lines of vanilla JS and avoids the cognitive dissonance of "I just used 10 captures but my dashboard still shows 42/100."
  WHY: The plan explicitly calls out "updates on page load (not real-time)" as acceptable, and it is for the average case. But when the user's own actions are the cause of the discrepancy, a stale counter directly undermines the dashboard's purpose — knowing your current quota position. A single manual refresh button is the minimum viable feedback loop without polling complexity. The effort is low and the user benefit is concrete.
  TASK: Task 4
