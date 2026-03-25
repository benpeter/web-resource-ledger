# Outcome: UI/UX Fixes Batch (#213)

## What Was Built

Four small fixes batched into a single phase, addressing GitHub issues #211, #190, #210, and #200.

### Fix A: Low-contrast muted text (#211)

Changed `--color-text-muted` from `#6e6a66` to `#595550` in both `src/design-system.css` and `src/design-system.js`. New contrast ratios: 6.85:1 against `--color-bg` (#f7f6f5), 7.39:1 against `--color-surface` (#ffffff). Both exceed WCAG AA 4.5:1 requirement.

The original issue reported "Sign In button" contrast, but investigation by all four planning specialists confirmed the `.btn--github` button has 10.5:1 contrast (fine). The actual problem was the `--color-text-muted` token used for tagline, divider, and label text.

### Fix B: Billing status dedup (#190)

Removed the `leftEl` span from `buildRefreshRow()` in `src/ui/ui-billing.js` (5 lines). The refresh row now contains only the refresh button. Status information is communicated exclusively through `buildPaymentSection()` badges/banners and `buildStatusBanner()` alerts, eliminating the duplicate display.

Screen reader announcements via `billingAnnounce()` and the `aria-live` region are preserved.

### Fix C: Docs link in authenticated nav (#210)

Added a "Docs" link to `navActions` (right side of nav bar) in `src/ui/ui-auth.js`, visible for both session and API-key authenticated users. The link:
- Points to `https://docs.webresourceledger.com`
- Opens in new tab with `rel="noopener noreferrer"`
- Includes a 12x12 external-link SVG icon with `aria-hidden="true"`
- Includes `.sr-only` span "(opens in new tab)" as a child of the anchor

Also added:
- `.nav-link--external` and `.sr-only` CSS rules in `src/ui/ui-css.js`
- External URL guard in `updateNavCurrent()` in `src/ui/ui-shell.js`

### Fix D: Operator key-creation notification (#200)

Zero code changes. Documented Coralogix alert configuration in `docs/operations/alerts.md` with a new runbook at `docs/operations/runbooks/new-api-key-created.md`. Updated `scripts/provision-alerts.sh` with the alert payload function.

The existing `admin.key_create` log event in `src/admin.js` already emits all required fields. A Coralogix alert on this event is simpler and more appropriate than building an email pipeline via Resend.

HUMAN_ACTION_REQUIRED: Create the Coralogix alert rule manually in the dashboard using the configuration documented in `docs/operations/alerts.md`, or run `scripts/provision-alerts.sh` to provision via API.

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/design-system.css` | Token value change | +1/-1 |
| `src/design-system.js` | Token value change (sync) | +1/-1 |
| `src/ui/ui-billing.js` | Remove status text from refresh row | -6 |
| `src/ui/ui-auth.js` | Add docs link to navActions (both auth paths) | +22 |
| `src/ui/ui-css.js` | Add .nav-link--external and .sr-only CSS | +19 |
| `src/ui/ui-shell.js` | Add external URL guard in updateNavCurrent | +2 |
| `test/ui-billing.test.js` | Billing dedup regression test | +16 |
| `test/ui-dashboard.test.js` | Design token sync + docs link tests | +44 |
| `docs/operations/alerts.md` | New API Key Created alert section | +32 |
| `docs/operations/runbooks/new-api-key-created.md` | New runbook (new file) | +56 |
| `scripts/provision-alerts.sh` | Alert provisioning function | +38 |

## Test Results

All 1519 tests pass across 60 test files (2 pre-existing skips). New tests:
- 5 new tests in `ui-billing.test.js` (billing dedup guard)
- 11 new tests in `ui-dashboard.test.js` (design token sync, docs link coverage)

## Surface Consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — no API endpoints changed |
| Docs site | No update needed — the docs link itself IS the new docs affordance |
| Landing page | No update needed — landing page uses its own CSS, not the design system tokens |
| MCP server | No update needed — no API changes |
| Legal pages | No update needed — no new data collection or third-party integrations |

## Backlog Changes

- **Updated**: `[consider] Fix --color-text-muted contrast on landing page` — marked as partially addressed (app token fixed; landing page uses own CSS)
- **Added**: `[consider] Ghost button border contrast (--color-border)` — deferred from this batch, with note about `--color-border-interactive` token approach

## What Deviated From Plan

Nothing significant. The iac-minion went slightly beyond the plan by also updating `scripts/provision-alerts.sh` (the plan only called for ops-runbook.md), but this is a natural extension — the project already has an alert provisioning script, and adding the new alert to it is more useful than docs-only.
