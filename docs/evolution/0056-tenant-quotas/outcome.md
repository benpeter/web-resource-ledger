# Outcome: R26 Tenant Quotas

## What was built

Per-tenant usage quotas for WRL. Tenants are assigned tiers (free/pro) with
default capture and storage limits. The capture pipeline enforces quotas before
accepting work, and tenants can view their usage in the web UI settings page.

### New files

| File | Purpose |
|------|---------|
| `migrations/0005_tenant_tiers.sql` | Adds `tier` column to tenants table |
| `src/quotas.js` | Quota constants, `checkQuota`, `getEffectiveQuota`, `computeQuotaReset` |
| `test/quotas.test.js` | 21 unit tests for quota module |
| `test/quota-enforcement.test.js` | 14 integration tests for pipeline quota check |
| `test/account-usage.test.js` | 23 tests for usage endpoint |
| `test/ui-settings-usage.test.js` | 58 UI tests for dashboard, formatBytes, ARIA |
| `site/content/limits.md` | Consolidated "Limits & Quotas" docs guide (171 lines) |

### Modified files

| File | Change |
|------|--------|
| `src/index.js` | Quota check in handleCreateCapture and handleBatchCapture; route for usage endpoint; buildQuotaHeaders helper; quotas catch block |
| `src/db.js` | Quota override validation in setTenantConfig; setTenantTier function; VALID_TIERS export |
| `src/account.js` | `handleAccountGetUsage` handler reusing checkQuota |
| `src/ui/ui-settings.js` | Usage dashboard with progress bars, formatBytes, formatPeriod, refresh button |
| `src/ui/ui-css.js` | Usage section styles (bars, thresholds, refresh button) |
| `src/ui/ui-submit.js` | Quota-specific 429 handling with reset date |
| `openapi.yaml` | QuotaDetail, UsageMetric, AccountUsageResponse schemas; X-Quota-* headers; updated 429 |
| `test/db.test.js` | 16 new tests for quota validation and setTenantTier |
| `site/content/batch.md` | Cross-reference to limits guide |
| `site/_data/site.js` | Nav entry for limits page |
| `site/content/index.md` | Cross-reference to limits guide |

### Numbers

- 18 files changed, +2410/-20 lines
- 7 commits on `nefario/tenant-quotas` branch
- 991 tests pass across 37 test files
- 132 new tests added (21 + 14 + 23 + 58 + 16)

## What deviated from the plan

1. **formatBytes MB ternary bug** -- Phase 5 code review caught that the MB
   branch in `formatBytes` had `.toFixed(n % 1000000 === 0 ? 0 : 0)` -- both
   branches returning 0, which silently discarded fractional precision for MB
   values. Fixed to `.toFixed(n % 1000000 === 0 ? 0 : 1)` in a separate commit.

2. **Phase 3.5 advisory incorporation** -- Several adjustments from reviewers
   were woven into task prompts rather than treated as deviations:
   - security-minion: catch block for quotas validation errors (Task 1)
   - Lucy/Margo: reuse checkQuota in usage endpoint (Task 3)
   - Margo: extract computeQuotaReset and buildQuotaHeaders helpers (Tasks 1, 2)
   - accessibility-minion: ARIA value formatting for storage bars (Task 4)
   - ux-strategy-minion: manual refresh button (Task 4)

3. **Team composition adjustment** -- Initial meta-plan had 5 specialists.
   Lucy review added ux-strategy-minion and software-docs-minion (flagged as
   "ALWAYS include" in cross-cutting checklist). This triggered a Phase 1
   re-run, not a deviation from the workflow.

## Issues created

None.

## Backlog changes

- **Marked done**: R26 (Tenant Quotas) in Product Features parking lot --
  `[consider] Billing and quotas` marked done
- **Deferred**: Per-endpoint differentiated quotas (only captures and storage
  for now, per issue scope). Already tracked in parking lot as
  `[consider] Per-endpoint differentiated limits`.
- **No new parking lot items** -- all scope items were delivered. The "storage
  cleanup/eviction on quota breach" and "quota alerts/notifications" exclusions
  were already out-of-scope per the issue definition.

## Surprises

- The D1 `db.batch()` pattern (two PK lookups in one round-trip) was trivially
  fast -- no evidence that KV caching would ever be needed. The iac-minion's
  YAGNI recommendation was well-calibrated.
- Auto-provisioned tenants getting the free tier via `DEFAULT 'free'` on the
  column meant zero changes to the OAuth signup flow from Phase 0055. The
  `INSERT OR IGNORE INTO tenants(id)` in the signup handler picks up the default.
- The accessibility-minion Phase 3.5 review (discretionary reviewer) caught a
  legitimate WCAG concern: progress bars for storage bytes need
  `aria-valuenow` in human-readable format (formatBytes), not raw byte counts.
