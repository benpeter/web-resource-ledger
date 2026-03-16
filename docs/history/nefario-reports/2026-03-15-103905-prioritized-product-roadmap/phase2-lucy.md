# Domain Plan Contribution: lucy

## Recommendations

### 1. CLAUDE.md Philosophy Violations in the Backlog

The project's engineering philosophy is explicit: YAGNI, KISS, Lean and Mean, Helix Manifesto. The human's kickoff prompt reinforced this: "the smallest thing that delivers the core value prop." MVP.md further declares: "Every feature traces to R1, R2, or R3. No speculative additions."

Against these principles, the following backlog items are suspect:

**DRIFT: Speculative items with no evidence of human need**

| Item | Tier | Violation | Source |
|------|------|-----------|--------|
| eIDAS Qualified TSA | consider | Pre-optimization for "European customers" that do not exist. No user has asked for legal admissibility. | gru, kickoff |
| WACZ-Auth signing spec (full) | consider | Standards completionism. MVP's simplified version works. No user has requested full compliance. | gru, kickoff |
| Domain-ownership certificate | consider | Depends on WACZ-Auth full spec, which is itself speculative. Two layers of YAGNI. | gru, kickoff |
| Multiple TSAs for redundancy | consider | Optimizing for TSA reliability before implementing a single TSA. Classic pre-optimization. | gru, kickoff |
| HSM-backed key storage | consider | Enterprise-grade key management for a single-operator $5/month service. Disproportionate. | security-minion, kickoff |
| S3 Object Lock (WORM-certified) | consider | "For regulated customers" who do not exist and are not targeted. | gru, iac-minion, kickoff |
| D1 (edge SQLite) | consider | "If KV becomes limiting" -- speculative scaling that contradicts the KV choice made in MVP. | iac-minion, kickoff |
| Fastly CDN layer | consider | "Evaluate when verification traffic justifies it" -- no traffic data exists to justify this. | iac-minion, kickoff |
| Capture service container migration | consider | Escape hatch from Browser Rendering that was further deferred by session reuse success (phase 0014). | iac-minion, kickoff |
| SSE / WebSocket | consider | Explicitly rejected during kickoff decisions ("overkill"). Remains in backlog anyway. | api-design-minion, kickoff |
| Batch capture | consider | No user has needed this. Single-URL capture is the stated value prop. | api-design-minion, kickoff |
| Webhooks / outbound callbacks | consider | Explicitly rejected during kickoff ("callback complexity"). Remains in backlog. | api-design-minion, kickoff |
| Scheduled captures (cron-style) | consider | Explicitly listed under "What's Out" in MVP.md with a clear rationale. | MVP.md |
| Watch lists / bulk monitoring | consider | Requires scheduling (which is also deferred). Two-deep dependency chain on unvalidated need. | MVP.md |
| Change detection / diffing | consider | Requires multiple captures over time. No evidence anyone wants this. | MVP.md |
| Notifications | consider | "API 202 response is the notification" per MVP.md. No user has complained. | MVP.md |
| Billing and quotas | consider | "No monetization for MVP" per MVP.md. Premature. | MVP.md |
| MCP / AI-agent triggers | consider | "Layers on top of API" per MVP.md. Interesting to agents, unvalidated by users. | MVP.md |
| Network namespace isolation | consider | Defense-in-depth for a browser sandbox that is already managed by Cloudflare. | security-minion, kickoff |
| DNS rebinding integration tests | consider | Requires controlled DNS with TTL manipulation -- infrastructure for an edge case test. | urlval outcome |
| Cloud metadata DNS alias tests | consider | Only resolvable inside cloud VPCs. Untestable in the current Cloudflare environment. | urlval outcome |
| Session pre-warming via cron | consider | Scaling optimization added in phase 0014. No evidence of cold-start problems. | playwright-migration |
| Durable Object session coordinator | consider | Significant architectural complexity for a concurrency problem that hasn't materialized. | playwright-migration |

**Observation**: 23 of the 27 `[consider]` items (85%) show no evidence that the human operator has ever expressed a need for them. They originate from agent specialists systematically cataloging what *could* be built, not what *should* be built. This is textbook scope creep via thoroughness.

**DRIFT: Items that contradict explicit kickoff rejections**

Three items were explicitly rejected during the 0001-kickoff decisions phase but appear in the backlog as `[consider]`:

1. **SSE / WebSocket** -- Rejected as "overkill" in `0001-kickoff/decisions.md`. Still in the backlog.
2. **Webhooks / outbound callbacks** -- Rejected as "callback complexity" in `0001-kickoff/decisions.md`. Still in the backlog.
3. **Database for metadata** -- D1/database was rejected as "overkill for key-value" in `0001-kickoff/decisions.md`. Still in the backlog.

These should not be in an active backlog. They were evaluated, rejected with rationale, and their presence implies they are still under consideration. The "What's Out" table in MVP.md is the proper place for rejected items; the backlog should contain only items that *might* be built.

