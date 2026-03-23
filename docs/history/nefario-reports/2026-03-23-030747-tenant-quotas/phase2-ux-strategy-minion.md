# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### (a) Where quota information should appear in the user journey

**Primary location: a "Usage" section inside the existing Settings view (`#/settings`).**

The Settings view (`ui-settings.js`) already follows a clear card-based section pattern (Account info card, API Keys card). Usage fits naturally as a third card section. This is the logical place users will look for account-level information -- it maps to the mental model of "my account, my limits." There is no need for a separate `#/usage` route; that would fragment account information across two views and add a nav item for something most users check infrequently.

**Secondary location: contextual inline warning on the captures list view, but ONLY when the tenant is above 80% of their captures/month quota.**

This follows progressive disclosure: don't surface quota information in the core workflow until it becomes relevant. Below 80%, quota awareness adds pure cognitive overhead to what should be a frictionless "paste URL, click Capture" flow. Above 80%, the user's mental context shifts from "I'm doing my work" to "I need to manage a resource" -- that's the right moment to surface it.

The warning should appear as a dismissible banner between the submit form and the captures list (similar to the existing `showGlobalError` pattern but using `alert--warning` styling). Content: "You've used {N} of {limit} captures this month." No link to upgrade (out of scope), but include a "View usage" link that navigates to `#/settings`.

**Not on the submit form itself.** See (b) below.

### (b) Cognitive load of quota awareness during capture submission

**The submit form should NOT show remaining quota.** Here is the reasoning:

1. **Satisficing behavior (Krug):** Users submitting a capture are focused on one job -- "capture this URL." Showing remaining quota ("142 of 500 remaining") forces them to context-switch into resource management mode on every single submission. This is extraneous cognitive load for users well under their limits (the vast majority, most of the time).

2. **The captures list view already shows the inline warning at 80%.** If a user is on the captures page (which contains the submit form), they will see the banner. The banner IS the contextual warning for the submission flow. Adding a second indicator on the form itself is redundant and contributes to information density without adding signal.

3. **Error handling covers the edge case.** When a user actually exceeds their quota, the 429 response from the API will display in the existing `formErrorEl` (the same error slot used for invalid URLs, network errors, etc.). This is the correct moment for the system to communicate "you can't do this" -- at the point of failure, not preemptively on every interaction.

**Exception:** If the tenant has exactly 0 remaining captures (quota fully exhausted), the submit button should be disabled with a clear explanation. This prevents the user from filling in a URL, clicking submit, and waiting for a failure -- that's wasted effort. A disabled state with text like "Monthly capture limit reached" is a constraint (Norman) that prevents the error entirely.

### (c) Human-readable 429 response for quota_exceeded

**Yes, absolutely.** The 429 response body should include a clear, actionable message. Current 429 responses say "Per-tenant rate limit exceeded" or "Rate limit exceeded. Try again later." -- these are generic rate-limit messages, not quota messages. A quota exhaustion is fundamentally different from a rate limit: rate limits reset in seconds/minutes, quotas reset at the end of the billing period.

The quota-specific 429 should be distinguishable from rate-limit 429s and include:

