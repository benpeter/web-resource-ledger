# Advisory Report

**Question**: What is the right sequenced product roadmap for WRL, transforming the existing backlog into a prioritized evolution path?
**Confidence**: HIGH
**Recommendation**: Adopt a three-act roadmap ("Ready for Others" / "Evidence-Grade" / "Infrastructure") with 10 concrete near-term items, 4 mid-term items, and everything else parked. The multi-user decision is the single most important strategic choice -- the roadmap sequences work so it can be made deliberately rather than forced by premature investment.

## Executive Summary

Seven specialists analyzed WRL's 70+ item backlog against the project's engineering philosophy (YAGNI, KISS, Helix Manifesto) and the product's actual state (single operator, no external users, 15 completed build phases). The team reached strong consensus on three points: (1) the backlog has inflated well beyond actionable scope through agent thoroughness, (2) the trust gap (recoverability, verifiability, reliability) is the real problem to solve, not the feature gap, and (3) sequencing should build credibility before expanding capability.

The roadmap below distills the backlog into a sequenced plan of approximately 14 actionable items across three horizons. Every current backlog entry is explicitly addressed -- prioritized, parked, or dropped. Items are scoped tightly enough to become GitHub issues without further research. The overall narrative: make WRL reliable for one user, then trustworthy for evidence, then ready for others -- in that order. The multi-user decision (per-tenant keys, isolation, RBAC) is deliberately staged as a gate: prepare the architecture now, build the implementation only when a second user is real.

## Team Consensus

1. **The list endpoint is the single highest-priority item.** All seven specialists agree. It eliminates the "lost ID = lost capture" problem, which is the most user-hostile aspect of the current design. The README and API response both warn about it -- a sign that it should be fixed, not documented around.

2. **Key versioning must ship before the first key rotation.** Security-minion, gru, ux-strategy-minion, and product-marketing-minion all flag this independently. Rotating the signing key without versioning breaks verification of all prior captures -- a catastrophic failure for an evidence tool.

3. **RFC 3161 timestamps are the one signing upgrade worth near-term investment.** Gru, ux-strategy-minion, and product-marketing-minion agree this transforms WRL from "integrity tool" to "evidence tool." Security-minion agrees on the value but recommends deferring until there is demand for legal defensibility.

4. **~85% of [consider] items are YAGNI.** Lucy's audit found that 23 of 27 [consider] items have no evidence of human need. Many were self-acknowledged as premature by the agents that raised them. The backlog needs aggressive pruning.

5. **Multi-tenancy should wait for a real second user.** Ux-strategy-minion, lucy, and product-marketing-minion all argue against building per-tenant auth before demand exists. Security-minion agrees the items are correctly scoped but their trigger condition is "second user exists," not "now."

6. **HSTS preload, hashed IP logging, and content moderation policy are quick wins.** Security-minion identifies these as high risk-to-effort ratio items. All specialists who touched this area agree.

7. **The "evidence" framing is stronger than "archival."** Product-marketing-minion and ux-strategy-minion both recommend reframing WRL's positioning from web archival (competes with archive.org) to web evidence (competes with manual screenshots and notarization, where WRL wins on every dimension).

8. **KV is sufficient for per-tenant auth; D1 is only needed for query-by-attribute.** Iac-minion and api-design-minion agree: key lookups are hash-based (O(1) in KV), while the list endpoint's filtering needs will eventually drive D1 adoption -- but not yet.

## Dissenting Views

- **RFC 3161 timing**: Ux-strategy-minion places TSA in Phase 3 (after key versioning), arguing it elevates evidence quality and should come soon. Security-minion recommends deferring until "a customer asks for timestamps that hold up in a legal proceeding." Gru says Trial ring, build in H2 2026. Resolution: TSA is placed in mid-term (Act 2), after the trust foundation is solid but before platform expansion. This balances security-minion's pragmatism with ux-strategy's recognition that "evidence" claims require temporal proof. The trigger is not "someone asked" but "key versioning ships," since the signing pipeline will already be in motion.