### 2. Dual-Purpose Balance Assessment

The project states two goals: (1) a real product, and (2) a despicable-agents showcase.

**Product side**: 70+ items across 10 domains. The feature surface implied by the full backlog is that of a mature SaaS platform (multi-tenancy, RBAC, billing, webhooks, scheduled captures, change detection, CDN layer, WORM storage). This is not a single-operator archival service -- it's a full product roadmap for a business that does not yet have its first external user.

**Showcase side**: Zero backlog items relate to improving the despicable-agents showcase experience. No items for documentation of the agent process, improving evolution log quality, or making the build story more accessible. The showcase goal is served entirely by the evolution log convention, which is a process requirement rather than a product feature. This is appropriate -- the showcase value comes from the build process, not from additional product scope.

**Verdict**: The imbalance is *correct*. The showcase goal does not need backlog items; it needs disciplined process documentation (which CLAUDE.md already mandates). The risk is the opposite: the product side has accumulated enterprise-grade scope that would take years to build and would bury the showcase story under feature development. The showcase is best served by a focused, complete, well-documented product -- not an expansive one.

### 3. [must] Tier Reassessment

All 5 remaining `[must]` items are in Auth and Access Control, all from security-minion during kickoff:

| Item | Current framing | Assessment |
|------|-----------------|------------|
| Per-tenant API keys | "before second user" | Correctly scoped. Genuinely gates multi-user. But multi-user is not on the near-term horizon. This is a `[should]` until multi-user is actively planned. |
| API key rotation without downtime | "support multiple active keys" | The MVP already has a rotation mechanism: `wrangler secret update` + deploy (30s). "Without downtime" implies zero-downtime rotation for a service with one user. This is a `[should]`. |
| Key scoping (read vs write) | "permissions per key" | With one key and one user, scoping is meaningless. YAGNI. This is a `[consider]` until multi-user is actively planned. |
| Audit logging of key usage | "must before multi-user" | Coralogix already logs auth failures (phase 0015). Full audit logging of *successful* key usage adds value only when there are multiple keys to audit. This is a `[should]` until multi-user. |
| Tenant isolation / RBAC | "required before multi-user" | RBAC for a single-operator service is building a user management system for one user. This is a `[consider]` until multi-user is actively planned. |

**The framing "must before multi-user" is correct but misleading.** It implies these items are imminent blockers. Multi-user is not on the near-term horizon -- there is no user management system, no billing, no signup flow, and no external users. The entire `[must]` tier is gated on a decision (go multi-user) that has not been made.

**Recommendation**: Downgrade the `[must]` tier to `[should]` for per-tenant API keys, key rotation, and audit logging. Downgrade key scoping and tenant isolation/RBAC to `[consider]`. Add a clear note that these items activate when a multi-user decision is made. This makes the `[must]` tier empty, which accurately reflects the project's current state: the MVP is built, and there are no mandatory next steps -- only choices about direction.

### 4. Items That Exist Solely Because an Agent Raised Them

The following items have no traceable human need. They were surfaced during agent planning phases and have never been validated by the human operator:

**High confidence (agent-only provenance, no human validation)**

- **Content security scanning / Safe Browsing** (security-minion, kickoff): Prevents WRL from being "used as malware mirror." This is a legitimate concern for a public service with many users. For a single-operator service, the operator is the only one who can submit URLs. This solves a problem that requires multi-user to exist.
- **Content moderation policy and abuse reporting** (security-minion, kickoff): Same as above -- single-operator service cannot be abused by third parties who cannot submit captures.
- **Terms of service** (security-minion, kickoff): Legal boilerplate for a service with no users, no signup, and no public submission interface.
- **OAuth for web UI** (security-minion, kickoff): The web UI itself is `[consider]`. Building auth for a UI that might not exist is two-deep YAGNI.
- **Social signup** (margo, kickoff): Explicitly flagged as "YAGNI until multi-user" by the agent that raised it.
- **Screenshot height cap configurability** (edge-minion, capture-endpoint): An edge case (pages >8000px) with no reported user complaint.
- **Additional security event types** (security-minion, mvo-coralogix): "Low signal-to-noise for MVP" per the agent that raised them.
- **Auth reason codes** (debugger-minion, mvo-coralogix): Refactoring for finer-grained logging. No operational need demonstrated.
- **R2 write try/catch granularity** (observability-minion, mvo-coralogix): "Catch-all sufficient for MVP" per the agent that raised it.
- **404 rate limiting** (security-minion, mvo-coralogix): Theoretical log volume amplification. No evidence of scanning attacks.
- **Coralogix alerting rules** (observability-minion, mvo-coralogix): Useful eventually, but premature before there is operational load to alert on.
- **Coralogix Send Key IP allowlisting** (security-minion, mvo-coralogix): Blast radius reduction for a key that has not been leaked.
- **Nonce-based CSP** (security-minion, static-verification-page): "If template ever needs server-side dynamic data" -- it currently does not.
- **HTML error pages** (margo, static-verification-page): "Acceptable for MVP" per the agent that raised them.
- **Preview deployments on PRs** (iac-minion, kickoff): CI/CD enhancement for a single-developer project.
- **Capture ID recovery** (ux-strategy-minion, kickoff): Solved by the list endpoint (which is already in the backlog separately).
- **Web UI for capture submission** (margo, kickoff): "curl/API sufficient for MVP" per the agent that raised it.

