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
- #46 **R16: Queue migration for capture processing** [M] -- data-driven: when timeouts >5%; staged fallback now handles partial captures, R16 still needed for full WACZ on all captures
- #47 **R17: Web UI for capture submission** [M] -- browser-based capture; depends on R1, R3
- #48 **R18: Batch capture endpoint** [M] -- bulk archival workflows; depends on R1, R5

---

## Parking Lot

Deferred items with explicit activation triggers. Revisit when condition is met.

### Auth (R12 shipped -- next wave)

| Item | Condition | Source |
|------|-----------|--------|
| ~~[must:multi-user] API key rotation without downtime~~ | ~~When R12 (per-tenant keys) ships~~ -- R12 shipped; key rotation now possible via create + revoke flow | security-minion, kickoff |
| ~~[must:multi-user] Tenant isolation / RBAC~~ | ~~Folded into R12~~ -- DONE: tenantId in KV records, capture list scoped to tenant | security-minion, kickoff |
| [consider] Per-tenant rate limiting | R12 shipped; switch rate limit key from IP to tenantId when per-tenant quotas needed | edge-minion, capture-endpoint |
| [consider] OAuth for web UI | When R17 (web UI) is built and needs user auth | security-minion, kickoff |
| [should] Evaluate auth requirement for GET /v1/captures/{id} post-multi-tenant | When a second tenant is onboarded; current ID-as-secret model reviewed in SECURITY.md | security-minion, Phase 0037 |

### Signing and Legal

| Item | Condition | Source |
|------|-----------|--------|
| [consider] eIDAS Qualified TSA | 3+ QTSPs with published pricing and APIs; not before 2027 | gru, kickoff |
| [consider] WACZ-Auth full spec compliance | When a production toolchain consumes WACZ-Auth signatures | gru, kickoff |
| [consider] Multiple TSAs for redundancy | 6+ months after R11 ships; based on observed TSA reliability | gru, kickoff |
| [consider] HSM-backed key storage | When FIPS 140-2 Level 3 explicitly required or multi-tenant key management at scale | security-minion, kickoff |
| [consider] CRL/OCSP revocation checking in CLI verify | When a TSA certificate revocation incident occurs or compliance requires it; offline requirement conflicts | security-minion, 0034-cli-verify-tool |
| [should] Publish @w-r-l/verify to npm | When CLI tool is stable and tested in production; npm org @w-r-l registered | devx-minion, 0034-cli-verify-tool |

### Capture Fidelity

| Item | Condition | Source |
|------|-----------|--------|
| ~~[should] Screenshot timing / wait-for-load~~ | ~~When a user reports incomplete renders~~ | DONE (0029-load-settle-strategy, #67) |
| ~~[should] Dual-screenshot cookie consent dismissal (#58)~~ | ~~After Act 1 and Wave 2 merge~~ | DONE (0025-dual-screenshot-consent) |
| [consider] E2E staging test for CMP iframe consent detection | When staging test infrastructure supports real Playwright browser | test-minion, Phase 0033 |
| ~~[should] Inject autoconsent into late-loading CMP iframes~~ | ~~When NYT-style lazy CMPs need support~~ | DONE (Phase 0033 refinement, framenavigated listener) |
| [should] Update vendored autoconsent to fix Sourcepoint opt-out | When Sourcepoint selector mismatch causes opt-out failure on Guardian/Spiegel/Zeit | debugger-minion, Phase 0033 |
| [consider] Distinguish timeout vs failed in consent API result | When audit consumers need to differentiate CMP engagement outcomes | ux-strategy-minion, Phase 0033 |
| [consider] Screenshot height cap configurability | When a user reports capped screenshots as a problem | edge-minion, capture-endpoint |
| [consider] Viewport parameterization | When a user reports viewport size as a problem | 0017-advisory: api-design, security |
| ~~[consider] Capture options metadata schema (`captureSettings`)~~ | ~~When any capture parameterization feature ships~~ | DONE (shipped with #58 in 0025) |
| [consider] WACZ captureQuality in datapackage.json | When partial captures are common enough to warrant evidence chain enrichment | security-minion, staged-fallback-timeout advisory |

### API Enhancements

| Item | Condition | Source |
|------|-----------|--------|
| [consider] Webhooks / outbound callbacks | When per-tenant keys exist and async notification demand demonstrated | api-design-minion, kickoff |
| [consider] Pagination filtering and sorting | URL filter and sorting require D1; cursor pagination in R1 | api-design-minion, kickoff |

### Security

| Item | Condition | Source |
|------|-----------|--------|
| [should] Content security scanning (Safe Browsing) | When WRL serves text/html content or multi-user opens public submission | security-minion, kickoff |

### Storage

| Item | Condition | Source |
|------|-----------|--------|
| [consider] D1 (edge SQLite) | When KV list latency >300ms at observed capture counts | iac-minion, kickoff |
| [consider] R2 artifact streaming | When WACZ bundles >10MB become common | margo, retrieval-endpoint |

### Operations

| Item | Condition | Source |
|------|-----------|--------|
| [consider] Fork setup onboarding checklist | When a second operator forks and reports setup confusion | ux-strategy-minion, 0026-secrets-env-docs-onboarding |
| [consider] Cross-document anchor link lint in CI | When cross-document link rot is observed | software-docs-minion, 0026-secrets-env-docs-onboarding |
| [consider] Session pre-warming via cron | When Coralogix shows cold-start latency is measurable | iac-minion |
| [consider] Coralogix alerting rules | When operational load justifies alerting | observability-minion, mvo-coralogix |
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
| [consider] Scheduled captures (cron-style) | When a user requests recurring capture | MVP.md |
| [consider] Watch lists / bulk monitoring | Requires scheduling (also parked) | MVP.md |
| [consider] Change detection / diffing | Requires multiple captures over time; no demand | MVP.md |
| [consider] Notifications | When event-driven workflows needed | MVP.md |
| [consider] Billing and quotas | When monetization actively planned | MVP.md |
| ~~[consider] Capture ID recovery~~ | ~~Solved by R1; remove after R1 ships~~ -- Resolved: R1 shipped. | ux-strategy-minion, kickoff |

---

## Dropped Items

Removed from active backlog. Rationale preserved here.

| Item | Rationale |
|------|-----------|
| SSE / WebSocket | Explicitly rejected during kickoff; polling works for 5-30s lifecycle |
| Database for metadata (generic) | Rejected during kickoff; D1 is the specific option if needed |
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
- ~~R1: List captures endpoint~~ -- DONE (list-endpoint phase): `GET /v1/captures` with cursor pagination, status filter, tenant isolation
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
- ~~Security event logging~~ -- PARTIAL (mvo-coralogix): auth failures, SSRF blocks, rate limit hits logged
- ~~HSTS header~~ -- DONE (static-verification-page)
- ~~R14: Production CD pipeline~~ -- DONE (cd-pipeline phase): deploy-production.yml, OPERATIONS.md, environment protection with approval gate
- ~~R12: Per-tenant API keys and tenant isolation~~ -- DONE (Phase 0037): KV-based key lookup with SHA-256 hash, admin API (POST/GET/DELETE /v1/admin/keys), dual-mode legacy fallback, scope enforcement (capture/read/admin), ADMIN_KEY infrastructure secret

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