- **MCP trigger priority**: Gru argues strongly for elevating MCP from [consider] to [should], citing ecosystem maturity (Linux Foundation donation, major vendor adoption, Cloudflare-native support) and market positioning ("the MCP server for web evidence" has zero competitors). Lucy flags it as "interesting to agents, unvalidated by users" and notes it was explicitly listed under "What's Out" in MVP.md. Resolution: MCP moves to mid-to-long-term (Act 3), after the evidence foundation ships. Gru's market analysis is sound -- the opportunity is real and the implementation cost is low (thin adapter over existing API). But product-marketing-minion's sequencing is correct: "strengthening the core before expanding the audience is the safer sequence." MCP should ship after TSA, not before.

- **[must] tier validity**: Lucy argues all five [must] items should be downgraded to [should] or [consider] because they are gated on a multi-user decision that has not been made. Security-minion maintains they are correctly [must] -- "before second user" is the qualifier, and it is accurate. Resolution: The roadmap treats these as "must before multi-user, not must now." They are sequenced in Act 1 but gated on the multi-user decision. The backlog tiers should be updated to reflect this nuance -- the items are important but conditional, not unconditional.

- **Backlog cleanup aggressiveness**: Lucy recommends removing items that contradict explicit kickoff rejections (SSE/WebSocket, webhooks, database) and moving most [consider] items to a parking lot. Product-marketing-minion wants to retain some [consider] items (web UI, scheduled captures) for Act 3 narrative planning. Resolution: Items that were explicitly rejected during kickoff with rationale should be removed from the active backlog. Items that are genuinely speculative but could become relevant under stated conditions stay in a clearly labeled "Parking Lot" section. The backlog should shrink from 70+ items to approximately 15-20 active items.

- **CORS for capture POST**: Api-design-minion elevates this to "should, not consider -- upgrade priority," calling it the highest DX impact for lowest implementation cost. Security-minion warns that CORS on the POST endpoint must not be wildcard and notes it is currently a "don't break it" risk rather than a "fix it now" risk. Resolution: Include CORS as a near-term item in the roadmap. The implementation is small (preflight handler + configurable allowlist), and it unblocks browser-based integrations. Security-minion's constraint (no wildcard, configurable origins) is incorporated as a requirement.

## The Roadmap

### Act 1: "Solid Foundation" (Near-term, next 1-3 phases)

These items make WRL reliable and trustworthy for its current single-operator use case. They close the trust gaps (recoverability, verifiability) and handle quick-win security hardening.

---

#### R1. List captures endpoint (GET /v1/captures)

**Summary**: Add a list/search endpoint so captures are recoverable without memorizing IDs

**Outcome**: Users can browse and recover their captures by date. The "lost ID = lost capture" anti-pattern is eliminated. The README and 202 response warnings about ID loss are removed.

**Scope**: M (medium) -- new endpoint, KV list integration, pagination, auth requirement, OpenAPI spec update, tests

**Dependencies**: None (can start immediately)

**Horizon**: Near-term (Phase 0016)

**Design decisions to make upfront**:
- Cursor-based pagination using KV's native list cursor (api-design-minion consensus)
- `{ data, pagination }` envelope pattern established for all future collection endpoints
- `status` filter included (cheap client-side filter on KV list results); URL filter and sorting deferred (require D1)
- Requires Bearer auth (the list endpoint cannot use capture-ID-as-secret pattern)
- Secondary KV index (`tenant:{tenantId}:ts:{ISO8601}:{captureId}`) for time-ordered listing -- a bridge pattern until D1

**Note on storage**: KV `list()` returns keys only; populating responses requires N additional `get()` calls. This is acceptable at current scale (low hundreds of captures). When this becomes a bottleneck, D1 migration is the answer -- but the API contract (cursor + envelope) should not need to change.

---

#### R2. Key versioning and public key archive

**Summary**: Add key ID to signatures and maintain a historical key archive so key rotation does not break verification

**Outcome**: The signing key can be rotated without breaking verification of prior captures. The bold README warning about key rotation is removed.

