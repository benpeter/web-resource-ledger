# Outcome — Phase 0102: Pirsch Analytics Server-Side Tracking

## What Was Built

Server-side Pirsch Analytics tracking across all three WRL Cloudflare Workers,
with cross-domain funnel attribution and zero client-side JavaScript.

### New Files
- `src/pirsch.js` — Fire-and-forget tracking module (3 exports: `trackHit`,
  `trackEvent`, `trackEventRaw`). Follows `src/log.js` pattern exactly.
- `landing/src/index.js` — Worker fetch handler wrapping `env.ASSETS.fetch()`
  with security headers + Pirsch page view tracking.
- `site/src/index.js` — Same pattern for the docs site.
- `test/pirsch.test.js` — 7 unit tests covering all three exports, no-op guards,
  payload structure, and error resilience.

### Modified Files
- `src/oauth.js` — `sanitizeAttribution()` helper for input validation; KV state
  enriched with `from`, `referer`, UTM params; Signup event fires for new users.
- `src/index.js` — First Capture event (D1 query before `incrementUsage`).
- `src/billing.js` — Payment Activated event in `handleCheckoutCompleted`.
- `src/schedules.js` — Schedule Created event in `handleCreateSchedule`.
- `landing/wrangler.toml` — Added `main`, `binding = "ASSETS"`, `run_worker_first = true`.
- `site/wrangler.toml` — Same additions.
- `landing/public/privacy.html` — Pirsch as third-party processor, analytics
  disclosure, legitimate interest basis, effective date updated.
- `site/content/security/subprocessors.md` — Pirsch added.
- 7 landing HTML files + `site/_includes/layouts/base.njk` — `?from=` params on
  sign-in links.
- `.github/workflows/deploy-landing.yml` — PIRSCH_ACCESS_KEY secret provisioning.
- `.github/workflows/deploy-docs.yml` — Same.
- `vitest.config.js` — Test binding for PIRSCH_ACCESS_KEY.

### Events Tracked

| Event | Location | Trigger | Has Request? |
|-------|----------|---------|-------------|
| Page View (hit) | landing/docs Workers | Every page load | Yes |
| Signup | `handleAuthCallback` | `isNewUser === true` | Yes |
| First Capture | Queue consumer | `usage_counters` sum is 0 | No (uses trackEventRaw) |
| Payment Activated | `handleCheckoutCompleted` | Stripe webhook | No (uses trackEventRaw) |
| Schedule Created | `handleCreateSchedule` | After schedule insert | Yes |

## Deviations from Original Plan

1. **"Plan Upgrade" renamed to "Payment Activated"** — `handleCheckoutCompleted`
   fires for payment method addition, not tier changes. The rename accurately
   reflects the trigger.

2. **`?from=` param added as primary attribution signal** — ux-strategy-minion
   discovered Referer is architecturally non-functional (API Worker sets
   `Referrer-Policy: no-referrer`). The `?from=landing|docs` param on sign-in
   links provides deterministic attribution.

3. **Security headers moved from Transform Rules to Worker code** — Required
   because `run_worker_first = true` bypasses `_headers` files and Transform
   Rules may not apply consistently.

## Test Results

- 1643 tests passed, 2 skipped (pre-existing), 0 failed
- 7 new tests in `test/pirsch.test.js`
- All existing tests unaffected

## Surface Consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — no new/changed API endpoints |
| Docs site | Updated: subprocessors page with Pirsch disclosure |
| Landing page | Updated: privacy policy, sign-in links with `?from=landing` |
| MCP server | No update needed — no new API endpoints for MCP tools |
| Legal pages | Updated: privacy policy (analytics section, processor table, legal basis) |

## Backlog Changes

- Completed: "Server-side analytics with Pirsch" (from marketing/growth tier)
- Deferred to parking lot: "Retire Cloudflare Transform Rule for landing page
  security headers" (manual dashboard step, post-deploy)
- Deferred: Criterion 12 — "Tracking verified with real browser on residential
  IP" (requires manual post-deploy testing, datacenter IPs may be filtered)

## What Went Well

- The ux-strategy-minion's discovery that Referer is broken saved the project
  from building a non-functional attribution system.
- The `src/log.js` pattern provided an exact structural template, making
  `src/pirsch.js` straightforward to implement and test.
- All 8 execution tasks completed without errors or rework.

## What Could Be Better

- The first-capture detection adds a D1 read per capture on the success path.
  Margo suggested using `incrementUsage`'s return value instead, which was
  deferred for safety. Worth revisiting if capture volume grows significantly.
- Landing and docs Workers now have no test infrastructure. If they grow beyond
  asset serving + analytics, test setup should be added.
