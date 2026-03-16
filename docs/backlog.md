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

- #38 **R8: Auth identity enrichment** [S] -- internal refactor, prerequisite for R1
- #31 **R1: List captures endpoint** [M] -- eliminates lost-ID problem; depends on R8
- #32 **R2: Key versioning and public key archive** [M] -- must ship before any key rotation
- #33 **R3: CORS for capture POST** [S] -- unblocks browser-based integrations
- #34 **R4: HSTS preload submission** [XS] -- one header change + form submission
- #35 **R5: X-RateLimit-Limit header** [XS] -- static ceiling header on rate-limited endpoints
- #36 **R6: Hashed IP logging** [S] -- HMAC-SHA256 abuse correlation without PII
- #37 **R7: Content moderation policy and ToS** [S] -- required before external promotion
- #39 **R9: Staging environment** [S] -- automated deploy-to-staging on push to main
- ~~#40 **R10: Backlog cleanup and restructure** [S]~~ -- DONE: this document

## Act 2: Evidence-Grade (mid-term)

Upgrade integrity claims from self-asserted to independently verifiable. Make the
word "evidence" defensible.

- #41 **R11: RFC 3161 timestamp integration** [L] -- third-party temporal proof; depends on R2
- #42 **R12: Per-tenant API keys and tenant isolation** [L] -- gated on multi-user decision; depends on R1, R8
- #43 **R13: Audit logging** [S] -- full audit trail; depends on R12
- #44 **R14: Production CD pipeline** [M] -- automated deploy with environment protection; depends on R9

## Act 3: Infrastructure (longer-horizon)

Expand WRL into a platform that other tools and agents build on.

- #45 **R15: MCP server for web evidence** [M] -- AI agent integration; depends on R1, R11 recommended
- #46 **R16: Queue migration for capture processing** [M] -- data-driven: when timeouts >5%
- #47 **R17: Web UI for capture submission** [M] -- browser-based capture; depends on R1, R3
- #48 **R18: Batch capture endpoint** [M] -- bulk archival workflows; depends on R1, R5

---

## Parking Lot

Deferred items with explicit activation triggers. Revisit when condition is met.

### Auth (revisit with multi-user decision)

| Item | Condition | Source |
|------|-----------|--------|
| [must:multi-user] API key rotation without downtime | When R12 (per-tenant keys) ships | security-minion, kickoff |
| [must:multi-user] Tenant isolation / RBAC | Folded into R12 | security-minion, kickoff |
| [consider] Per-tenant rate limiting | When R12 ships; switch rate limit key from IP to tenantId | edge-minion, capture-endpoint |
| [consider] OAuth for web UI | When R17 (web UI) is built and needs user auth | security-minion, kickoff |

### Signing and Legal

| Item | Condition | Source |
|------|-----------|--------|
| [consider] eIDAS Qualified TSA | 3+ QTSPs with published pricing and APIs; not before 2027 | gru, kickoff |
| [consider] WACZ-Auth full spec compliance | When a production toolchain consumes WACZ-Auth signatures | gru, kickoff |
| [consider] Multiple TSAs for redundancy | 6+ months after R11 ships; based on observed TSA reliability | gru, kickoff |
| [consider] HSM-backed key storage | When FIPS 140-2 Level 3 explicitly required or multi-tenant key management at scale | security-minion, kickoff |

### Capture Fidelity

| Item | Condition | Source |
|------|-----------|--------|
| [should] Screenshot timing / wait-for-load | When a user reports incomplete renders | kickoff |
| [consider] Screenshot height cap configurability | When a user reports capped screenshots as a problem | edge-minion, capture-endpoint |

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
| [consider] Session pre-warming via cron | When Coralogix shows cold-start latency is measurable | iac-minion |
| [consider] Coralogix alerting rules | When operational load justifies alerting | observability-minion, mvo-coralogix |
| [consider] Fastly CDN layer | When verification traffic justifies CDN | iac-minion, kickoff |
| [consider] Preview deployments on PRs | When team size > 1 | iac-minion, kickoff |
| [consider] Durable Object session coordinator | When session contention >1% capture failures | iac-minion |
| [consider] Cloudflare Containers | When Browser Rendering limits exhausted AND Queues insufficient; monitor for GA | iac-minion, kickoff |

### Product Features

| Item | Condition | Source |
|------|-----------|--------|
| [consider] Scheduled captures (cron-style) | When a user requests recurring capture | MVP.md |
| [consider] Watch lists / bulk monitoring | Requires scheduling (also parked) | MVP.md |
| [consider] Change detection / diffing | Requires multiple captures over time; no demand | MVP.md |
| [consider] Notifications | When event-driven workflows needed | MVP.md |
| [consider] Billing and quotas | When monetization actively planned | MVP.md |
| [consider] Capture ID recovery | Solved by R1; remove after R1 ships | ux-strategy-minion, kickoff |

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

- ~~CI/CD pipeline~~ -- CI added in 0012-open-source-readiness
- ~~Structured logging~~ -- DONE (mvo-coralogix)
- ~~TOCTOU gap mitigation~~ -- DONE (playwright-migration)
- ~~Cross-domain navigation blocking~~ -- DONE (playwright-migration)
- ~~Captured HTML XSS prevention~~ -- DONE (retrieval-endpoint)
- ~~Security event logging~~ -- PARTIAL (mvo-coralogix): auth failures, SSRF blocks, rate limit hits logged
- ~~HSTS header~~ -- DONE (static-verification-page)

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