**Scope**: M -- updated signing flow, keyId field in signedData, new `/.well-known/signing-keys` endpoint, KV storage for historical keys, updated verification logic, tests

**Dependencies**: None (can start immediately; should ship before or alongside R1 to maintain focus)

**Horizon**: Near-term (Phase 0016 or 0017)

**Design decisions to make upfront**:
- keyId = SHA-256 fingerprint of public key, truncated to 8 hex chars
- Historical keys stored in KV (`signing-key:{keyId}`) -- key count will be single digits over the service lifetime
- Verification endpoint reads keyId from WACZ and selects the correct historical public key
- Key rotation procedure: generate new key, deploy, old key automatically moves to archive

---

#### R3. CORS for capture POST endpoint

**Summary**: Enable browser-based clients to submit captures via proper CORS preflight handling

**Outcome**: Browser extensions and web applications can call the capture API without CORS errors.

**Scope**: S (small) -- OPTIONS preflight handler, configurable origin allowlist (env var), Access-Control-Allow-Headers/Methods, tests

**Dependencies**: None

**Horizon**: Near-term (any phase, can be done alongside R1/R2)

**Constraints**: Origin allowlist must NOT be wildcard (`*`). The POST endpoint requires auth; wildcard CORS exposes the auth flow to any origin. Default to empty (no cross-origin access) with operator-configurable origins.

---

#### R4. HSTS preload submission

**Summary**: Add the `preload` directive to the existing HSTS header and submit to hstspreload.org

**Outcome**: SSL-stripping attacks on first visit are mitigated for all browsers that ship the preload list.

**Scope**: XS -- one header change, one form submission

**Dependencies**: Domain must be finalized (it is: wrl.fyi)

**Horizon**: Near-term (do immediately, no phase needed)

---

#### R5. X-RateLimit-Limit header

**Summary**: Return the static rate limit value in response headers on all rate-limited endpoints

**Outcome**: API clients know their rate limit budget without reading documentation.

**Scope**: XS -- add one header to three handlers, static value from config

**Dependencies**: None

**Horizon**: Near-term (any phase)

**Scope guard**: Do NOT fabricate X-RateLimit-Remaining or X-RateLimit-Reset. The Cloudflare rate limiter binding does not expose remaining tokens. An inaccurate header is worse than no header. Add remaining/reset only when the rate limiter binding supports it or WRL migrates to a custom token-bucket.

---

#### R6. Hashed IP logging

**Summary**: Log HMAC-SHA256 of connecting IP with daily-rotating key for abuse correlation without PII

**Outcome**: Brute-force correlation and abuse detection are possible without storing raw IP addresses (GDPR-compatible).

**Scope**: S -- HMAC function, daily key derivation, integration into existing log entries

**Dependencies**: None

**Horizon**: Near-term (any phase)

---

#### R7. Content moderation policy and Terms of Service

**Summary**: Publish ToS prohibiting illegal use and a content moderation policy with abuse reporting mechanism

**Outcome**: The operator has legal cover for stored content. Required before any public promotion of WRL.

**Scope**: S -- policy documents (not code), abuse contact endpoint or email, static pages or linked from API

**Dependencies**: None (content/legal task, not engineering)

**Horizon**: Near-term (before any external promotion)

---

#### R8. Auth identity enrichment (internal refactor)

**Summary**: Refactor verifyApiKey() to return tenant identity, preparing the codebase for per-tenant keys without changing external behavior

**Outcome**: The auth module returns `{ ok: true, tenantId }` instead of just `{ ok: true }`. The single static key maps to a "default" tenant. All downstream code threads tenantId into logging and KV operations. No external API change.

**Scope**: S -- internal refactor of auth module, updated handler call sites, updated log entries, tests

**Dependencies**: Should happen before or alongside R1 (list endpoint) to ensure KV keys include tenant scope from the start

**Horizon**: Near-term (Phase 0016, prerequisite for R1)

