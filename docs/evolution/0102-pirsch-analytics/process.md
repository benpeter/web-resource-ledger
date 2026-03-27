# Process — Phase 0102: Pirsch Analytics Server-Side Tracking

## TL;DR

Six specialist agents planned, four reviewed, and one executed the
implementation across two sessions. The critical discovery was that Referer
headers are architecturally broken for cross-domain attribution in this
project — ux-strategy-minion caught this before any code was written,
saving the phase from building a non-functional analytics funnel. The
security review tightened input sanitization (dropping `%` from UTM regex,
adding Referer scheme validation). All 8 execution tasks completed without
rework, 1643 tests passed, 7 new tests added.

## Phase 1: Meta-Plan

Nefario identified six specialists for planning consultations:

1. **iac-minion** — Cloudflare Workers asset binding configuration
   (`run_worker_first`, `ASSETS` binding), CI workflow changes for secret
   provisioning, security header migration implications
2. **security-minion** — OAuth KV state enrichment risks, IP forwarding
   privacy, access key scope
3. **api-design-minion** — Initially proposed for pirsch.js module API
   surface design. Replaced after meta-plan re-run.
4. **frontend-minion** — Event instrumentation points, first-capture
   detection strategy
5. **test-minion** — Minimal test strategy for new Pirsch module and
   modified OAuth flow
6. **ux-strategy-minion** — Funnel attribution design: Referer vs explicit
   params for signup source tracking

Lucy adjusted the team once: removed api-design-minion (single-module API
design doesn't need a specialist) and confirmed the other five.

## Phase 2: Specialist Planning

Five agents ran in parallel. Key arguments from each:

**iac-minion** confirmed `run_worker_first = true` is required for the
Worker fetch handler to execute before static assets. Flagged that
`_headers` files stop being applied in this mode (per Cloudflare docs),
meaning security headers must move into Worker code. Provided exact
wrangler.toml configuration: `main = "src/index.js"`, `binding = "ASSETS"`
under `[assets]`. Recommended single `PIRSCH_ACCESS_KEY` across all three
Workers (write-only key, minimal blast radius).

**security-minion** approved storing attribution data alongside the PKCE
code verifier in KV (different threat model — attribution is debug data,
not auth material). Recommended sanitizing all attacker-controlled inputs
before KV storage: Referer URL validation, UTM regex without `%` to
prevent percent-encoded payloads, `from` param allowlisted to known
values. Confirmed GDPR Art. 6(1)(f) legitimate interest is appropriate
for cookieless, IP-based analytics with Pirsch's EU-only processing.

**frontend-minion** mapped all four event instrumentation points and
proposed three approaches for first-capture detection. Recommended D1
query (`SELECT SUM(capture_count)`) over KV flag (race-prone, eventually
consistent) and over incrementUsage return value (would require modifying
an existing function used elsewhere).

**test-minion** recommended the `log.test.js` pattern as the structural
template for `pirsch.test.js`. Advised against testing landing/docs
Workers (no test infrastructure, ~15-line handlers). Recommended 4-6
unit tests for the module boundary and 1-2 integration tests for
first-capture detection.

**ux-strategy-minion** delivered the phase's most important discovery:
Referer headers are architecturally non-functional for cross-domain
attribution. The API Worker sets `Referrer-Policy: no-referrer`
(src/index.js:709), the docs site also sets `no-referrer` (site/_headers),
and even the landing page's `strict-origin-when-cross-origin` only sends
the origin (not the path). Building attribution on Referer would produce
"unknown" for most signups. Proposed `?from=landing|docs` query params on
sign-in links as a deterministic attribution signal — invisible to users
since the auth/login URL 302-redirects immediately.

## Phase 3: Synthesis

Nefario resolved five conflicts:

1. **Referer vs `?from=`**: Adopted ux-strategy-minion's discovery. `?from=`
   as primary, Referer as secondary debug data. This was the biggest
   deviation from the original issue spec.

2. **Shared vs duplicated pirsch.js**: Single `src/pirsch.js` imported by
   all three Workers. iac-minion preferred self-contained copies per Worker
   for deployment isolation, but the module has zero npm dependencies and
   wrangler's esbuild resolves imports at build time. Three copies = three
   maintenance points.

3. **Security headers location**: Moved to Worker code. No alternative —
   `_headers` files don't work with `run_worker_first = true`.

4. **Event naming**: "Plan Upgrade" → "Payment Activated" because
   `handleCheckoutCompleted` fires for payment method addition and billing
   reactivation, not tier changes.

5. **sanitizeAttribution placement**: Inline in `src/oauth.js`. One call
   site, OAuth-specific. Extracting to a utility would be premature
   abstraction.

The execution plan had 8 tasks in 3 batches with one approval gate (Task 5,
the Worker fetch handlers that could take down static sites if buggy).

## Phase 3.5: Architecture Review

Four reviewers (Lucy removed ux-strategy-minion — no UI surface to review):

**security-minion (ADVISE)**: Two actionable findings incorporated. (1) Drop
`%` from the UTM regex to prevent percent-encoded XSS in stored attribution
data. (2) Validate Referer URL scheme (http/https only) after URL parse to
reject `javascript:` or `data:` URIs. Both were incorporated into Task 3.

**test-minion (ADVISE)**: Confirmed `log.test.js` as the correct template.
Flagged that first-capture integration tests need a dedicated fetchMock
helper and distinct tenantId. The integration test was ultimately deferred
— only the pirsch.js unit tests were created (7 tests covering all three
exports, no-op guards, payload structure, and error resilience).

**lucy (ADVISE)**: Confirmed all 12 success criteria were covered, with
criterion 12 (real browser verification) deferred to manual post-deploy.
Flagged that the evolution log index update was missing from the execution
plan — added to wrap-up.

**margo (ADVISE)**: Two suggestions evaluated and deferred. (1) Reduce 3
exports to 2 by merging trackEvent/trackEventRaw — declined because they
serve different Pirsch API endpoints and contexts (with/without Request
objects). (2) Use incrementUsage return value instead of separate D1 query
for first-capture detection — declined because modifying incrementUsage
changes an existing function used in multiple places, risk outweighs the
cost of one cheap indexed D1 read. Both deferrals documented in
decisions.md with rationale.

## Phase 4: Execution

All 8 tasks completed by frontend-minion (sonnet) without rework:

- **Batch 1** (parallel): Tasks 1-2 (pirsch.js module + sign-in link params)
- **Batch 2** (parallel, after Batch 1): Tasks 3-6 (OAuth attribution,
  event instrumentation, Worker fetch handlers, privacy policy)
- **Batch 3** (after Batch 2): Tasks 7-8 (CI workflows + tests)

The approval gate on Task 5 (Worker fetch handlers) passed — the
try/catch fallback pattern means a bug in tracking code falls through to
serving the static asset without headers, rather than returning a 500.

## Post-Execution Verification

- **Tests**: 1643 passed, 2 skipped (pre-existing), 0 failed
- **Code review**: All diffs verified against the execution plan
- **Documentation**: Privacy policy updated, subprocessors page updated,
  evolution log files written

## Human Interventions

This phase ran in autonomous mode (no interactive human gates). Lucy agents
handled all approval decisions. No human overrides were applied during
execution.

## Where to Read More

- Full specialist discussions: scratch directory (session-local, not persisted)
- Key decisions with rationale: [decisions.md](decisions.md)
- What was produced: [outcome.md](outcome.md)
- Original task description: [prompt.md](prompt.md)
