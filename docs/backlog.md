# Backlog

Product roadmap produced by advisory orchestration (2026-03-15). See
[advisory report](history/nefario-reports/2026-03-15-103905-prioritized-product-roadmap.md)
and [synthesis](history/nefario-reports/2026-03-15-103905-prioritized-product-roadmap/phase3-synthesis.md)
for full rationale, conflict resolutions, and specialist contributions.

## Tier Definitions

- **[must:condition]** -- required before a stated condition (e.g., `[must:multi-user]`
  means "must ship before a second user touches WRL"). Not unconditionally urgent.
- **[should]** -- strong consensus it's needed, no hard commitment yet
- **[consider]** -- may or may not be needed; parked with activation trigger

---

## Act 1: Solid Foundation (near-term, next 1-3 phases)

These close the trust gaps (recoverability, verifiability) and handle quick-win
security hardening for the current single-operator use case.

- ~~#38 **R8: Auth identity enrichment** [S]~~ -- DONE: internal refactor, prerequisite for R1
- ~~#31 **R1: List captures endpoint** [M]~~ -- DONE: eliminates lost-ID problem; depends on R8
- ~~#32 **R2: Key versioning and public key archive** [M]~~ -- DONE: keyId in signedData, /.well-known/signing-keys, historical key lookup
- ~~#33 **R3: CORS for capture POST** [S]~~ -- DONE: configurable origin allowlist, preflight handler, CORS headers on all POST responses including errors
- ~~#34 **R4: HSTS preload submission** [XS]~~ -- DONE: `preload` directive added; post-merge: submit domain to hstspreload.org
- ~~#35 **R5: X-RateLimit-Limit header** [XS]~~ -- DONE: per-IP ceiling on rate-limited endpoints; global limiter 503s omit header
- ~~#36 **R6: Hashed IP logging** [S]~~ -- DONE: HMAC-SHA256 `cip` field in all log entries
- ~~#37 **R7: Content moderation policy and ToS** [S]~~ -- DONE: TERMS.md + CONTENT-POLICY.md at repo root, Link header on all responses
- ~~#39 **R9: Staging environment** [S]~~ -- DONE: wrangler.toml env.staging, deploy-staging.yml, smoke-test.sh
- ~~#40 **R10: Backlog cleanup and restructure** [S]~~ -- DONE: this document

## Act 2: Evidence-Grade (mid-term)

Upgrade integrity claims from self-asserted to independently verifiable. Make the
word "evidence" defensible.

- ~~#41 **R11: RFC 3161 timestamp integration** [L]~~ -- DONE: Sectigo TSA integration, dual-screenshot consent, RFC 3161 temporal proof
- ~~#42 **R12: Per-tenant API keys and tenant isolation** [L]~~ -- DONE: KV-based key management, admin API, dual-mode legacy fallback, scope enforcement
- ~~#43 **R13: Audit logging** [S]~~ -- DONE: structured audit fields on all authenticated request and admin key lifecycle events
- ~~#44 **R14: Production CD pipeline** [M]~~ -- DONE: deploy-production.yml, OPERATIONS.md, environment protection

## Act 3: Infrastructure (longer-horizon)

Expand WRL into a platform that other tools and agents build on.

- ~~#45 **R15: MCP server for web evidence** [M]~~ -- DONE: MCP adapter with 4 tools (capture_url, get_capture, list_captures, verify_capture), Streamable HTTP transport, docs, server.json registry
- ~~#46 **R16: Queue migration for capture processing** [M]~~ -- DONE: Cloudflare Queue producer/consumer, exponential backoff retry, DLQ, 15-min rendering budget
- ~~#47 **R17: Web UI for capture submission** [M]~~ -- DONE: Browser-based UI at GET /ui with auth gate, capture submission, list with pagination, detail view with polling, 38 tests, vanilla JS/CSS
- ~~#48 **R18: Batch capture endpoint** [M]~~ -- DONE: POST /v1/captures/batch with 207 Multi-Status, per-URL SSRF validation, sequential rate limit consumption

---

## Parking Lot

Deferred items with explicit activation triggers. Revisit when condition is met.

### Auth (R12 shipped -- next wave)