**Rationale**: This is preparation, not premature building. It ensures the list endpoint is tenant-scoped from day one, avoiding a painful KV key migration later. The refactor is invisible to API consumers.

---

#### R9. Staging environment

**Summary**: Add a staging environment to wrangler.toml with isolated KV and R2 bindings, plus automated deploy-to-staging on push to main

**Outcome**: Every push to main is automatically deployed to a staging environment for validation before manual production deploy.

**Scope**: S -- wrangler.toml env section, GitHub Actions workflow, basic smoke test script

**Dependencies**: None

**Horizon**: Near-term (any phase, low risk)

---

#### R10. Backlog cleanup

**Summary**: Restructure docs/backlog.md to remove items that contradict kickoff rejections, park agent-only-provenance items, and align tiers with current project state

**Outcome**: The backlog shrinks from 70+ items to ~15-20 active items. [must] tier reflects conditional triggers ("must before X") rather than unconditional urgency. Removed items are preserved in the evolution log.

**Scope**: S -- documentation task

**Dependencies**: This advisory (human approval of tier changes and removal rationale)

**Horizon**: Near-term (next phase, before roadmap execution begins)

---

### Act 2: "Evidence-Grade" (Mid-term, phases 0019-0022)

These items upgrade WRL's integrity claims from "self-asserted" to "independently verifiable." They make the word "evidence" defensible.

---

#### R11. RFC 3161 timestamp integration

**Summary**: Add independent timestamp authority proof to every capture, transforming evidence from operator-asserted to third-party-verified

**Outcome**: Every WACZ bundle includes an RFC 3161 timestamp response from an independent TSA. Verification confirms both signature integrity AND temporal proof from a third party. WRL can credibly use the word "evidence."

**Scope**: L (large) -- TSA integration module, ASN.1 parsing, updated WACZ bundling, updated verification pipeline, TSA selection (DigiCert or GlobalSign recommended over FreeTSA for reliability), tests

**Dependencies**: R2 (key versioning) should ship first -- the signing pipeline will already be in motion

**Horizon**: Mid-term

**Design note**: The `signatures` array in `datapackage-digest.json` was explicitly designed for this extension. The WACZ format does not need to change -- a new entry of `type: "rfc3161"` is added alongside the existing `type: "self"` entry.

---

#### R12. Per-tenant API keys and tenant isolation

**Summary**: Replace single static API key with per-tenant keys, add tenant tagging to captures, enforce tenant-scoped retrieval

**Outcome**: A second operator can use WRL with their own API key. Captures are isolated by tenant. Key compromise affects only one tenant.

**Scope**: L -- new auth module (KV-based key lookup), tenant tagging in KV records, tenant-scoped list endpoint, read/write key scoping, key provisioning tooling, migration path for existing captures

**Dependencies**: R1 (list endpoint) and R8 (auth identity enrichment) should ship first. This item is also gated on the multi-user decision -- do not build until a second user is real or imminent.

**Horizon**: Mid-term (triggered by demand, not calendar)

**Activation trigger**: A concrete second user wants access. Until then, the architecture is prepared (via R8) but the implementation is not built.

**Implementation note**: Security-minion recommends items 1-3 (per-tenant keys, tenant isolation, key scoping) as a single PR, with audit logging as a follow-on. Api-design-minion confirms the v1 API contract does not break -- the single key becomes the first tenant's key.

---

#### R13. Audit logging for authenticated requests

**Summary**: Log all authenticated API requests with tenant context, not just auth failures

**Outcome**: Full audit trail: who captured what, when, with which key.

**Scope**: S -- structured log entries on every authenticated request, key provisioning/revocation events

**Dependencies**: R12 (per-tenant keys)

**Horizon**: Mid-term (ships with or immediately after R12)

---

#### R14. Production CD pipeline

**Summary**: Automated deployment to production with GitHub environment protection, triggered by tags or manual dispatch

**Outcome**: Deployments are reproducible, gated by approval, and have rollback capability.

**Scope**: M -- GitHub Actions workflow, environment protection rules, post-deploy health check, rollback documentation

