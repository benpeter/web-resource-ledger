## Domain Plan Contribution: frontend-minion

### Recommendations

#### 1. Contrast Investigation (Issue #211)

After reading the actual styles, the `.btn--github` button uses `background: var(--color-primary)` (#2a3444) with `color: var(--color-primary-text)` (#f8f8fa). That contrast ratio is approximately 10.5:1 -- well above WCAG AA 4.5:1. The GitHub Sign In button itself is fine.

The real contrast problem is likely one of these elements on the login screen:

- **`.auth-tagline`** uses `color: var(--color-text-muted)` (#6e6a66) on `var(--color-bg)` (#f7f6f5). That ratio is approximately 3.4:1 -- **fails WCAG AA** for normal text (requires 4.5:1). It is 0.875rem text (14px), not large text.
- **`.login-divider-text`** ("or" text) uses the same `var(--color-text-muted)` on `var(--color-surface)` (#ffffff). Ratio is approximately 3.9:1 -- also **fails AA** at that font size (0.8125rem / 13px).
- **`.login-apikey-label`** ("Already have an API key?") uses `var(--color-text-muted)` on `var(--color-surface)` -- same 3.9:1 failure.
- **`.btn--ghost` (Connect button)** uses `color: var(--color-primary)` (#2a3444) on `var(--color-surface)` (#ffffff) with `border-color: var(--color-border)` (#dddbd8). Text contrast is fine (~12:1). However, the border color against white is only about 1.6:1 -- this fails WCAG 2.2 AA non-text contrast (3:1 minimum for UI component boundaries). Ghost buttons with very light borders can appear disabled.

**Recommended fix approach:** Adjust the `--color-text-muted` design token from #6e6a66 to something darker. A value around #5c5855 would give approximately 4.7:1 against #f7f6f5 (bg) and 5.5:1 against #ffffff (surface), passing AA for both backgrounds. This is a single-token fix that addresses the tagline, divider text, and API key label simultaneously.

For the ghost button border, darken `--color-border` from #dddbd8 to approximately #b8b5b1 (3.1:1 against white). However, this token is used broadly (cards, sections, tables, inputs) so the change impact is wide. Alternative: add a `--color-border-interactive` token used only for interactive element borders (buttons, inputs), keeping the decorative border lighter.

**Caution:** Changing `--color-text-muted` is safe (used for labels and secondary text -- making them more readable is strictly better). Changing `--color-border` requires visual review across all components since it's the most widely-used border token.

#### 2. Billing Status Dedup (Issue #190)

The duplication is confirmed in the code:

- **`buildRefreshRow()` (line 766):** Renders `"Status: " + billingStatusLabel(usageData.billingStatus)` as a persistent text label in the refresh row above all billing sections. This is always visible regardless of status.
- **`buildPaymentSection()` (line 622+):** Renders status-specific UI:
  - For `active` + payment method: a green `badge--pass` reading "Payment method active"
  - For `free`: an info alert "No payment method required..."
  - For `grace_period`/`blocked`: warning/error banners from `buildStatusBanner()`

When status is `active`, the user sees both "Status: Active" in the refresh row AND "Payment method active" badge in the Payment section -- redundant and potentially confusing.

**Recommended fix:** Remove the status text from `buildRefreshRow()`. The refresh row should contain only the refresh button (and optionally a "Last updated" timestamp). The billing status is already communicated through:
1. The status banner (for grace_period/blocked -- prominent alerts)
2. The Payment section badge/text (for all states)
3. The aria-live region announcements on refresh

This removal improves clarity without losing information. The refresh button remains for its utility.

For accessibility: the billing status is still announced via the `billingAnnounce()` call in `refreshBillingData()` when status changes, so screen reader users continue to get status updates. No a11y regression.

#### 3. Docs Link Placement (Issue #210)

The authenticated nav is built in `renderAppShell()` (ui-auth.js, line 136). Session-authenticated users see: Captures, Schedules, Billing, Notifications, Settings. API-key users see only Captures.

**Recommended placement: Add to the nav bar as the last link in `navLinks`, with an external-link indicator.**

Rationale:
- Footer is not present in the current SPA shell -- would need new DOM structure.
- Settings is the wrong home -- docs are not a setting.
- Nav bar is where users look for navigation. Documentation is a navigation target.
- External links in nav bars are common; the external icon (arrow-up-right) signals the behavior.

Implementation details:
- Add after the Settings link (or after Captures for API-key users) so it appears at the end of the nav.
- Use `target="_blank"` with `rel="noopener"` for security.
- Add an inline SVG external-link icon (small, 12px, `aria-hidden="true"`).
- Add `aria-label="Documentation (opens in new tab)"` or append visually hidden text "(opens in new tab)" for screen readers. WCAG 2.2 SC 3.2.5 recommends warning users about context changes.
- Style with `.nav-link` class for consistency. The icon differentiates it from SPA links.
- Show for both session and API-key auth modes -- API-key users may also need docs.

#### 4. Tenant Key Creation Notification (Issue #200)

This is a backend/worker concern, not a frontend one. The admin API endpoint that creates keys (`POST /v1/admin/keys`) runs in the Worker. The notification fires server-side, invisible to the UI.

**Frontend has no work here** unless we want to add a notification preferences UI for admin alerts. That should be a separate issue, not part of this batch.

From a frontend perspective, I have no objections to the fire-and-forget pattern -- it is correct that this must not block the key creation response. The implementation choice (Coralogix log alert vs. Resend email) is a backend decision.

### Proposed Tasks

#### Task 1: Fix low-contrast text on login screen
**Files:** `src/design-system.js` (token change), possibly `src/ui/ui-css.js` (if adding `--color-border-interactive`)
**Changes:**
1. Darken `--color-text-muted` from `#6e6a66` to approximately `#5c5855` (verify exact value with contrast checker against both `--color-bg` and `--color-surface`)
2. Optionally: add `--color-border-interactive` token for ghost button borders (separate from decorative `--color-border`)
3. Verify all `.text-muted` usages across the app remain visually appropriate after the change
**Estimate:** Small. Token change is 1 line; impact audit is reading through CSS usages.

#### Task 2: Remove duplicate billing status display
**Files:** `src/ui/ui-billing.js`
**Changes:**
1. In `buildRefreshRow()`, remove the `leftEl` span that renders "Status: ..." (lines 763-766)
2. Keep the refresh button; optionally add "Last updated: [time]" text in place of the status
3. Verify the aria-live announcement in `refreshBillingData()` still works correctly
**Estimate:** Small. ~5 lines removed, no new logic.

#### Task 3: Add docs link to authenticated nav
**Files:** `src/ui/ui-auth.js`, `src/ui/ui-css.js`
**Changes:**
1. In `renderAppShell()`, add a docs link element after the last nav link (for both session and apikey auth paths)
2. Use `href="https://docs.webresourceledger.com"`, `target="_blank"`, `rel="noopener"`
3. Add inline SVG external-link icon (12x12, `aria-hidden="true"`, `fill="currentColor"`)
4. Add `.nav-link--external` CSS class for the icon spacing
5. Include screen reader text "(opens in new tab)"
**Estimate:** Small. ~20 lines JS, ~5 lines CSS.

#### Task 4: Tenant key creation notification (backend only)
**Files:** None in frontend scope.
**Note:** Delegate entirely to backend/worker implementation. If admin notification preferences UI is desired, open a separate issue.

### Risks and Concerns

1. **Design token `--color-text-muted` change is global.** It affects every `.text-muted` usage, every `data-label`, section headings, billing stat labels, etc. The change makes text more readable everywhere, which is generally positive, but needs a visual check across all views (Captures, Schedules, Billing, Notifications, Settings) to confirm the muted text still feels secondary. Recommend testing in browser before merging.

2. **Ghost button border contrast.** The `.btn--ghost` border uses `--color-border` which is shared with cards, tables, inputs, and dividers. Darkening it globally changes the visual weight of the entire UI. A targeted `--color-border-interactive` token is safer but adds token surface area. Consider deferring the border fix to avoid scope creep -- the text contrast fixes are higher priority (more visible, more clear-cut WCAG violations).

3. **Docs link and responsive nav.** On very small screens (< 420px), the nav already stacks vertically. Adding a sixth link increases the nav height. At the current count (5 links), the nav is already crowded on mobile. Test on 320px viewport to ensure the docs link does not push content below the fold excessively. If it does, consider hiding it on mobile or moving to an overflow menu -- but that adds complexity beyond a "small fix."

4. **No automated contrast testing in CI.** These contrast fixes are manual and could regress if someone changes the tokens. Consider adding a comment in `design-system.js` next to `--color-text-muted` noting the minimum contrast ratio it must maintain. Automated a11y testing (axe-core in Playwright) would catch regressions but is out of scope for this batch.

### Additional Agents Needed

- **Backend/Worker agent** for Task 4 (tenant key creation notification). This is entirely server-side: the admin key creation handler in the Worker needs to fire a notification after successful key creation. Frontend has no involvement.
- No additional agents needed for Tasks 1-3; these are pure frontend work.
