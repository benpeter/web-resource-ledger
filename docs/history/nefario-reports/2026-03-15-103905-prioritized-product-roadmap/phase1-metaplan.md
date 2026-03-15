# Meta-Plan: Prioritized Product Roadmap

## Task Summary

Transform the existing backlog (`docs/backlog.md`) into a sequenced product roadmap. The backlog contains ~60 items across 10 categories, accumulated from 15 evolution phases (0001-0015). The MVP is complete, 3 post-MVP phases are done (open-source readiness, session reuse, Coralogix logging), and all 11 GitHub issues are closed. The roadmap must sequence every backlog item into a coherent evolution path that tells a story of incremental value.

## Context

WRL is a tamper-evident web archival service running on Cloudflare Workers. Current state:
- **Core pipeline complete**: URL -> browser render -> WACZ bundle -> R2 storage -> KV metadata -> public verification
- **Security layer**: SSRF prevention, API key auth, rate limiting, cross-domain navigation blocking
- **Observability**: Structured logging to Coralogix (no alerting/dashboards yet)
- **Performance**: Playwright session reuse gives ~300 captures/min capacity
- **No open issues**, no list endpoint, single static API key, single-operator deployment
- **Dual purpose**: real product AND despicable-agents showcase

Key backlog characteristics:
- 8 `[must]` items (mostly auth/access control -- required before multi-user)
- ~12 `[should]` items (signing upgrades, operational hardening, capture fidelity)
- ~40 `[consider]` items (product features, scaling, advanced security)
- Some items already marked DONE/PARTIAL with strikethrough
- Several items have inter-dependencies (e.g., list endpoint enables pagination; per-tenant keys enable per-tenant rate limiting; TSA requires key versioning)

## Planning Consultations