**Dependencies**: R9 (staging environment) should exist first for pre-production smoke tests. Becomes operationally important when external users depend on uptime.

**Horizon**: Mid-term (ship before first external user onboarding)

---

### Act 3: "Infrastructure" (Longer-horizon, phases 0023+)

These items make WRL a platform that other tools and agents build on. They expand the addressable audience.

---

#### R15. MCP server for WRL

**Summary**: Build an MCP server exposing capture, retrieval, and verification as tools for AI agents

**Outcome**: Any MCP-compatible AI agent can capture and verify web pages as part of its workflow. WRL becomes "the MCP server for web evidence" -- a niche with zero current occupants.

**Scope**: M -- thin adapter over existing REST API, 3 tools (capture_url, get_capture, verify_capture), Streamable HTTP transport, documentation

**Dependencies**: R1 (list endpoint) -- agents need to retrieve their captures. R11 (TSA) recommended first -- "evidence infrastructure for AI" is a stronger pitch with independent timestamps.

**Horizon**: Longer-term

---

#### R16. Queue migration for capture processing

**Summary**: Replace ctx.waitUntil() with Cloudflare Queue consumer to remove the 30s processing hard limit

**Outcome**: Complex pages that exceed 30s can complete successfully. Capture reliability improves for real-world pages.

**Scope**: M -- Queue binding, producer/consumer split, retry policy, dead-letter handling

**Dependencies**: None architecturally, but this is data-driven, not calendar-driven.

**Horizon**: Longer-term

**Activation trigger**: Coralogix data shows timeout-related capture failures >5% of attempts, OR sustained traffic regularly approaches 200/min. Until then, the 30s budget (25s navigation + 5s headroom) is sufficient.

---

#### R17. Web UI for capture submission

**Summary**: Browser-based interface for submitting and browsing captures without curl

**Outcome**: WRL is demonstrable without a terminal. Evaluators can try it by clicking a link.

**Scope**: M -- vanilla HTML/JS/CSS, no framework (per project philosophy), auth flow for web

**Dependencies**: R1 (list endpoint), R3 (CORS). Should ship after Act 1 is complete -- a web UI on top of sharp edges invites negative first impressions.

**Horizon**: Longer-term

---

#### R18. Batch capture endpoint

**Summary**: Accept multiple URLs in one request for bulk archival workflows

**Outcome**: Legal teams, monitoring services, and CI pipelines can archive multiple pages in one call.

**Scope**: M -- POST /v1/captures/batch, per-URL validation, 207 Multi-Status responses, rate limit interaction design

**Dependencies**: R1 (list endpoint), R5 (rate limit headers). Design should be finalized before implementation.

**Horizon**: Longer-term

---

## Dropped / Parked Items

Every backlog item not in the roadmap above is addressed here. Items are either **PARKED** (preserved in a parking lot section of the backlog, revisited under stated conditions) or **DROPPED** (removed from the backlog, rationale preserved in evolution log).

### PARKED (revisit under stated conditions)

