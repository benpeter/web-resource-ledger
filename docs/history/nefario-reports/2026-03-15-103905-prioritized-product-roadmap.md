---
task: Review backlog and produce a prioritized product roadmap
date: 2026-03-15
slug: prioritized-product-roadmap
mode: advisory
task-count: 0
gate-count: 0
compaction-events: 0
---

## Summary

Seven specialists analyzed WRL's 70+ item backlog and produced a three-act product roadmap: "Solid Foundation" (10 near-term items), "Evidence-Grade" (4 mid-term items), and "Infrastructure" (4 longer-horizon items). 13 items dropped, 28 parked with activation triggers. The backlog shrinks from 70+ active items to ~18. Key consensus: list endpoint is #1 priority, key versioning must ship before any key rotation, ~85% of [consider] items are YAGNI, and multi-tenancy should wait for a real second user.

## Original Prompt

Review backlog and produce a prioritized product roadmap

**Outcome**: The existing backlog (`docs/backlog.md`) is transformed into a sequenced product roadmap that defines a meaningful evolution path for WRL. Each roadmap item is scoped and described well enough to become a GitHub issue without further research, so that issue creation is a mechanical follow-up step rather than a planning session.

**Success criteria**:
- Every backlog item is explicitly addressed (prioritized, deferred, or dropped with rationale)
- Roadmap items are sequenced with dependency reasoning (what enables what)
- Each item has a one-line summary, outcome statement, and rough scope — sufficient to seed a GitHub issue title + body
- The roadmap distinguishes between near-term (next 1-3 phases), mid-term, and longer-horizon work
- Product coherence: the sequence tells a story of incremental value, not a grab-bag of tasks

## Key Design Decisions

1. **Three-act narrative structure** -- "Solid Foundation" → "Evidence-Grade" → "Infrastructure". Sequence builds credibility before expanding capability. Rejected: technical dependency sort (no product coherence), feature-first approach (builds on shaky foundation).
2. **Conditional [must] tier** -- Reframe [must] as "must before multi-user, not must now". The multi-user decision is a gate, not a deadline. Rejected: downgrade all to [consider] (loses importance signal), keep as unconditional [must] (creates false urgency).
3. **Aggressive backlog pruning** -- 13 items dropped, 28 parked. Active backlog target: ~15-20 items. Rejected: keeping all items as options (backlog inflation), removing only DONE items (leaves noise).
4. **"Evidence" over "archival" positioning** -- Archival competes with archive.org (free, massive). Evidence competes with manual screenshots and notarization (expensive, slow). WRL wins the evidence comparison. Rejected: dual positioning (confusing), archival-only (wrong competitive set).
5. **MCP in Act 3, not Act 2** -- Market opportunity is real (gru) but foundation must be solid first (product-marketing). Thin adapter, so opportunity cost of waiting is low. Rejected: immediate elevation to [should] (YAGNI until foundation ships), permanent deferral (misses market window).

## Phases

### Phase 1: Meta-Plan
Identified 7 specialists: ux-strategy-minion (user journey), security-minion (auth sequencing), api-design-minion (API evolution), iac-minion (infrastructure prerequisites), gru (strategic calibration), product-marketing-minion (positioning narrative), lucy (intent drift audit). Initial team of 5 was adjusted to 7 at user request (+product-marketing-minion, +lucy). Phase 1 re-run produced revised planning questions for all 7 agents.

### Phase 2: Specialist Planning
All 7 specialists contributed domain plans. Key findings:
- **ux-strategy**: Five natural capability clusters; trust gap (recoverability → verifiability → reliability) is the real problem
- **security**: 4 of 8 [must] are hard gates; HSTS/hashed-IP/ToS are quick wins; key versioning before any rotation
- **api-design**: Cursor-based KV pagination; X-RateLimit-Limit only; CORS is highest-impact API item; 3-phase per-tenant evolution
- **iac**: KV sufficient for auth; D1 only for queries; session pre-warming is only scaling item worth planning; CD alongside multi-user
- **gru**: RFC 3161 is the one signing investment; MCP should elevate; don't chase forensic fidelity
- **product-marketing**: Five launch moments; three-act narrative; reframe to "evidence"; minimum second-user package identified
- **lucy**: 85% [consider] items are YAGNI; 17 items exist only because agents raised them; actionable backlog is ~10 items

Two specialists recommended additional agents (api-design → data-minion/devx-minion; iac → observability-minion). Gaps adequately covered by existing contributions; no second round spawned.

### Phase 3: Synthesis
Nefario synthesized 7 specialist contributions into a three-act advisory roadmap. Resolved 5 conflicts (TSA timing, MCP priority, [must] tier validity, backlog cleanup scope, CORS priority). Produced 18 roadmap items, 28 parked items, 13 dropped items. Every backlog entry explicitly addressed.