### Consultation 1: Product & User Journey Strategy
- **Agent**: ux-strategy-minion
- **Planning question**: Given WRL's current single-operator/API-only state and the backlog of ~60 items, what is the most coherent user journey evolution? Specifically: (1) What capabilities does a real user need next to go from "I can capture a URL" to "I rely on WRL for evidence"? (2) Which backlog items form natural clusters that deliver meaningful capability jumps vs. incremental polish? (3) The backlog has items ranging from "list endpoint" to "eIDAS qualified TSA" -- where is the value cliff where we're building for hypothetical users rather than actual need?
- **Context to provide**: `docs/backlog.md`, `docs/MVP.md` (What's Out section), `README.md` (usage flow showing the lost-ID problem)
- **Why this agent**: The roadmap must tell a story of incremental user value, not just a technical dependency sort. ux-strategy-minion can identify which capabilities unlock real usage patterns vs. which are speculative infrastructure.

### Consultation 2: Security Sequencing
- **Agent**: security-minion
- **Planning question**: The backlog has 8 `[must]` items in Auth/Access Control, all flagged as "required before multi-user." (1) What is the minimum viable security posture upgrade needed before a second user touches WRL -- is it all 8, or can some be staged? (2) Among the `[should]` security items (content scanning, content moderation, hashed IP logging, HSTS preload), which have the highest risk-to-effort ratio and should move earlier? (3) The signing/legal section has a chain: key versioning -> old key archive -> RFC 3161 TSA -> eIDAS. What is the right depth to commit to in the near-term vs. deferring?
- **Context to provide**: `docs/backlog.md` (Auth, Security, Signing sections), current auth implementation in `src/index.js` (single static API key), current signing in `src/signing.js`
- **Why this agent**: Security items dominate the `[must]` tier. Getting the sequencing wrong means either shipping insecure multi-user support or over-investing in security before there are users. security-minion can distinguish "blocker" from "hardening."

### Consultation 3: API & Developer Experience Evolution
- **Agent**: api-design-minion
- **Planning question**: The MVP has 4 endpoints and the backlog's #1 API item is `GET /v1/captures` (list/search). (1) What should the list endpoint look like to be useful without over-engineering (filtering, pagination, sorting are all separate backlog items)? (2) Rate limit headers (`X-RateLimit-*`) are partially done -- what's the right scope for completing them? (3) Among the `[consider]` API items (webhooks, batch capture, SSE/WebSocket, CORS for capture POST), which would most improve the developer experience for realistic integration patterns? (4) How does the API need to evolve to support per-tenant keys without breaking the existing v1 contract?
- **Context to provide**: `docs/backlog.md` (API section), `openapi.yaml`, current endpoint implementations
- **Why this agent**: API surface changes are hard to reverse and have cascading effects on documentation, SDKs, and client code. The list endpoint in particular is called out as "first addition post-MVP" and needs careful design.

### Consultation 4: Infrastructure & Scaling Assessment
- **Agent**: iac-minion
- **Planning question**: The backlog has operational items spanning CI/CD enhancements, queue migration, scaling options, and storage considerations. (1) What infrastructure changes are prerequisites for other roadmap items (e.g., does per-tenant auth need D1 for key storage, or can KV handle it)? (2) The "Scaling Beyond Session Reuse" section lists 4 options (pre-warming, Queues, DO, Containers) -- at what scale threshold do these become relevant, and should any be planned proactively? (3) CD (deployment automation) is deferred -- when should it become a priority relative to other work? (4) Preview deployments on PRs -- worth it for a single-developer project?
- **Context to provide**: `docs/backlog.md` (Operations, Storage, Scaling sections), `wrangler.toml`, current CI setup
- **Why this agent**: Infrastructure decisions constrain what product features are feasible. Knowing whether KV is sufficient for per-tenant keys vs. needing D1 changes the sequencing of auth work.

### Consultation 5: Technology Landscape & Strategic Direction
- **Agent**: gru
- **Planning question**: WRL occupies a niche between legal-tech evidence platforms and web archiving tools. (1) Looking at the `[consider]` items around eIDAS, WACZ-Auth, domain-ownership certificates, and HSM-backed keys -- which of these represent genuine market differentiation vs. over-investment for a single-operator tool? (2) The MCP/AI-agent trigger item is tagged `[consider]` -- given the current trajectory of AI agent tooling, should this move up? (3) Cloudflare's Browser Rendering API has limitations (no cert info, no network timing) -- are there emerging alternatives or Cloudflare roadmap items that change the capture fidelity calculus?
- **Context to provide**: `docs/backlog.md` (Signing, Product Features, Capture Fidelity sections), `docs/MVP.md` (technology stack rationale)
- **Why this agent**: gru provides the strategic lens on which investments have staying power. The backlog has items spanning "next month" to "maybe never" -- gru can help calibrate which `[consider]` items deserve roadmap placement vs. being explicitly parked.

### Cross-Cutting Checklist

- **Testing** (test-minion): NOT included for planning. This is a roadmap/planning exercise that produces a document, not code. test-minion adds no planning value here. Testing strategy for individual roadmap items will be addressed when those items are executed.
- **Security** (security-minion): INCLUDED as Consultation 2. Security items dominate the `[must]` tier and their sequencing is a core planning question.
- **Usability -- Strategy** (ux-strategy-minion): INCLUDED as Consultation 1. The roadmap is fundamentally a user value sequencing problem.
- **Usability -- Design** (ux-design-minion / accessibility-minion): NOT included for planning. No UI design decisions are being made in this roadmap exercise. The verification page and any future web UI will be addressed when those items are executed.
- **Documentation** (software-docs-minion): NOT included for planning. The roadmap itself is the document being produced. Documentation needs for individual roadmap items will be scoped within those items. software-docs-minion has no unique planning insight for "which backlog items come first."
- **Observability** (observability-minion): NOT included for planning. Coralogix integration is done. The backlog has alerting/dashboard items that are straightforward to sequence without specialist planning input. These will be placed in the roadmap based on the operational maturity story.

### Anticipated Approval Gates

1. **Roadmap document** (single gate): The entire roadmap is a single deliverable that determines the project's evolution path. This is HIGH blast radius (all future work depends on it) and HARD to reverse (re-sequencing after work has started is expensive). This is a MUST gate. The gate should present: the proposed sequencing with dependency reasoning, any items proposed for dropping, and the near-term vs. mid-term vs. horizon classification.

No other gates are expected -- this is a planning/document-production task, not a multi-deliverable execution.

### Rationale

Five specialists were chosen because the roadmap requires four distinct expert perspectives plus strategic calibration:

- **ux-strategy-minion** provides the user-value lens that prevents the roadmap from becoming a technical dependency graph with no product coherence.
- **security-minion** is essential because auth/security items are the primary gate between "single operator tool" and "multi-user product" -- getting this sequencing wrong is the highest-risk planning mistake.
- **api-design-minion** owns the API surface, which is WRL's primary interface. The list endpoint design and per-tenant auth integration are contract decisions that constrain everything downstream.
- **iac-minion** identifies infrastructure prerequisites that could re-sequence product features (e.g., if per-tenant keys need D1, that infrastructure work must precede the auth work).
- **gru** provides strategic calibration on which `[consider]` items represent real investment vs. speculative scope, particularly around legal-tech positioning and emerging platform capabilities.

Agents NOT included in planning:
- **margo** and **lucy** are governance reviewers who will review the plan in Phase 3.5, not plan contributors. Their concerns (YAGNI, scope creep, intent alignment) are best applied as review of the proposed roadmap rather than input to its construction.
- **observability-minion**, **test-minion**, **software-docs-minion** have no unique planning expertise for a roadmap prioritization exercise. Their domains will be scoped within individual roadmap items.

### Scope

**In scope**:
- Reviewing all ~60 backlog items and their sources/rationale
- Classifying each item into near-term (next 1-3 phases), mid-term, or longer-horizon
- Sequencing with explicit dependency reasoning
- Scoping each roadmap item to be issue-ready (title, outcome, rough scope)
- Dropping items with explicit rationale where appropriate
- Identifying natural phase boundaries that deliver coherent capability jumps

**Out of scope**:
- Creating GitHub issues (mechanical follow-up, not part of this task)
- Writing code or changing architecture
- Modifying the backlog document format
- Detailed technical design of individual roadmap items
- Execution timeline estimates (phases are sequenced, not calendared)

### External Skill Integration

No external skills detected in project. Neither `.claude/skills/` nor `.skills/` directories exist in the working directory. User-global skills (`~/.claude/skills/`) are framework skills (nefario, despicable-prompter) or unrelated domain skills (obsidian-tasks, transcribe, juli, etc.) -- none are relevant to product roadmap planning.