| Item | Condition to Revisit | Current Tier |
|------|---------------------|--------------|
| API key rotation without downtime | When per-tenant keys ship (R12). Implementation is straightforward: accept array of valid keys per tenant. | [should] |
| Per-tenant rate limiting | When per-tenant keys ship (R12). Switch rate limit key from IP to tenantId. | [consider] |
| Content security scanning (Safe Browsing) | When WRL serves content with text/html content type, or when multi-user opens public submission. Currently artifacts are text/plain with attachment disposition. | [should] |
| Screenshot timing / wait-for-load | When a user reports incomplete renders. Known gap, no complaints yet. | [should] |
| Queue-based backpressure (Queues) | When Coralogix shows timeout failures >5% or traffic >200/min sustained. See R16. | [consider] |
| Session pre-warming via cron | When Coralogix shows cold-start latency is a measurable problem. Low risk, could implement speculatively. | [consider] |
| D1 (edge SQLite) | When KV list performance becomes a bottleneck for the list endpoint (R1). Signal: list endpoint latency >300ms at observed capture counts. | [consider] |
| Pagination, filtering, sorting | Partially addressed by R1 (cursor pagination, status filter). URL filter and sorting require D1. Revisit when D1 ships. | [consider] |
| eIDAS Qualified TSA | When WRL has paying European customers asking for it, OR when 3+ QTSPs offer timestamp services with published pricing and APIs. Not before 2027. | [consider] |
| WACZ-Auth full spec compliance | When a production toolchain exists that consumes WACZ-Auth signatures for verification. The spec has seen minimal evolution since 2023. | [consider] |
| Multiple TSAs for redundancy | 6+ months after first TSA integration (R11). Evaluate based on observed TSA reliability. | [consider] |
| HSM-backed key storage | When a compliance requirement (FIPS 140-2 Level 3) explicitly mandates it, or when WRL handles keys for multiple tenants at scale. Cloudflare has no native HSM integration. | [consider] |
| Cloudflare Containers | When Browser Rendering session limits are consistently exhausted AND Queues cannot absorb overflow. Monitor for GA announcement. | [consider] |
| Durable Object session coordinator | When session contention causes >1% capture failures. Current random selection + fallback handles contention fine. | [consider] |
| Scheduled captures (cron-style) | When a user requests recurring capture capability. Explicitly listed under "What's Out" in MVP.md. | [consider] |
| Watch lists / bulk monitoring | Requires scheduling (also parked). Two-deep dependency on unvalidated need. | [consider] |
| Change detection / diffing | Requires multiple captures over time. No evidence of demand. | [consider] |
| Notifications | When event-driven workflows are needed. Current polling pattern works for capture lifecycle. | [consider] |
| Billing and quotas | When monetization is actively planned. | [consider] |
| Webhooks / outbound callbacks | When per-tenant keys exist and async notification demand is demonstrated. | [consider] |
| Web UI OAuth | When/if web UI (R17) is built and requires user authentication. | [consider] |
| Capture ID recovery | Solved by R1 (list endpoint). Remove from backlog after R1 ships. | [consider] |
| Screenshot height cap configurability | When a user reports capped screenshots as a problem. | [consider] |
| Coralogix alerting rules | When operational load justifies alerting. Useful but premature before traffic exists. | [consider] |
| Fastly CDN layer | When verification traffic justifies CDN. No traffic data exists. | [consider] |
| Preview deployments on PRs | When team size > 1. Not useful for single-developer project. | [consider] |
| R2 artifact streaming | When large WACZ bundles (>10MB) become common. | [consider] |

### DROPPED (removed from active backlog)

| Item | Rationale |
|------|-----------|
| SSE / WebSocket | Explicitly rejected during kickoff as "overkill." The polling pattern works for 5-30s capture lifecycle. Should not be in an active backlog. |
| Database for metadata (generic) | Explicitly rejected during kickoff as "overkill for key-value." D1 is the specific option if query-by-attribute is needed; the generic "database" item is redundant. |
| Domain-ownership certificate | Architecturally problematic (couples TLS identity to application signing). Evidentiary value is marginal -- WRL's .well-known/signing-key already ties the public key to the domain. |
| Social signup (GitHub first) | Premature. No identity system, no signup flow, no external users. Self-acknowledged as YAGNI by the agent that raised it. |
| Network namespace isolation | Defense-in-depth for a browser sandbox already managed by Cloudflare. Over-engineering. |
| DNS rebinding integration tests | Requires controlled DNS with TTL manipulation. Untestable in current environment. Same-domain DNS rebinding accepted as residual risk in Phase 0014. |
| Cloud metadata DNS alias tests | Only resolvable inside cloud VPCs. Untestable in Cloudflare Workers. |
| Additional security event types | Self-acknowledged as "low signal-to-noise for MVP" by the agent that raised them. |
| Auth reason codes | Refactoring for finer-grained logging with no demonstrated operational need. |
| R2 write try/catch granularity | Self-acknowledged as "catch-all sufficient for MVP" by the agent that raised it. |
| 404 rate limiting | Theoretical log volume amplification with no evidence of scanning attacks. |
| Coralogix Send Key IP allowlisting | Blast radius reduction for a key that has not been leaked. |
| Nonce-based CSP | "If template ever needs server-side dynamic data" -- it currently does not. |
| HTML error pages for 404/429/503 | "Acceptable for MVP" per the agent that raised them. Fix opportunistically when touching adjacent code. |
| S3 Object Lock (WORM-certified) | For "regulated customers" who do not exist and are not targeted. |
| Full HTTP exchange capture | Forensic-grade capture requiring proxy-based approach. Far beyond current scope. |
| Sub-resource archiving | Significant complexity escalation for offline replay fidelity. Not core to evidence value prop. |
| Certificate info capture | Not available via Playwright API. Would require CDP dual-protocol management. Forensic-grade, not needed for web state evidence. |
| Network timing capture | Same as certificate info -- forensic nicety, not core value. |
| Resource manifest (CSS/JS/images) | Significant complexity escalation. HTML + screenshot prove content state. |