**Pattern**: Many of these items were self-acknowledged as premature by the very agents that raised them. The backlog has become a repository of "things that could theoretically matter someday" rather than "things we need to build." This is the natural output of thorough specialist agents operating under "flag everything" norms -- each agent optimizes for completeness in their domain, and the aggregate is scope explosion.

### 5. What the Backlog Should Look Like

After filtering for YAGNI/KISS compliance and human-validated need, the backlog that reflects actual project priorities is much smaller:

**Genuinely next items (human-originated or human-validated)**

1. **List/search captures** (`GET /v1/captures`) -- Explicitly called "first addition post-MVP" in MVP.md. Human-originated priority.
2. **HSTS preload submission** -- Concrete, low-effort security hardening with no complexity cost.
3. **Key versioning / key ID in signatures** -- Needed before the first key rotation, which is a real operational event.
4. **Old public key archive endpoint** -- Companion to key versioning.
5. **Queue migration** -- Only when slow-page timeouts actually recur. Trigger condition is stated.

**Reasonable to keep as `[should]`**

6. **RFC 3161 timestamps** -- Upgrade path is designed. Adds genuine value (temporal proof from third party). Implement when the product needs to demonstrate legal defensibility.
7. **Rate limit headers** (remaining `X-RateLimit-*`) -- Standard API hygiene.
8. **CORS on capture POST** -- Concrete security hardening.
9. **Hashed IP logging** -- Privacy-respecting correlation capability. Design is ready.
10. **Screenshot timing / wait-for-load** -- Known fidelity gap. Address when a user reports it.

**Everything else** should either be moved to an "ideas" or "parking lot" document, or deleted from the backlog with a note in the evolution log about the cleanup rationale.


## Proposed Tasks

### Task 1: Backlog Triage and Cleanup

**What**: Review and restructure `docs/backlog.md` per the findings above. Downgrade all `[must]` items to `[should]` or `[consider]` with a "activates when multi-user is decided" qualifier. Remove items that contradict explicit kickoff rejections (SSE/WebSocket, webhooks, database). Move agent-acknowledged-premature items to a "Parking Lot" section or remove them entirely.

**Deliverable**: Updated `docs/backlog.md` with a focused, philosophy-compliant item list. The backlog should be under 30 items, with zero `[must]` items (reflecting that the MVP is complete and there are no mandatory next steps).

**Dependencies**: Human approval of the tier reassessment and removal recommendations above. This is a prioritization decision, not a technical one.

### Task 2: Evolution Log Entry for the Triage

**What**: Create `docs/evolution/NNNN-backlog-triage/` documenting the rationale for every item removed, downgraded, or retained. This preserves the audit trail required by CLAUDE.md.

**Deliverable**: `prompt.md`, `decisions.md`, `outcome.md` in the phase directory.

**Dependencies**: Task 1 completion.


## Risks and Concerns

1. **Backlog as social contract**: If the human has been using the backlog as a "things I might want" list rather than a "things I intend to build" list, removing items could discard implicit intent. The cleanup should preserve removed items somewhere accessible (evolution log, "parking lot" section, or a separate archive file) rather than deleting them.

2. **Agent trust signal**: The `[must]` tier was set by security-minion, which the human chose to include in the kickoff team. Downgrading security-minion's recommendations could be read as dismissing security concerns. The framing should be clear: the security analysis is correct (these things ARE needed before multi-user), but the tier assignment conflates "important when triggered" with "important now."

3. **Scope creep re-entry**: Without a clear policy, agents will continue adding items to the backlog during every phase. Phase 0015 (Coralogix) added 7 new `[consider]` items in a single phase. The backlog will re-inflate unless there is a gating criterion for new entries (e.g., "only add items that the human explicitly deferred, not items that agents wish existed").

4. **Dual-purpose tension**: Cleaning the backlog aggressively makes the product more focused but may reduce the showcase value of showing how agent-generated scope accumulates and is managed. The cleanup itself could be narrated as a showcase moment: "here is what happens when you let specialists catalog everything, and here is how you prune."


## Additional Agents Needed

- **margo** should review the final roadmap for over-engineering (already planned for Phase 3.5 per the task description -- confirming this is correct and sufficient).
- No additional agents needed beyond what is already planned. The core issue here is intent alignment, not technical or architectural -- it falls squarely within lucy's scope.
