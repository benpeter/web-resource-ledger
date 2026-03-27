# Decisions — Phase 0102: Pirsch Analytics Server-Side Tracking

## Attribution Mechanism

**Chosen**: `?from=landing|docs` query parameter as primary attribution signal, Referer stored as secondary debug data.

**Over**: Referer-only attribution as originally specified in the issue.

**Why**: ux-strategy-minion discovered during Phase 2 that Referer is architecturally non-functional for cross-domain attribution in this project. The API Worker sets `Referrer-Policy: no-referrer` (src/index.js:709), the docs site also sets `no-referrer` (site/_headers:4), and even the landing page's `strict-origin-when-cross-origin` only sends the origin (not the path) on cross-origin requests. Building attribution on Referer would produce an analytics system that silently reports "unknown" for most signups. The `?from=` param is invisible to users (the auth/login URL 302-redirects immediately to GitHub) and provides deterministic, reliable attribution.

## Event Naming: "Payment Activated" vs "Plan Upgrade"

**Chosen**: `Payment Activated`

**Over**: `Plan Upgrade` (original issue spec), `Payment Method Added` (frontend-minion suggestion)

**Why**: `handleCheckoutCompleted` fires when a payment method is added via Stripe Checkout and billing is reactivated. There is no subscription tier logic in this handler. "Plan Upgrade" misleadingly implies a tier change. "Payment Method Added" is too narrow — the handler also reactivates billing. "Payment Activated" accurately describes the composite action.

## Shared Module vs Per-Worker Copies

**Chosen**: Single `src/pirsch.js` imported by all three Workers via relative path.

**Over**: Self-contained copies in each Worker's `src/` directory, npm package.

**Why**: The module has zero npm dependencies. Wrangler's esbuild bundler resolves relative imports at build time and produces self-contained bundles. Three copies means three files to update when the Pirsch API changes. The iac-minion's concern about cross-directory imports is valid for npm-dependent code but does not apply here.

## Security Headers: Worker Code vs Transform Rules

**Chosen**: Move security headers into Worker fetch handler code.

**Over**: Continue relying on Cloudflare Transform Rules and `_headers` files.

**Why**: iac-minion confirmed that `_headers` files stop being applied when `run_worker_first = true` is set (per Cloudflare docs), and this setting is required for the tracking to execute. Transform Rules are invisible to version control and cannot be tested. Moving headers into code creates a single, auditable source of truth. This is necessary scope, not scope creep — the alternative is broken security headers.

## Attribution Sanitization Location

**Chosen**: Inline `sanitizeAttribution()` helper in `src/oauth.js`.

**Over**: Separate utility file, placement in `src/pirsch.js`.

**Why**: The function is OAuth-specific (processes auth login request's Referer and UTM params before KV storage). It has exactly one call site. Extracting to a utility would be premature abstraction per YAGNI. Placing in pirsch.js would couple analytics with input sanitization.

## Login Event: Explicitly Excluded

**Chosen**: Do NOT implement Login event tracking.

**Over**: Including Login as a 5th funnel event.

**Why**: ux-strategy-minion analysis showed Login fails the "what decision would this change?" test. It's the highest-frequency event with the least actionable signal. At early stage, it consumes Pirsch billing quota (events count as pageviews) for data that doesn't change any marketing or product decision. The activation funnel (Signup → First Capture) already measures the critical drop-off. Login can be added later as a single `trackEvent` call with zero schema migration.

## First-Capture Detection: D1 Query

**Chosen**: `SELECT COALESCE(SUM(capture_count), 0)` from `usage_counters` before incrementUsage.

**Over**: KV flag (race-prone, eventually consistent), incrementUsage return value (fragile RETURNING semantics).

**Why**: D1 is strongly consistent within a Worker invocation. The query is cheap (indexed by tenant_id). The race window is minimal for new tenants. A duplicate event in the unlikely race scenario is acceptable — it's analytics, not billing.

## Two-Tier API Surface

**Chosen**: Three exports: `trackHit`, `trackEvent` (request-based), `trackEventRaw` (data-based).

**Over**: Single API requiring request objects everywhere.

**Why**: Queue consumer (handleCaptureMessage) and billing webhook (handleCheckoutCompleted) lack Request objects. Forcing a synthetic Request would be an unnecessary abstraction. The raw tier accepts `{ url, ip, userAgent, referrer }` directly. Margo may flag the three exports as potentially over-engineered — but the alternative is worse: either synthetic Request construction or omitting events from contexts without requests.

## Test Coverage Scope

**Chosen**: Test pirsch.js module boundary (4-6 tests) + first-capture integration (1-2 tests). Skip landing/docs Workers, OAuth enrichment, Schedule Created, Payment Activated.

**Over**: Comprehensive tests for every instrumentation point.

**Why**: test-minion analysis: pirsch.js is the one new external boundary. Other instrumentation points are function-call wiring — if the module correctly constructs payloads, the callers just pass arguments. Landing/docs Workers have zero test infrastructure and the handlers are ~15 lines. Per CLAUDE.md's "test the real boundaries" philosophy, test the boundary (pirsch.js) and the novel logic (first-capture detection), not the wiring.