| Item | Condition | Source |
|------|-----------|--------|
| ~~[must:multi-user] API key rotation without downtime~~ | ~~When R12 (per-tenant keys) ships~~ -- R12 shipped; key rotation now possible via create + revoke flow | security-minion, kickoff |
| ~~[must:multi-user] Tenant isolation / RBAC~~ | ~~Folded into R12~~ -- DONE: tenantId in KV records, capture list scoped to tenant | security-minion, kickoff |
| ~~[consider] Per-tenant rate limiting~~ | ~~R12 shipped~~ -- DONE: dual-layer enforcement (CF ceiling + KV counter + IP guard), admin config endpoints, X-RateLimit-* headers | Phase 0045 |
| [consider] Per-endpoint differentiated limits | When different endpoints need different per-tenant limits (currently all share `capture` group) | Phase 0045 |
| ~~[consider] Billing-tier-based limits~~ | Superseded: usage-based pricing model adopted 2026-03-23 (no tiers). See R29/R31 for billing implementation. | Phase 0045 |
| ~~[consider] OAuth for web UI~~ | ~~R17 shipped with API key auth~~ -- DONE (Phase 0055): GitHub OAuth self-serve signup, dual-auth boot (session + API key), account settings with key CRUD | security-minion, kickoff, Phase 0049 |
| [should] Evaluate auth requirement for GET /v1/captures/{id} post-multi-tenant | When a second tenant is onboarded; current ID-as-secret model reviewed in SECURITY.md | security-minion, Phase 0037 |

### Signing and Legal

