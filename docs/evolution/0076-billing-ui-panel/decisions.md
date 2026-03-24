# Phase 0076: Billing UI Panel -- Decisions

## D1: Separate Billing tab vs. billing inside Settings

**Chosen**: Separate `#/billing` route with dedicated `ui-billing.js` module
**Over**: Adding billing as a section inside `ui-settings.js` (ux-strategy-minion recommendation)
**Why**: Issue #170 explicitly requests a "Billing tab"; settings is already 976 lines and adding billing would push it past maintainable size; separate module follows the established per-view pattern (ui-schedules.js, ui-settings.js). The ux-strategy-minion's argument (billing is "manage my account" not a distinct job) was considered but outweighed by the explicit issue scope and file size concern.

## D2: Stripe portal opens in same tab (redirect) vs. new tab

**Chosen**: Same-tab redirect via `window.location.href`
**Over**: `target="_blank"` new tab
**Why**: Stripe portal is designed as a redirect flow with `returnUrl` already configured to `/ui#/billing`; same-tab maintains the "managing my billing" mental model. The `aria-describedby` warning pattern still applies (user is leaving WRL), but the navigation is a redirect not a new tab.

## D3: Tier table collapsed by default vs. always visible

**Chosen**: Collapsed with "View all tiers" disclosure toggle using `<details>`/`<summary>`
**Over**: Always-visible full tier table
**Why**: ux-strategy-minion correctly identified tiers as reference information, not operational information. Most users are on Free or Standard tier -- showing all four tiers by default is noise for the majority. Progressive disclosure reduces cognitive load. Current tier is always visible inline.

## D4: eIDAS section -- defensive absence handling vs. blocking on backend

**Chosen**: Ship billing tab with defensive checks for eIDAS data absence; show "View in Stripe" fallback
**Over**: Blocking the billing tab on a backend change to add eIDAS counts to `/v1/account/usage`
**Why**: The eIDAS data gap is a known limitation (eidas_capture_count exists in usage_counters but isn't in the API response yet). Shipping the tab without blocking on backend work is pragmatic -- the eIDAS section will auto-activate when the backend is extended later.

## D5: Code review fixes

Two issues found during code review and auto-fixed:
1. **DOM leak in eIDAS portal link**: Click handler appended a temporary button to the DOM on every click without cleanup. Fixed by not appending to DOM (handlePortalRedirect only needs textContent + disabled).
2. **Dead CSS class**: Tier table used `className = 'table'` (design system class) instead of `'billing-tier-table'` (billing-specific class). Mobile responsive styles were unreachable. Fixed to use `billing-tier-table`.