- **What happened:** "Monthly capture quota reached."
- **When it resets:** "Your quota resets on {first day of next month}." (This is the most important piece of information -- it answers the user's immediate question: "When can I use this again?")
- **What to do (without promising auto-upgrade):** "Contact the site operator to discuss your usage needs." (Neutral phrasing that works whether upgrade paths exist or not.)

Technical detail: Add a `quotaType` or `limitType: 'quota'` field in the Problem Details JSON extension so the UI can differentiate quota exhaustion from rate limiting and show appropriate messaging. The existing `limitType: 'tenant'` pattern in the codebase is the right model to follow.

### (d) Progress bar thresholds

**Three visual states:**

| Range | Visual state | Rationale |
|-------|-------------|-----------|
| 0-79% | Default/neutral (the bar's accent color against a muted track) | Normal operation. No emotional signal needed. |
| 80-94% | Warning (amber/yellow treatment) | Early warning. The 80% threshold is well-established in systems design (disk usage warnings, data plan alerts). It gives users enough runway to adjust behavior -- 20% remaining is meaningful enough to plan around. |
| 95-100% | Critical (red treatment) | Urgent. At 95%, the user is essentially at the boundary. For a 50-capture free tier, 95% means 2-3 captures left. This is the "you're about to hit a wall" signal. |

**Do not animate the bar or use pulsing/flashing for the warning states.** Color change alone is sufficient and respects calm technology principles. The bar should also show the numeric ratio as text (e.g., "42 / 50 captures") -- never rely on the visual bar alone (accessibility, and some users prefer numbers over spatial representations).

For storage (GB), the same thresholds apply proportionally. Show storage in human-readable units (e.g., "1.2 GB / 5 GB") rather than raw bytes.

### (e) Historical usage vs. current period only

**Current period only for MVP.** Here is why:

1. **JTBD analysis:** The job users hire a usage dashboard for is "understand whether I'm about to hit my limit." Historical data serves a different job -- "understand my usage trends over time" -- which is a billing/optimization concern, not an operational one. The operational job is what matters for quota enforcement.

2. **Cognitive load:** Adding a historical dimension (month selector, trend charts, comparison views) significantly increases the interface complexity. The current D1 schema stores per-period rows, so historical data CAN be surfaced later, but this is a textbook case for progressive disclosure -- build the simple version, see if anyone asks for history.

3. **Data availability:** New self-serve tenants (from Phase 0055) will have zero or one months of data. Showing an empty chart or a single data point is worse than showing nothing -- it signals incompleteness rather than intentional design.

**Recommendation:** Show current-period usage only, with the period label displayed as "March 2026" (human-readable month name, not "2026-03"). If the quota resets monthly, showing the period label implicitly communicates the reset cadence without requiring a separate explanation.

### (f) Tier naming and identity

**Use "Starter" instead of "Free."**

"Free" has three UX problems:

1. **Negative connotation:** "Free tier" implies "the limited version" or "the one you're supposed to upgrade from." It frames the product relationship as transactional before monetization even exists.

2. **Anchoring effect:** Showing "Free" to users anchors their perception of the product's value at zero. If WRL ever introduces paid tiers, users anchored on "free" will resist paying more strongly than users anchored on "starter."

3. **No functional information:** "Free" tells the user nothing about what they get. "Starter" at least implies "this is where you begin" -- it's a stage, not a price.

**How to display tier identity:**

- In the Settings/Usage section, show the tier name once in a definition list row: "Plan: Starter". Keep it factual and unadorned. No badge, no upsell CTA (there's nothing to upsell to yet).
- Do NOT show tier name in the nav bar, in the captures list, or on the submit form. Tier identity is account-level context, not per-interaction context.
- In the 429 quota-exceeded error message, do NOT mention the tier name. "Monthly capture quota reached" is sufficient. Mentioning "Starter plan" in an error message feels like shaming the user for not paying.

---

## Proposed Tasks

### Task 1: Define quota information architecture

**What:** Document the exact quota data points to surface, where each appears, and the display rules (thresholds, conditional visibility, disabled states).

**Deliverables:**
- Information architecture specification covering: Settings/Usage card content, captures-list warning banner trigger rules, submit-button disabled state rules, 429 error message copy
- Quota threshold table (0-79%, 80-94%, 95-100%) with visual state descriptions
- Copy for all user-facing quota messages (banner text, error messages, disabled-state labels)

**Dependencies:** Tier definitions with actual quota numbers (captures/month, storage GB per tier) -- these must be decided before UI copy can be finalized.

### Task 2: Extend /auth/session response with quota data

**What:** The UI boots from `/auth/session` (see `handleAuthSession` in `oauth.js`). The response already includes `user: { githubId, githubLogin, tenantId, tosAcceptedAt, tosVersion }`. This should be extended to include `tier` and optionally a summary usage snapshot, so the captures-list view can show/hide the warning banner without a separate API call.

**Deliverables:**
- Updated `/auth/session` response shape with `tier` field
- New endpoint or extended session response that includes current-period usage summary (captureCount, captureLimit, storageBytes, storageLimit)
- The captures-list banner needs this data at render time; if it requires a separate fetch, the UX degrades (flash of content, layout shift)

**Dependencies:** Tier-to-limits mapping must be defined in the backend. Usage metering (R25) is already done.

### Task 3: Design Usage section for Settings view

**What:** Add a "Usage" card section to the Settings view, following the existing card-based pattern (Account card, API Keys card). Shows current-period usage with progress bars per metric, tier identity, and period label.

**Deliverables:**
- Usage card with: tier name row ("Plan: Starter"), period label ("March 2026"), captures progress bar with numeric label, storage progress bar with numeric label
- Progress bars with three visual states per the threshold table
- Accessible markup: progress bars should use `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-label`

**Dependencies:** Task 2 (API endpoint for usage data), Task 1 (copy and thresholds)

### Task 4: Implement contextual quota warning on captures list

**What:** When usage exceeds 80% of captures/month quota, show a dismissible warning banner between the submit form and the captures list. Banner should not reappear after dismissal within the same session (use a module-level flag, not localStorage -- dismissal should not persist across reloads since the situation may change).

**Deliverables:**
- Warning banner element with close button
- Conditional rendering based on usage data from boot (Task 2)
- "View usage" link navigating to `#/settings`
- At 100%: submit button disabled with "Monthly capture limit reached" label

**Dependencies:** Task 2 (usage data available at boot), Task 1 (copy)

### Task 5: Differentiate quota-exceeded 429 from rate-limit 429

**What:** Ensure the API returns a distinguishable 429 response when the rejection reason is quota exhaustion rather than rate limiting. The UI already handles 429 responses generically in `apiFetch` (shows "Too many requests. Please wait N seconds..."). Quota exhaustion needs different copy because the wait isn't seconds -- it's until the next billing period.

**Deliverables:**
- Problem Details response with `limitType: 'quota'` (or similar) and human-readable `detail` including reset date
- UI-side differentiation in `apiFetch` or in the submit form's error handler to show quota-specific messaging instead of rate-limit messaging
- Copy: "Monthly capture limit reached. Your quota resets on {date}."

**Dependencies:** Backend quota enforcement logic (not this minion's scope), Task 1 (error message copy)

---

## Risks and Concerns

### Risk 1: Quota data staleness during a session

The success criteria say "updates on page load (not real-time)." This is fine for the Settings/Usage dashboard, but introduces a subtle problem for the captures-list warning banner. If the user submits several captures after page load, the banner's threshold calculation becomes stale. The user might cross 80% without the banner appearing (low severity -- the 429 will still catch them) or the banner might show when they're no longer approaching the limit (very unlikely in the captures-up direction).

**Mitigation:** On each successful capture submission (the `prependPendingItem` path), locally decrement the remaining quota count. This keeps the banner state approximately correct without requiring a re-fetch.

### Risk 2: API-key auth users don't have session data

The dual-auth model means API-key users (`_authMethod === 'apikey'`) don't have `_wrlUser` data and don't see the Settings view. They won't see the Usage dashboard or the captures-list warning banner. This is acceptable for MVP -- API-key users are the legacy path and can check usage via the admin API -- but it should be explicitly documented as a known gap.

### Risk 3: Tier naming may need to change when monetization arrives

"Starter" is a good default name, but when paid tiers are introduced, the naming taxonomy needs to be coherent (Starter / Pro / Business, or Starter / Growth / Enterprise, etc.). The tier name should come from the backend (the `tier` field in the API response), not be hardcoded in the UI, so it can evolve without frontend changes.

### Risk 4: Progress bar accessibility

Progress bars are notoriously difficult to make accessible. The bar must work for screen readers (ARIA progressbar role), for users who can't distinguish colors (numeric labels alongside the bar), and for users with low vision (sufficient contrast in all three visual states). The frontend-minion should validate against WCAG AA contrast ratios for all three bar states against both light backgrounds and potential dark mode.

### Risk 5: "Starter" tier and zero-quota edge case

If the system needs to support a "paused" or "suspended" state where quotas are zero, the UI must handle 0/0 gracefully. A progress bar at 0/0 is meaningless. In this case, show a text-only state ("Account paused" or similar) rather than a degenerate progress bar.

---

## Additional Agents Needed

None. The current team composition (assuming backend, frontend, and testing specialists) is sufficient. The tasks above are split cleanly between:

- **Backend/API:** Task 2 (session response), Task 5 (quota-specific 429)
- **Frontend:** Task 3 (Usage card), Task 4 (warning banner)
- **UX strategy (this contribution):** Task 1 (information architecture, copy, thresholds)

One note: if the project has a **copy/content specialist**, the quota-related copy (error messages, banner text, tier labels) would benefit from a review pass. The copy I've suggested above is functional but hasn't been tested for tone consistency with the rest of the product. If no content specialist exists, the copy in Task 1 deliverables is ready to use.