## Risks

1. **No user feedback loop.** The entire backlog and this roadmap are based on first-principles analysis, not user research. The sequencing is sound in theory but unvalidated by real usage. Mitigation: prioritize getting WRL in front of real users (even informally) after Act 1 ships. A handful of real captures by real users provides more signal than any amount of agent analysis.

2. **"Evidence" framing without TSA is a credibility risk.** If WRL adopts "evidence" language before shipping RFC 3161 timestamps, technically sophisticated users will point out that self-asserted timestamps are not evidence. Mitigation: use "evidence" in aspirational positioning but be explicit about what is independently verifiable today. Do not claim "legal-grade" until TSA ships.

3. **KV list performance ceiling.** The list endpoint (R1) will require 1 + N KV operations per request (1 list + N gets). At hundreds of captures this is fine. At thousands it will hit latency and cost ceilings. Mitigation: design the API contract (cursor + envelope) to be storage-backend-agnostic. D1 is the escape hatch. Monitor list endpoint latency in Coralogix.

4. **Key rotation before key versioning ships.** If the signing key is rotated before R2 ships, every existing WACZ becomes unverifiable through the API. This is a data integrity risk. Mitigation: R2 must ship before any key rotation. Document this as an operational constraint.

5. **Multi-user timing mismatch.** The roadmap prepares for multi-user (R8, architectural readiness) without building it. Risk: a second user appears before R12 is built, and the onboarding is blocked. Mitigation: R8 (auth identity enrichment) reduces the gap. The remaining work (R12) is a focused sprint, not a quarter-long project, because the architecture is prepared.

6. **Backlog re-inflation.** Phase 0015 added 7 new [consider] items in a single phase. Without a gating criterion, agents will continue expanding the backlog. Mitigation: establish a policy -- only add items to the backlog that the human explicitly deferred or that address a demonstrated (not theoretical) need. Agent-originated items go to a "suggestions" section that is reviewed periodically, not to the active backlog.

7. **Despicable-agents showcase vs. product credibility tension.** The "99% vibe coded" badge and process documentation serve the showcase audience. But they could undermine confidence for the adopter audience ("is this a real tool or a demo?"). Mitigation: keep the two narratives in separate channels -- README and product pages lead with the product; blog posts and evolution log lead with the process.

## Conflict Resolutions

1. **TSA timing (security-minion vs. ux-strategy-minion vs. gru)**: Security-minion wanted to defer TSA until customer demand. Ux-strategy-minion wanted it in Phase 3 (soon). Gru said Trial ring, H2 2026. **Resolution**: Mid-term (Act 2), after key versioning ships. This balances pragmatism with the recognition that "evidence" claims require temporal proof. The trigger is architectural readiness (key versioning done), not customer demand, because the positioning upgrade is worth the investment even without explicit asks.