| Item | Condition | Source |
|------|-----------|--------|
| ~~[consider] eIDAS Qualified TSA~~ | Activated: moved to Act 5 as R40. Sectigo free qualified endpoint for launch, qtsa.eu prepaid for scale. Per-account opt-in, +$0.10/capture. | gru, kickoff |
| [consider] WACZ-Auth full spec compliance | When a production toolchain consumes WACZ-Auth signatures | gru, kickoff |
| [consider] Multiple TSAs for redundancy | 6+ months after R11 ships; based on observed TSA reliability | gru, kickoff |
| [consider] HSM-backed key storage | When FIPS 140-2 Level 3 explicitly required or multi-tenant key management at scale | security-minion, kickoff |
| [consider] CRL/OCSP revocation checking in CLI verify | When a TSA certificate revocation incident occurs or compliance requires it; offline requirement conflicts | security-minion, 0034-cli-verify-tool |
| ~~[should] Publish @w-r-l/verify to npm~~ | ~~Done: CI automation in place (#98, 0050)~~ | ~~devx-minion, 0034-cli-verify-tool~~ |
| [consider] OIDC Trusted Publishing for npm | When Node 24+ ships npm 11+; eliminates token rotation | security-minion, 0050-npm-publish-ci-automation |

### Capture Fidelity

| Item | Condition | Source |
|------|-----------|--------|
| ~~[should] Screenshot timing / wait-for-load~~ | ~~When a user reports incomplete renders~~ | DONE (0029-load-settle-strategy, #67) |
| ~~[should] Dual-screenshot cookie consent dismissal (#58)~~ | ~~After Act 1 and Wave 2 merge~~ | DONE (0025-dual-screenshot-consent) |
| [consider] E2E staging test for CMP iframe consent detection | When staging test infrastructure supports real Playwright browser | test-minion, Phase 0033 |
| ~~[should] Inject autoconsent into late-loading CMP iframes~~ | ~~When NYT-style lazy CMPs need support~~ | DONE (Phase 0033 refinement, framenavigated listener) |
| ~~[should] Update vendored autoconsent to fix Sourcepoint opt-out~~ | ~~When Sourcepoint selector mismatch causes opt-out failure on Guardian/Spiegel/Zeit~~ | DONE (Phase 0059b: v14.59.0 → v14.63.0, Sourcepoint fixes in v14.61.0) |
| [consider] Automated autoconsent update pipeline (#152) | When manual update lag causes CMP regressions | Phase 0059b |
| [consider] Distinguish timeout vs failed in consent API result | When audit consumers need to differentiate CMP engagement outcomes | ux-strategy-minion, Phase 0033 |
| [consider] Screenshot height cap configurability | When a user reports capped screenshots as a problem | edge-minion, capture-endpoint |
| [consider] Viewport parameterization | When a user reports viewport size as a problem | 0017-advisory: api-design, security |
| ~~[consider] Capture options metadata schema (`captureSettings`)~~ | ~~When any capture parameterization feature ships~~ | DONE (shipped with #58 in 0025) |
| [consider] WACZ captureQuality in datapackage.json | When partial captures are common enough to warrant evidence chain enrichment | security-minion, staged-fallback-timeout advisory |

### API Enhancements

| Item | Condition | Source |
|------|-----------|--------|
| ~~[consider] Webhooks / outbound callbacks~~ | ~~When per-tenant keys exist~~ -- DONE (Phase 0054): CRUD API, HMAC-SHA256 signing, queue-based dispatch with retry, Coralogix logging (Issue #102) | api-design-minion, kickoff |
| ~~[consider] Pagination filtering and sorting~~ | ~~URL filter and sorting require D1~~ -- DONE (Phase 0047): offset/limit pagination, URL prefix filter, date range filter, sort order | api-design-minion, kickoff |

### Webhooks (R27 shipped -- extensions)

| Item | Condition | Source |
|------|-----------|--------|
| [consider] Webhook event replay/redelivery API | When tenants report missed deliveries and need to replay events | Phase 0054, issue #102 out-of-scope |
| [consider] PATCH /v1/webhooks/{id} for active toggle | Schema supports it; expose when tenants need to pause without deleting | Phase 0054, code-review-minion |
| [consider] Webhook delivery exhaustion Coralogix alert | When webhook feature is verified in production; alert on DLQ events | Phase 0054, observability-minion |
| [consider] VERIFICATION_BASE_URL env var enforcement | Currently falls back to hardcoded production URL; require explicit config | Phase 0054, margo |

### Scheduling (R28 shipped -- extensions)

| Item | Condition | Source |
|------|-----------|--------|
| [consider] Schedule pause/resume (PATCH endpoint) | Schema supports it (`paused` column); expose when tenants need to pause without deleting | Phase 0059, lucy/margo scope review |
| [consider] Schedule-specific webhook events | Beyond capture.complete/failed; when schedule monitoring is requested | Phase 0059, out-of-scope |
| [consider] Change detection between scheduled captures | Diff/comparison of captures from same schedule; when a user requests it | Phase 0059, out-of-scope |

### Billing (R29 shipped -- extensions)

| Item | Condition | Source |
|------|-----------|--------|
| ~~[should] Wire Stripe meter event reporting into capture pipeline~~ | ~~When first paying tenant onboards~~ -- DONE (Phase 0060): hourly batch reporter with idempotency keys, graduated pricing module, billing dashboard endpoint (Issue #108) | Phase 0058 |
| [consider] Stripe Checkout returnUrl from client config | Currently defaults to `/ui`; make configurable when billing UI exists | Phase 0058 |

### Security

| Item | Condition | Source |
|------|-----------|--------|
| ~~[should] Content security scanning (Safe Browsing)~~ | ~~When WRL serves text/html content or multi-user opens public submission~~ -- DONE (Phase 0061): Google Web Risk pre-capture screening, daily rescan cron, quarantine enforcement, Coralogix alerting (Issue #109) | security-minion, kickoff |
| [consider] Un-quarantine workflow (operator appeal) | When a tenant disputes a quarantine or a URL is confirmed clean | Phase 0061, out-of-scope |
| [consider] Web Risk Update API with local cache | When pre-capture latency from Lookup API exceeds 200ms at scale | Phase 0061, performance |

### Storage

| Item | Condition | Source |
|------|-----------|--------|
| ~~[consider] D1 (edge SQLite)~~ | ~~When KV list latency >300ms at observed capture counts~~ -- DONE (Phase 0047): all metadata migrated to D1, KV retained only for rate limit counters | iac-minion, kickoff |
| [consider] R2 artifact streaming | When WACZ bundles >10MB become common | margo, retrieval-endpoint |

### Operations

| Item | Condition | Source |
|------|-----------|--------|
| [consider] Fork setup onboarding checklist | When a second operator forks and reports setup confusion | ux-strategy-minion, 0026-secrets-env-docs-onboarding |
| [consider] Cross-document anchor link lint in CI | When cross-document link rot is observed | software-docs-minion, 0026-secrets-env-docs-onboarding |
| [consider] Session pre-warming via cron | When Coralogix shows cold-start latency is measurable | iac-minion |
| [should] Coralogix DLQ alert for queue capture failures | When queue migration deploys to production; monitor capture.dlq events | observability-minion, 0044-queue-migration |
| ~~[consider] Coralogix alerting rules~~ | ~~When operational load justifies alerting~~ -- DONE (Phase 0046): 4 alert rules, provisioning script, runbooks | observability-minion, mvo-coralogix |
| [consider] Queue architecture documentation update | When queue migration is verified in production | software-docs-minion, 0044-queue-migration |
| [consider] Cron Trigger for pending capture TTL cleanup | When stale pending captures accumulate beyond queue retry window; queue retries handle most cases | data-minion, Phase 0047 |
| [consider] Fastly CDN layer | When verification traffic justifies CDN | iac-minion, kickoff |
| [consider] Preview deployments on PRs | When team size > 1 | iac-minion, kickoff |
| [consider] Durable Object session coordinator | When session contention >1% capture failures | iac-minion |
| [consider] Cloudflare Containers | When Browser Rendering limits exhausted AND Queues insufficient; monitor for GA | iac-minion, kickoff |
| [consider] CI Chromium binary caching for integration tests | After first CI run reveals the cache path | iac-minion, 0034-integration-tests |
| [consider] Promote integration tests to required CI check | After 2-4 weeks of stable green runs | test-minion, 0034-integration-tests |
| [consider] Deploy version check in smoke test | When a deploy silently fails to update the Worker | test-minion, cd-pipeline |
| [consider] Smoke test response time assertion | When Coralogix/RUM shows latency regression | test-minion, cd-pipeline |
| [consider] Automatic rollback on smoke failure | When deploy frequency >1/day or team size >1 | iac-minion, cd-pipeline |
| [consider] Tag-based release versioning | When external consumers need stable version references | ux-strategy-minion, cd-pipeline |

### Product Features

| Item | Condition | Source |
|------|-----------|--------|
| ~~[consider] Scheduled captures (cron-style)~~ | ~~When a user requests recurring capture~~ -- DONE (Phase 0059): CRUD API, Cron Trigger fan-out, per-tenant limits, web UI panel, 55 tests (Issue #107) | MVP.md |
| [consider] Watch lists / bulk monitoring | Requires scheduling (also parked) | MVP.md |
| [consider] Change detection / diffing | Requires multiple captures over time; no demand | MVP.md |
| [consider] Notifications | When event-driven workflows needed | MVP.md |
| ~~[consider] Billing and quotas~~ | ~~When monetization actively planned~~ -- DONE (Phase 0056): usage-based free limit (100 captures/month without card, unlimited with card), pre-capture enforcement, usage dashboard, per-tenant D1 overrides (Issue #104). Pricing model: pure pay-per-capture, no subscriptions. | MVP.md |
| ~~[consider] Capture ID recovery~~ | ~~Solved by R1; remove after R1 ships~~ -- Resolved: R1 shipped. | ux-strategy-minion, kickoff |
| [consider] E2E Playwright browser tests for Web UI | When client-side JS complexity grows beyond current 3-view scope | Phase 0049, test-minion |
| [consider] AbortController for auth validation timeout | When auth UX polish is prioritized; currently low-risk race window | Phase 0049, code-review-minion |
| ~~[consider] OAuth for web UI (upgrade from API key input)~~ | ~~Done~~ -- DONE (Phase 0055): GitHub OAuth self-serve signup | Phase 0049, security-minion |
| [consider] Operator tenant linking (GitHub → existing tenant) | When an operator-managed tenant holder wants to use the web UI; manual D1 SQL available as workaround | Phase 0055, D9 |
| [consider] E2E Playwright browser tests for OAuth flow | When OAuth UI complexity grows or regression risk increases | Phase 0055, test-minion |
| [consider] Additional OAuth providers (Google, email/password) | When user demand for non-GitHub auth is demonstrated | Phase 0055, out-of-scope |
| [consider] OG image for landing page | When landing page visual design is considered final; placeholder worse than none | Phase 0052 |
| [consider] Fix --color-text-muted contrast on landing page | When a11y audit runs; apply local override (same pattern as docs site in Phase 0051) | Phase 0052 |

---

## Dropped Items

Removed from active backlog. Rationale preserved here.

| Item | Rationale |
|------|-----------|
| SSE / WebSocket | Explicitly rejected during kickoff; polling works for 5-30s lifecycle |
| Database for metadata (generic) | Rejected during kickoff as generic; D1 shipped in Phase 0047 (#96) |
| Domain-ownership certificate | Architecturally problematic; .well-known/signing-key already ties key to domain |
| Social signup (GitHub first) | No identity system, no users; self-acknowledged YAGNI |
| Network namespace isolation | Over-engineering; Cloudflare manages the browser sandbox |
| DNS rebinding integration tests | Untestable in current environment; residual risk accepted in Phase 0014 |
| Cloud metadata DNS alias tests | Only resolvable inside cloud VPCs; untestable on Cloudflare Workers |
| Additional security event types | Self-acknowledged "low signal-to-noise for MVP" |
| Auth reason codes | Finer-grained logging with no demonstrated need |
| R2 write try/catch granularity | Self-acknowledged "catch-all sufficient for MVP" |
| 404 rate limiting | Theoretical log amplification with no evidence of scanning |
| Coralogix Send Key IP allowlisting | Blast radius reduction for a key that hasn't leaked |
| Nonce-based CSP | Template doesn't use server-side dynamic data in scripts |
| SevDesk/lexoffice bookkeeping integration (#112) | Stripe Invoices + Stripe Tax handle legally compliant German Rechnungen. At current volume, Steuerberater works from Stripe exports directly. Revisit: when transaction volume makes manual DATEV import painful, evaluate Fizard (Stripe → DATEV bridge app, usage-based, German-hosted) before building custom integration. |
| HTML error pages for 404/429/503 | "Acceptable for MVP"; fix opportunistically |
| S3 Object Lock (WORM-certified) | For regulated customers who don't exist |
| Full HTTP exchange capture | Forensic-grade; far beyond current scope. HAR recording evaluated (Phase 0016-advisory) — Playwright `recordHar()` non-functional on Workers (3 independent blockers). Application-level serializer via existing route interceptor is viable future path if demand emerges. |
| Sub-resource archiving | Significant complexity for offline replay; not core to evidence. Partial coverage possible via application-level HAR serializer (see Full HTTP exchange capture). |
| Certificate info capture | Not available via Playwright API; forensic nicety |
| Network timing capture | Not available via Playwright API; forensic nicety. Partial coverage possible via application-level HAR serializer timing data. |
| Resource manifest (CSS/JS/images) | Significant complexity; HTML + screenshot prove content state. Partial coverage possible via application-level HAR serializer (see Full HTTP exchange capture). |

---

## Done

Completed items removed from active tracking:

- ~~R8: Auth identity enrichment~~ -- DONE (list-endpoint phase)
- ~~R1: List captures endpoint~~ -- DONE (list-endpoint phase): `GET /v1/captures` with cursor pagination, status filter, tenant isolation (pagination upgraded to offset/limit with filtering in Phase 0047)
- ~~R2: Key versioning and public key archive~~ -- DONE (key-versioning phase): keyId fingerprints, signing key archive in KV, historical key verification
- ~~R3: CORS for capture POST~~ -- DONE (cors-hsts-ratelimit phase): configurable origin allowlist, CORS headers on all POST responses including errors
- ~~R4: HSTS preload submission~~ -- DONE (cors-hsts-ratelimit phase): `preload` directive; submit domain to hstspreload.org post-merge
- ~~R5: X-RateLimit-Limit header~~ -- DONE (cors-hsts-ratelimit phase): per-IP ceiling header; global 503s omit it
- ~~R7: Content moderation policy and ToS~~ -- DONE (staging-and-tos phase)
- ~~R9: Staging environment~~ -- DONE (staging-and-tos phase)
- ~~CI/CD pipeline~~ -- CI added in 0012-open-source-readiness
- ~~Structured logging~~ -- DONE (mvo-coralogix)
- ~~TOCTOU gap mitigation~~ -- DONE (playwright-migration)
- ~~Cross-domain navigation blocking~~ -- DONE (playwright-migration)
- ~~Captured HTML XSS prevention~~ -- DONE (retrieval-endpoint)
- ~~R6: Hashed IP logging~~ -- DONE (hashed-ip-logging phase): HMAC-SHA256 `cip` field, daily key rotation, graceful degradation
- ~~R18: Batch capture endpoint~~ -- DONE (batch-capture-endpoint phase): POST /v1/captures/batch, 207 Multi-Status, per-URL SSRF, sequential rate limit consumption
- ~~Security event logging~~ -- PARTIAL (mvo-coralogix): auth failures, SSRF blocks, rate limit hits logged
- ~~HSTS header~~ -- DONE (static-verification-page)
- ~~R14: Production CD pipeline~~ -- DONE (cd-pipeline phase): deploy-production.yml, OPERATIONS.md, environment protection with approval gate
- ~~R12: Per-tenant API keys and tenant isolation~~ -- DONE (Phase 0037): KV-based key lookup with SHA-256 hash, admin API (POST/GET/DELETE /v1/admin/keys), dual-mode legacy fallback, scope enforcement (capture/read/admin), ADMIN_KEY infrastructure secret
- ~~R21: Per-tenant rate limiting~~ -- DONE (Phase 0045): dual-layer enforcement (CF ceiling + KV counter + IP guard), X-RateLimit-* headers, KV-based tenant config overrides, admin config endpoints
- ~~R22: Coralogix alerting rules~~ -- DONE (Phase 0046): 4 alert rules (capture failures, TSA failures, auth spikes, worker errors), provisioning script, runbooks, alert documentation
- ~~R30: D1 migration for metadata~~ -- DONE (Phase 0047): all metadata (captures, tenants, API keys, signing keys) migrated from KV to D1, offset/limit pagination with SQL filtering and sorting, KV retained only for rate limit counters
- ~~R19: Documentation site~~ -- DONE (Phase 0051): 11ty v3 static site at docs.webresourceledger.com, 6 guide pages, OpenAPI-generated API reference, WRL brand design system, Cloudflare Workers Static Assets deployment
- ~~R23: Landing page~~ -- DONE (Phase 0052): static HTML/CSS at webresourceledger.com, zero JS, full SEO (JSON-LD, OG, sitemap), WCAG AA, Cloudflare Workers Static Assets (Issue #100)
- ~~R25: Usage Metering~~ -- DONE (Phase 0053): D1 usage_counters table, per-tenant capture/storage/API counters via UPSERT, admin usage endpoint, waitUntil deferred writes (Issue #101)
- ~~R27: Webhooks / outbound callbacks~~ -- DONE (Phase 0054): CRUD API (POST/GET/DELETE + ping), HMAC-SHA256 signing (Stripe model), Cloudflare Queue dispatch with exponential backoff retry, Coralogix delivery logging, 68 tests (Issue #102)
- ~~R24: Self-serve signup (OAuth)~~ -- DONE (Phase 0055): GitHub OAuth 2.0 with PKCE, auto-tenant provisioning, first-key display, session management, account settings (key CRUD), ToS enforcement, 10 new routes (Issue #103)
- ~~R26: Tenant Quotas~~ -- DONE (Phase 0056): free limit (100 captures/month without payment method, unlimited with card), pre-capture enforcement with 429 payment_required, per-tenant D1 overrides, web UI usage dashboard with progress bars (Issue #104). Note: updated 2026-03-23 from tier-based (free/pro) to usage-based pricing model.
- ~~R29: Stripe usage-based billing~~ -- DONE (Phase 0058): Stripe API client (no SDK), webhook signature verification with event dedup, billing endpoints (checkout, portal, webhook), D1 billing columns, grace period on payment failure, free tier 200 captures/month (Issue #106)
- ~~R28: Scheduled captures (cron)~~ -- DONE (Phase 0059): CRUD API (POST/GET/DELETE /v1/schedules), Cloudflare Cron Trigger fan-out every minute, per-tenant schedule limits (default 10, configurable), scheduleId capture linking, web UI schedule panel, 55 tests, `croner` library (Issue #107)
- ~~R31: Capture metering to Stripe pipeline~~ -- DONE (Phase 0060): hourly batch meter event reporting with idempotency, graduated pricing module (4 tiers), billing sub-object on GET /v1/account/usage, D1 watermark tracking, 32 new tests (Issue #108)
- ~~R32: Content security scanning~~ -- DONE (Phase 0061): Google Web Risk pre-capture screening, daily rescan cron, quarantine enforcement with 451 responses, 2 Coralogix alerts, fail-open degradation (Issue #109)

---

## Backlog Governance

**Adding items**: Only items the project owner explicitly deferred or that
address a user-reported need belong in the active backlog (Acts 1-3).
Agent-originated suggestions go to the Parking Lot with a concrete revisit
condition — not to the active backlog.

**Removing items**: Items are dropped when their premise is invalidated,
their scope is absorbed by another item, or they were added speculatively
without human validation. Dropped items stay in the Dropped Items table
with rationale.

**Size cap**: The active backlog (Acts 1-3) should not exceed 25 items.
Exceeding this threshold triggers a cleanup pass before new items are added.
