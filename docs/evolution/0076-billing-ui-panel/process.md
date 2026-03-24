# Phase 0076: Billing UI Panel -- Process

## TL;DR

Five specialists planned, six reviewers validated, four execution tasks produced a billing UI tab in ~20 minutes of agent time. The main conflict -- separate tab vs. inside Settings -- was resolved by issue scope and file size evidence. Code review caught two bugs (DOM leak, dead CSS class) that were auto-fixed before merge. 35 new tests, full suite green at 1215/1215.

## Planning Phase

### Specialists consulted (Phase 2)

1. **frontend-minion** -- Analyzed codebase patterns (ui-settings.js at 976 lines, IIFE module pattern, hash router). Recommended separate `ui-billing.js` module with dedicated route. Proposed 4 tasks.

2. **ux-strategy-minion** -- Argued billing should go INSIDE Settings as a section, not a 4th tab. Rationale: billing is "manage my account" not a distinct job; 4th tab increases cognitive load at 420px mobile. Proposed 3 tasks.

3. **accessibility-minion** -- Specified ARIA patterns: `role="progressbar"` with `aria-valuetext` for threshold bar (not raw cents), `role="status"` for grace_period vs `role="alert"` for blocked, `aria-describedby` for external Stripe link warning. Flagged potential aria-live pollution on refresh.

4. **security-minion** -- Confirmed `window.location.href` redirect is safe for Stripe portal. Recommended URL prefix validation (check for `billing.stripe.com` or `checkout.stripe.com` before redirect). Confirmed no CSP changes needed, existing rate limiting covers billing endpoints.

5. **test-minion** -- Designed test strategy: 6 partitions covering status display, CTA logic, eIDAS visibility, pure helpers, structural smoke, and security scan. Recommended `evalFromSource` pattern from existing `ui-settings-usage.test.js`.

### The main conflict

**frontend-minion** wanted a separate Billing tab with dedicated route. **ux-strategy-minion** wanted billing as a section inside Settings. Both had valid points:

- **For separate tab**: Issue #170 explicitly says "Billing tab"; settings already 976 lines and growing; separation of concerns matches existing pattern (each view is its own module).
- **For inside Settings**: Billing is account management, not a distinct user job; 4th tab adds cognitive load; mobile layout concern at 420px.

**Resolution**: Separate tab won. The issue scope was the tiebreaker -- when the product owner says "Billing tab", that's the deliverable shape. The file size argument (976 lines would become 1900+) made the engineering case. The ux-strategy-minion's information hierarchy recommendations (charges primary, tier secondary, payment status proportional to urgency) were still applied to the content within the tab.

## Architecture Review (Phase 3.5)

Six reviewers, all in parallel:

- **test-minion**: APPROVE
- **accessibility-minion**: ADVISE -- two items: (1) split aria-label and aria-valuetext to avoid double-announcement on progressbar, (2) add data-label attributes to tier table `<td>` for mobile responsive layout. Both incorporated into Task 1 prompt.
- **ux-strategy-minion**: APPROVE -- accepted the separate tab decision
- **margo**: APPROVE -- confirmed 4 tasks is proportional, no over-engineering
- **security-minion**: ADVISE -- three items: (1) document Stripe URL prefixes in validation, (2) smoke test CSP form-action compatibility with Stripe return, (3) handle NaN in formatCurrency. All incorporated.
- **lucy**: ADVISE -- three findings, all minor/informational: (1) verify evolution log handled at orchestration level, (2) IIFE insertion point wording is correct, (3) formatPeriod reuse across IIFE boundary is existing pattern. No plan changes needed.

Final tally: 3 APPROVE, 3 ADVISE, 0 BLOCK. Five advisories incorporated into task prompts.

## Execution (Phase 4)

### Batch 1 (parallel)

- **Task 1**: frontend-minion created `src/ui/ui-billing.js` (931 lines). Module exports `BILLING_JS` string constant with 6 pure helper functions, 6 section builders, Stripe redirect with URL prefix validation, full ARIA support. Gated -- Lucy approved after verifying all 5 criteria (export pattern, pure helpers, URL validation, ARIA roles, no innerHTML).

- **Task 2**: frontend-minion added billing CSS to `ui-css.js` (+70 lines). Stats row grid, tier table, status badges, responsive overrides at 640px with data-label mobile stacking.

### Batch 2 (parallel, after gate)

- **Task 3**: frontend-minion wired `#/billing` route into `ui-shell.js` and nav link into `ui-auth.js`. Import, IIFE section (after SETTINGS, before SCHEDULES), route with session-gate, nav link between Schedules and Settings.

- **Task 4**: test-minion created `test/ui-billing.test.js` (234 lines, 35 tests). 8 partitions covering all specified test areas plus additional thresholdClass coverage.

## Code Review (Phase 5)

Code reviewer found two issues:

1. **DOM leak**: eIDAS portal link click handler created a temporary button and appended it to the DOM on every click. `handlePortalRedirect` only reads `textContent` and `disabled`, so DOM insertion was unnecessary. Fix: don't append to DOM.

2. **Dead CSS class**: Tier table used `className = 'table'` (design system class) instead of `'billing-tier-table'`. This meant the billing-specific mobile responsive styles (hide thead, block display for td, data-label ::before) were unreachable. Fix: use `billing-tier-table`.

Both auto-fixed. Full test suite confirmed green (1215/1215).

## Human interventions

This was an autonomous execution. Lucy (governance agent) made all gate decisions:
- Team approval: APPROVE (5 specialists)
- Reviewer approval: auto-approved (no discretionary reviewers beyond accessibility-minion)
- Execution plan: APPROVE
- Task 1 gate: APPROVE
- Post-execution: "Run all"

No human overrides or adjustments.

## Where to read more

- Specialist discussions: `docs/history/nefario-reports/` (companion directory for this run)
- Full synthesis plan: scratch files preserved in report companion directory
- Issue: #170
