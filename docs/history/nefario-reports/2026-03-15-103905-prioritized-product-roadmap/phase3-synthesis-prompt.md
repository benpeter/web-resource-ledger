MODE: SYNTHESIS
ADVISORY: true

You are synthesizing specialist planning contributions into a team recommendation. This is an advisory-only orchestration -- no code will be written, no branches created, no PRs opened.

Do NOT produce task prompts, agent assignments, execution order, approval gates, or delegation plan structure. Produce an advisory report with the structure described below.

## Original Task
Review backlog and produce a prioritized product roadmap for WRL (Web Resource Ledger).

**Outcome**: The existing backlog (`docs/backlog.md`) is transformed into a sequenced product roadmap that defines a meaningful evolution path for WRL. Each roadmap item is scoped and described well enough to become a GitHub issue without further research, so that issue creation is a mechanical follow-up step rather than a planning session.

**Success criteria**:
- Every backlog item is explicitly addressed (prioritized, deferred, or dropped with rationale)
- Roadmap items are sequenced with dependency reasoning (what enables what)
- Each item has a one-line summary, outcome statement, and rough scope — sufficient to seed a GitHub issue title + body
- The roadmap distinguishes between near-term (next 1-3 phases), mid-term, and longer-horizon work
- Product coherence: the sequence tells a story of incremental value, not a grab-bag of tasks

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-gru.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-product-marketing-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-lucy.md

## Key consensus across specialists:
- ux-strategy: Three-gap trust model. Five clusters: A=list endpoint, B=key versioning+TSA, C=multi-tenancy, D=reliability, E=platform. Sequence A→B→D-selective, C/E on demand.
- security: 4 of 8 [must] are hard gates for multi-user. HSTS preload, hashed IP, moderation policy are quick wins. Key versioning before first rotation. Defer TSA/eIDAS.
- api-design: List endpoint with cursor-based KV pagination, status filter. Rate limit: X-RateLimit-Limit only. CORS for capture POST is highest-impact. Per-tenant keys via 3-phase transparent evolution.
- iac: KV sufficient for per-tenant auth. D1 only for query filtering. Session pre-warming is only worthwhile scaling item. CD alongside per-tenant auth.
- gru: RFC 3161 TSA is the one near-term signing investment. MCP triggers should move up to [should]. Browser Rendering limitations real but not blocking. Don't chase forensic fidelity.
- product-marketing: Five launch moments. Three-act narrative: "Ready for Others" → "Evidence-Grade" → "Infrastructure". Reframe to "web evidence". Minimum second-user package: list, tenant keys, key versioning, abuse policy.
- lucy: 85% of [consider] items are YAGNI. All [must] should be downgraded (multi-user decision unmade). 17 items exist only because agents raised them. Actionable backlog is ~10 items.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions (read the full files, not just summaries)
2. Resolve any conflicts between recommendations
3. Identify consensus and dissent -- preserve minority positions
4. Produce an advisory report with:
   - **Executive Summary**: 1-paragraph synthesis of the team's recommendation
   - **Team Consensus**: What all specialists agree on
   - **Dissenting Views**: Where specialists disagreed and how the conflict was resolved
   - **The Roadmap**: A concrete, sequenced roadmap document that addresses every backlog item. For each roadmap item include:
     - One-line summary (suitable as a GitHub issue title)
     - Outcome statement (what changes when this ships)
     - Rough scope (S/M/L)
     - Dependencies (what must ship first)
     - Horizon: near-term (next 1-3 phases), mid-term, or longer-horizon
   - **Dropped/Parked Items**: Backlog items explicitly not in the roadmap, with rationale
   - **Risks**: Key risks the roadmap must navigate
   - **Conflict Resolutions**: How competing positions were resolved
   - **Next Steps**: What should happen after this advisory
   - **Conditions to Revisit**: Under what circumstances this roadmap should be reconsidered

5. Also read `docs/backlog.md` to ensure every single item is addressed (prioritized, deferred, or dropped)
6. Write your complete advisory synthesis to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase3-synthesis.md
