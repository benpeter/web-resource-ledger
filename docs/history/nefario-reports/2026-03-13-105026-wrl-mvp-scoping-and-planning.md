---
task: Scope and plan the WRL minimum shippable product
date: 2026-03-13
slug: wrl-mvp-scoping-and-planning
mode: execution
task-count: 5
gate-count: 2
compaction-events: 2
---

## Summary

Scoped and planned the WRL (Web Resource Ledger) minimum viable product. Produced a scope document (`docs/MVP.md`) with implementation plan, a technology decisions document (`docs/evolution/0001-kickoff/decisions.md`), 8 GitHub issues (#1-#8), and an evolution log outcome. The MVP delivers the core value prop: capture a URL, store it immutably, let a third party verify the capture.

## Original Prompt

Scope and plan the WRL minimum shippable product. PRODUCT.md describes the full vision. CLAUDE.md defines the engineering philosophy (Helix Manifesto, YAGNI, KISS). The goal is the smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture.

## Key Design Decisions

1. **Bundle format: WACZ** -- ZIP with WARC records and SHA-256 manifest. Legal pedigree (Harvard LIL, Library of Congress). All upgrades additive. Rejected: directory-of-files, MHTML, custom JSON.
2. **Signing: Ed25519 self-signing** -- Fast, small (64 bytes), deterministic. Extensible `signatures` array for future TSA. Rejected: RFC 3161 in MVP (complexity), RSA (slower), blockchain (KISS violation).
3. **Infrastructure: Cloudflare-native** -- Single Worker, Browser Rendering, R2, KV. Zero ops, ~$5/month. Rejected: self-hosted Playwright, AWS Lambda+Fargate.
4. **Storage: R2 content-addressed** -- Object key = SHA-256 hash. Immutability by construction. Rejected: S3 Object Lock (egress fees), database (overkill).
5. **Auth: Static API key for capture** -- Kill switch for SSRF-capable endpoint. Verification fully public. Rejected: no auth (no kill switch), OAuth (scope explosion).
6. **API: 4 versioned endpoints** -- All under `/v1/` prefix. Async capture with polling. Rejected: synchronous capture, SSE, webhooks, unversioned URLs.
7. **Capture scope: HTML + screenshot + headers** -- Screenshot free once Browser Rendering present. Rejected: full resource manifest (complexity escalation).
8. **OpenAPI: in scope from day one** -- Small surface, low maintenance cost. Rejected: deferring spec (creates documentation debt).

## Phases

### Phase 1: Meta-Plan
Identified 7 specialists for planning: gru (technology landscape), lucy (intent alignment), margo (YAGNI/KISS), api-design-minion, iac-minion, security-minion, plus nefario for synthesis.

### Phase 2: Specialist Planning
All 7 specialists contributed domain plans. Key consensus: Cloudflare-native stack, WACZ format, Ed25519 signing, SSRF prevention as top security priority. No additional agents recommended.

### Phase 3: Synthesis
Nefario synthesized specialist contributions into a 5-task execution plan with 2 approval gates. Resolved 4 conflicts (bundle format, auth, signing approach, capture scope). All resolved in favor of the option that balanced simplicity with extensibility.

### Phase 3.5: Architecture Review
5 mandatory reviewers (security-minion, test-minion, ux-strategy-minion, lucy, margo). All returned ADVISE (0 BLOCK). 15 advisory notes incorporated into execution plan, including: Vitest test infrastructure, SSRF IPv6 hardening, DNS TOCTOU pinning, progressive enhancement dropped for graceful degradation, Issue 8 decomposition, Ed25519 key format spec, verifiable acceptance criteria.

### Phase 4: Execution
5 tasks executed sequentially with 2 approval gates:

| Task | Agent | Deliverable | Gate |
|------|-------|-------------|------|
| 1. MVP Scope Document | software-docs-minion | `docs/MVP.md` (+120 lines) | Approved (with changes: OpenAPI in scope, versioned URLs) |
| 2. Technology Decisions | software-docs-minion | `docs/evolution/0001-kickoff/decisions.md` (+52 lines) | Approved |
| 3. Implementation Plan | software-docs-minion | Appended to `docs/MVP.md` (+120 lines) | No gate |
| 4. GitHub Issues | devx-minion | Issues #1-#8 with `mvp` label | No gate |
| 5. Evolution Log Outcome | software-docs-minion | `docs/evolution/0001-kickoff/outcome.md` (+23 lines) | No gate |

### Phases 5-8
Verification: not applicable -- docs-only changes. No code, no tests, no deployment.

## Agent Contributions

### Planning (Phase 2)
- **gru**: Technology landscape assessment -- WACZ, warcio.js, FreeTSA, Cloudflare Browser Rendering, Ed25519
- **lucy**: Intent alignment -- verified MVP scope matches "smallest core value prop"
- **margo**: YAGNI/KISS enforcement -- cut Task 2 redundancy, Issue 8 decomposition, platform rate limiting
- **api-design-minion**: API surface design -- 4 endpoints, async polling, auth boundaries
- **iac-minion**: Infrastructure assessment -- Cloudflare Workers + R2 + KV, ~$5/month
- **security-minion**: SSRF prevention, Ed25519 key management, DNS pinning, API key as kill switch

### Review (Phase 3.5)
- **security-minion**: ADVISE -- IPv6 SSRF gaps, DNS TOCTOU, key format spec, capture ID entropy
- **test-minion**: ADVISE -- test infrastructure, SSRF test vectors, signing round-trip tests, integration test
- **ux-strategy-minion**: ADVISE -- capture ID recovery caveat, progressive enhancement impossible without SSR
- **lucy**: ADVISE -- pin implementation plan location, guard prompt.md, remove pre-scripted surprises
- **margo**: ADVISE -- Task 2 redundancy, Issue 8 decomposition, platform rate limiting, progressive enhancement

## Decisions

### Gate 1: MVP Scope Document
- **Outcome**: Approved with changes
- **Changes requested**: (1) OpenAPI spec moved from out-of-scope to in-scope, (2) API endpoints versioned under `/v1/`
- **Rationale**: User preference for API-first design and future-proofing against breaking changes

### Gate 2: Technology Decisions
- **Outcome**: Approved as-is
- **Rationale**: 8 decisions in terse what/why/rejected format, consistent with approved MVP scope

## Verification

Verification: not applicable -- docs-only changes. (Code review, tests, deployment: not applicable for planning-phase output.)

## Session Resources

### Skills Invoked
- `/nefario` (this orchestration)

### Compaction
2 compaction events (after Phase 3 synthesis, after Phase 3.5 review).

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/`

Files: phase1-metaplan.md, phase2-{gru,lucy,margo,api-design-minion,iac-minion,security-minion}{,-prompt}.md, phase3-synthesis{,-prompt}.md, phase3.5-{security-minion,test-minion,ux-strategy-minion,lucy,margo}{,-prompt}.md, phase4-task{1-5}-*-prompt.md, prompt.md (31 files total)