### Phases 3.5-8
Skipped (advisory-only orchestration).

## Agent Contributions

<details>
<summary>Planning agents (7)</summary>

| Agent | Phase | Key Contribution |
|-------|-------|-----------------|
| ux-strategy-minion | planning | Three-gap trust model; five capability clusters; value cliff identification |
| security-minion | planning | Auth staging analysis (4 hard gates vs 4 stageable); quick-win security items; signing chain depth |
| api-design-minion | planning | List endpoint design (cursor+envelope); rate limit scope guard; per-tenant API evolution path |
| iac-minion | planning | KV vs D1 decision (KV sufficient for auth); scaling threshold analysis; CD timing |
| gru | planning | TSA as sole near-term signing investment; MCP elevation argument; Browser Rendering limitations assessment |
| product-marketing-minion | planning | Launch moment identification; "evidence" vs "archival" reframe; three-act narrative arc |
| lucy | planning | YAGNI audit (85% [consider] items); [must] tier challenge; agent-enthusiasm detection (17 items) |

</details>

## Team Recommendation

### Executive Summary

The team recommends a three-act roadmap that transforms WRL's 70+ item backlog into ~18 sequenced items across three horizons. Act 1 ("Solid Foundation") closes the trust gaps for the current single operator. Act 2 ("Evidence-Grade") makes the "evidence" claim defensible with RFC 3161 timestamps and prepares for multi-tenancy. Act 3 ("Infrastructure") expands the audience via MCP, web UI, and batch capture. The multi-user decision is the single most important strategic choice -- the roadmap sequences work so it can be made deliberately rather than forced by premature investment.

### Team Consensus

1. List endpoint is the #1 priority (unanimous)
2. Key versioning must ship before first key rotation (4/7 flagged independently)
3. RFC 3161 timestamps are the one signing upgrade worth investment (5/7 agree, 1 defers)
4. ~85% of [consider] items are YAGNI (lucy audit, no dissent)
5. Multi-tenancy should wait for real demand (5/7 agree)
6. HSTS preload, hashed IP, ToS are quick wins (security-minion, no dissent)
7. "Evidence" framing stronger than "archival" (2/7 argued, no dissent)
8. KV sufficient for auth; D1 only for queries (2/7 agreed, no dissent)

### Dissenting Views

- **TSA timing**: security-minion wants demand-driven trigger; ux-strategy wants Phase 3 (soon); gru says Trial/H2 2026. Resolution: mid-term, triggered by key versioning completion.
- **MCP priority**: gru argues for [should] elevation; lucy flags as unvalidated. Resolution: Act 3, but acknowledged as real opportunity with low implementation cost.
- **[must] tier**: lucy argues downgrade all; security-minion defends conditional accuracy. Resolution: reframe as conditional ("must before multi-user").

### The Roadmap

See the full roadmap in the [advisory synthesis](./2026-03-15-103905-prioritized-product-roadmap/phase3-synthesis.md) -- 18 items (R1-R18) across three acts, with every backlog item addressed.

**Act 1 "Solid Foundation" (near-term, next 1-3 phases)**:
R1. List captures endpoint, R2. Key versioning, R3. CORS for capture POST, R4. HSTS preload, R5. Rate limit header, R6. Hashed IP logging, R7. ToS/abuse policy, R8. Auth identity enrichment, R9. Staging environment, R10. Backlog cleanup

**Act 2 "Evidence-Grade" (mid-term)**:
R11. RFC 3161 timestamps, R12. Per-tenant keys (demand-gated), R13. Audit logging, R14. Production CD pipeline

**Act 3 "Infrastructure" (longer-horizon)**:
R15. MCP server, R16. Queue migration (data-driven), R17. Web UI, R18. Batch capture

### Conditions to Revisit

1. A second user wants access → accelerate R12
2. Capture timeout failures >5% → trigger R16
3. KV list latency >300ms → trigger D1 evaluation
4. Legal evidence request → accelerate R11/eIDAS
5. Cloudflare Containers GA → capture fidelity upgrade path
6. Backlog >25 active items → cleanup pass
7. 3+ QTSPs with pricing → eIDAS evaluation
8. Phase count >25 without Act 1 complete → scope creep signal

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` (this orchestration)

</details>

<details>
<summary>Compaction</summary>

0 compaction events during this session.

</details>

## Working Files

All specialist contributions, prompts, and synthesis outputs:
[`docs/history/nefario-reports/2026-03-15-103905-prioritized-product-roadmap/`](./2026-03-15-103905-prioritized-product-roadmap/)

Files: prompt.md, phase1-metaplan.md, phase1-metaplan-rerun.md, phase2-{ux-strategy-minion,security-minion,api-design-minion,iac-minion,gru,product-marketing-minion,lucy}.md, phase3-synthesis.md (+ corresponding -prompt.md files for each)