2. **MCP priority (gru vs. lucy)**: Gru argued strongly for elevation to [should] based on ecosystem maturity and market positioning. Lucy flagged it as explicitly "What's Out" in MVP.md with no validated user need. **Resolution**: Act 3 (longer-horizon). The market opportunity is real but the foundation must be solid first. MCP is a thin adapter (~days of work) so the opportunity cost of waiting is low. The benefit of waiting is that WRL will have a list endpoint and TSA by the time agents discover it, making the first impression much stronger.

3. **[must] tier validity (lucy vs. security-minion)**: Lucy argued all [must] items should be downgraded because multi-user is not decided. Security-minion maintained they are correctly [must] before second user. **Resolution**: Reframe as conditional -- "must before multi-user, not must now." The items retain their importance but the urgency is tied to a decision gate, not a calendar date. The backlog should use a notation like `[must:multi-user]` to make the condition explicit.

4. **Backlog cleanup scope (lucy vs. product-marketing-minion)**: Lucy recommended aggressive removal of agent-only-provenance items. Product-marketing-minion wanted to retain some for narrative planning. **Resolution**: Items that contradict explicit kickoff rejections are dropped. Agent-only items with no stated condition go to a "Parking Lot" section. Items with clear activation conditions stay in the backlog with those conditions documented. Nothing is silently deleted -- all removals are documented in the evolution log.

5. **CORS priority (api-design-minion vs. security-minion)**: Api-design-minion called it the highest-impact DX improvement. Security-minion warned about the risk of wildcard CORS. **Resolution**: Include in near-term with security-minion's constraint (configurable allowlist, no wildcard) baked in as a requirement.

## Next Steps

1. **Get human approval of this roadmap.** The tier changes, item drops, and sequencing decisions are prioritization calls that belong to the project owner.

2. **Execute R10 (backlog cleanup) first.** Restructure `docs/backlog.md` to reflect the roadmap. Remove dropped items (with evolution log documentation). Add parking lot section. Update tiers. This creates a clean working document for all subsequent phases.

3. **Create GitHub issues for Act 1 items (R1-R9).** Each roadmap item above has enough detail for an issue title + body. Issues can be created mechanically from this document.

4. **Begin Phase 0016 with R8 (auth identity enrichment) and R1 (list endpoint).** R8 is a prerequisite for R1 and is a small internal refactor. R1 is the highest-value item. These can be a single phase or two sequential phases.

5. **R2 (key versioning) in Phase 0017.** Ship before any key rotation occurs.

6. **R3-R7 (CORS, HSTS, rate limit header, hashed IP, ToS) are independent quick wins.** They can be bundled into any phase or shipped as individual small PRs. HSTS preload (R4) can be done today with no phase needed.

7. **After Act 1 ships, seek user feedback.** Even informal usage by 2-3 real users will validate or redirect the Act 2/3 roadmap. The roadmap is a hypothesis until users touch it.

8. **Write the Phase 0014 technical narrative.** Product-marketing-minion correctly notes this is already shipped, has a strong multi-agent story, and costs nothing to write. It starts building the content library for the despicable-agents showcase.

## Conditions to Revisit

This roadmap should be reconsidered when:

1. **A second user wants access.** This triggers the multi-user decision and potentially accelerates R12 (per-tenant keys) from mid-term to near-term.

2. **Coralogix data shows capture timeout failures >5%.** This triggers R16 (Queue migration) regardless of roadmap position.

3. **KV list endpoint latency exceeds 300ms at observed capture volume.** This triggers D1 evaluation.

4. **A user requests evidence for a legal proceeding.** This may accelerate R11 (TSA) and trigger eIDAS evaluation.

5. **Cloudflare Containers reach GA with stable pricing.** This opens the capture fidelity upgrade path (CDP-based certificate and network capture).

6. **The backlog exceeds 25 active items again.** This triggers another cleanup pass. The backlog should not be allowed to re-inflate past the threshold established by R10.

7. **3 or more QTSPs offer timestamp services with published pricing.** This makes eIDAS evaluation actionable.

8. **Phase count exceeds 25 without Act 1 complete.** This is a signal of scope creep or distraction. Act 1 items should dominate the next 5-8 phases.
