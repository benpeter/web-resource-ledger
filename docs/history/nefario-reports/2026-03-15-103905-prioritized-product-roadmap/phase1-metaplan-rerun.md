# Meta-Plan: Prioritized Product Roadmap (Revised)

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

## Team Adjustment

**Added**: product-marketing-minion, lucy
**Removed**: none
**Revised team**: ux-strategy-minion, security-minion, api-design-minion, iac-minion, gru, product-marketing-minion, lucy

### Why the additions matter

- **product-marketing-minion**: WRL serves a dual purpose -- real product AND despicable-agents showcase. The roadmap needs to tell two stories: one for potential adopters (what value does WRL deliver, in what order?) and one for the despicable-agents audience (what does this demonstrate about agent-built software?). product-marketing-minion can identify which roadmap sequences create the strongest positioning narrative and which items, when shipped, constitute meaningful "launch moments" worth communicating.
- **lucy**: Normally a Phase 3.5 governance reviewer, lucy is promoted to planning because intent alignment is critical for a roadmap exercise. The backlog was accumulated from 15 phases of specialist recommendations -- some items may have drifted from the project's actual goals. lucy can evaluate whether the backlog itself is internally consistent with CLAUDE.md's engineering philosophy (YAGNI, KISS, Helix Manifesto) and flag items that were added speculatively by agents but never validated against human intent.

## Planning Consultations

### Consultation 1: Product & User Journey Strategy
- **Agent**: ux-strategy-minion
- **Planning question**: Given WRL's current single-operator/API-only state and the backlog of ~60 items, what is the most coherent user journey evolution? Specifically: (1) What capabilities does a real user need next to go from "I can capture a URL" to "I rely on WRL for evidence"? (2) Which backlog items form natural clusters that deliver meaningful capability jumps vs. incremental polish? (3) The backlog has items ranging from "list endpoint" to "eIDAS qualified TSA" -- where is the value cliff where we're building for hypothetical users rather than actual need? Focus on the user value sequencing; product-marketing-minion will separately address positioning and launch narratives, and lucy will evaluate YAGNI alignment -- so concentrate on the journey coherence and capability clustering that are uniquely your domain.
- **Context to provide**: `docs/backlog.md`, `docs/MVP.md` (What's Out section), `README.md` (usage flow showing the lost-ID problem)
- **Why this agent**: The roadmap must tell a story of incremental user value, not just a technical dependency sort. ux-strategy-minion can identify which capabilities unlock real usage patterns vs. which are speculative infrastructure.

### Consultation 2: Security Sequencing
- **Agent**: security-minion
- **Planning question**: The backlog has 8 `[must]` items in Auth/Access Control, all flagged as "required before multi-user." (1) What is the minimum viable security posture upgrade needed before a second user touches WRL -- is it all 8, or can some be staged? (2) Among the `[should]` security items (content scanning, content moderation, hashed IP logging, HSTS preload), which have the highest risk-to-effort ratio and should move earlier? (3) The signing/legal section has a chain: key versioning -> old key archive -> RFC 3161 TSA -> eIDAS. What is the right depth to commit to in the near-term vs. deferring? Note: api-design-minion will address how per-tenant keys affect the API contract, and iac-minion will assess infrastructure prerequisites (e.g., D1 vs. KV for key storage) -- focus your analysis on the security sequencing and threat model aspects.
- **Context to provide**: `docs/backlog.md` (Auth, Security, Signing sections), current auth implementation in `src/index.js` (single static API key), current signing in `src/signing.js`
- **Why this agent**: Security items dominate the `[must]` tier. Getting the sequencing wrong means either shipping insecure multi-user support or over-investing in security before there are users. security-minion can distinguish "blocker" from "hardening."

### Consultation 3: API & Developer Experience Evolution
- **Agent**: api-design-minion
- **Planning question**: The MVP has 4 endpoints and the backlog's #1 API item is `GET /v1/captures` (list/search). (1) What should the list endpoint look like to be useful without over-engineering (filtering, pagination, sorting are all separate backlog items)? (2) Rate limit headers (`X-RateLimit-*`) are partially done -- what's the right scope for completing them? (3) Among the `[consider]` API items (webhooks, batch capture, SSE/WebSocket, CORS for capture POST), which would most improve the developer experience for realistic integration patterns? (4) How does the API need to evolve to support per-tenant keys without breaking the existing v1 contract? Note: security-minion covers the threat model for per-tenant auth, and iac-minion covers infrastructure prerequisites -- keep your focus on the API contract, developer experience, and backward compatibility dimensions.
- **Context to provide**: `docs/backlog.md` (API section), `openapi.yaml`, current endpoint implementations
- **Why this agent**: API surface changes are hard to reverse and have cascading effects on documentation, SDKs, and client code. The list endpoint in particular is called out as "first addition post-MVP" and needs careful design.

### Consultation 4: Infrastructure & Scaling Assessment
- **Agent**: iac-minion
- **Planning question**: The backlog has operational items spanning CI/CD enhancements, queue migration, scaling options, and storage considerations. (1) What infrastructure changes are prerequisites for other roadmap items (e.g., does per-tenant auth need D1 for key storage, or can KV handle it)? (2) The "Scaling Beyond Session Reuse" section lists 4 options (pre-warming, Queues, DO, Containers) -- at what scale threshold do these become relevant, and should any be planned proactively? (3) CD (deployment automation) is deferred -- when should it become a priority relative to other work? (4) Preview deployments on PRs -- worth it for a single-developer project? Note: security-minion owns the auth sequencing and api-design-minion owns the API contract evolution -- focus on the infrastructure enablement and operational readiness that other agents' plans depend on.
- **Context to provide**: `docs/backlog.md` (Operations, Storage, Scaling sections), `wrangler.toml`, current CI setup
- **Why this agent**: Infrastructure decisions constrain what product features are feasible. Knowing whether KV is sufficient for per-tenant keys vs. needing D1 changes the sequencing of auth work.

### Consultation 5: Technology Landscape & Strategic Direction
- **Agent**: gru
- **Planning question**: WRL occupies a niche between legal-tech evidence platforms and web archiving tools. (1) Looking at the `[consider]` items around eIDAS, WACZ-Auth, domain-ownership certificates, and HSM-backed keys -- which of these represent genuine market differentiation vs. over-investment for a single-operator tool? (2) The MCP/AI-agent trigger item is tagged `[consider]` -- given the current trajectory of AI agent tooling, should this move up? (3) Cloudflare's Browser Rendering API has limitations (no cert info, no network timing) -- are there emerging alternatives or Cloudflare roadmap items that change the capture fidelity calculus? Note: product-marketing-minion will evaluate these same items through a positioning lens (which items create compelling launch moments); your focus is on technology viability, timing, and strategic staying power.
- **Context to provide**: `docs/backlog.md` (Signing, Product Features, Capture Fidelity sections), `docs/MVP.md` (technology stack rationale)
- **Why this agent**: gru provides the strategic lens on which investments have staying power. The backlog has items spanning "next month" to "maybe never" -- gru can help calibrate which `[consider]` items deserve roadmap placement vs. being explicitly parked.

### Consultation 6: Product Positioning & Launch Sequencing
- **Agent**: product-marketing-minion
- **Planning question**: WRL is both a real product (tamper-evident web archival) and a showcase for the despicable-agents framework. The roadmap needs to serve both narratives. (1) Looking at the backlog items, which ones -- when shipped -- create meaningful "launch moments" worth announcing (blog post, README update, social mention)? Not every roadmap item is a launch moment; identify the 3-5 that most change WRL's positioning. (2) For the adopter audience: what is the current value proposition gap? Today WRL is "capture a URL and verify it." What is the smallest set of additions that upgrades the pitch to something an independent adopter would use? (3) For the despicable-agents audience: which roadmap items best demonstrate multi-agent orchestration capability? (4) Does the roadmap sequence -- as a narrative arc -- build credibility, or does it feel like random feature accretion? Note: ux-strategy-minion covers user journey coherence and gru covers technology viability -- your focus is on the external communication value and positioning impact of the sequencing decisions.
- **Context to provide**: `docs/backlog.md`, `README.md`, `docs/evolution/README.md` (to see the build story so far), `docs/MVP.md` (What's Out section for context on what was deliberately deferred)
- **Why this agent**: A roadmap that makes technical sense but tells no story externally is a missed opportunity. product-marketing-minion identifies which items move the positioning needle and ensures the sequencing creates a coherent narrative arc for both audiences.

### Consultation 7: Intent Alignment & YAGNI Audit
- **Agent**: lucy
- **Planning question**: The backlog was accumulated from 15 phases of specialist agent recommendations. Some items may reflect agent enthusiasm rather than genuine human intent. (1) Review the backlog against the project's stated philosophy (CLAUDE.md: YAGNI, KISS, Helix Manifesto, "prefer lightweight vanilla solutions"). Which items appear to violate these principles -- things that were added speculatively by agents and never validated by the human? (2) The project's CLAUDE.md says WRL is both a real product AND a despicable-agents showcase. Does the backlog balance these goals, or has one side accumulated disproportionate scope? (3) Are there items in the `[must]` tier that should be downgraded? The `[must]` items were all flagged by security-minion during kickoff -- is "must before multi-user" the right framing when multi-user isn't even on the near-term horizon? (4) Are there backlog items that exist solely because an agent raised them during planning, with no evidence the human operator actually needs them? Note: margo will review the final plan for over-engineering in Phase 3.5; your role here is earlier -- auditing the backlog inputs before they become roadmap items, catching intent drift at the source rather than at the output.
- **Context to provide**: `docs/backlog.md`, `CLAUDE.md`, `CLAUDE.local.md`, `docs/MVP.md` (constraints section showing original philosophy), `docs/evolution/README.md` (to trace where items originated)
- **Why this agent**: Intent drift is the #1 failure mode in multi-phase orchestration. The backlog has been shaped by agent recommendations across 15 phases -- lucy can catch items that drifted in without human validation. This is especially important for a roadmap exercise: prioritizing agent-generated noise wastes the roadmap's most valuable real estate.

### Cross-Cutting Checklist

- **Testing** (test-minion): NOT included for planning. This is a roadmap/planning exercise that produces a document, not code. test-minion adds no planning value here. Testing strategy for individual roadmap items will be addressed when those items are executed.
- **Security** (security-minion): INCLUDED as Consultation 2. Security items dominate the `[must]` tier and their sequencing is a core planning question.
- **Usability -- Strategy** (ux-strategy-minion): INCLUDED as Consultation 1. The roadmap is fundamentally a user value sequencing problem.
- **Usability -- Design** (ux-design-minion / accessibility-minion): NOT included for planning. No UI design decisions are being made in this roadmap exercise. The verification page and any future web UI will be addressed when those items are executed.
- **Documentation** (software-docs-minion / user-docs-minion): NOT included for planning. The roadmap itself is the document being produced. Documentation needs for individual roadmap items will be scoped within those items. Neither docs agent has unique planning insight for "which backlog items come first."
- **Observability** (observability-minion / sitespeed-minion): NOT included for planning. Coralogix integration is done. The backlog has alerting/dashboard items that are straightforward to sequence without specialist planning input. These will be placed in the roadmap based on the operational maturity story.

### Anticipated Approval Gates

1. **Roadmap document** (single gate): The entire roadmap is a single deliverable that determines the project's evolution path. This is HIGH blast radius (all future work depends on it) and HARD to reverse (re-sequencing after work has started is expensive). This is a MUST gate. The gate should present: the proposed sequencing with dependency reasoning, any items proposed for dropping, and the near-term vs. mid-term vs. horizon classification.

No other gates are expected -- this is a planning/document-production task, not a multi-deliverable execution.

### Rationale

Seven specialists were chosen because the roadmap requires five technical/strategic perspectives (unchanged from the original) plus two new dimensions that strengthen the output:

**Original five (unchanged)**:
- **ux-strategy-minion** provides the user-value lens that prevents the roadmap from becoming a technical dependency graph with no product coherence.
- **security-minion** is essential because auth/security items are the primary gate between "single operator tool" and "multi-user product" -- getting this sequencing wrong is the highest-risk planning mistake.
- **api-design-minion** owns the API surface, which is WRL's primary interface. The list endpoint design and per-tenant auth integration are contract decisions that constrain everything downstream.
- **iac-minion** identifies infrastructure prerequisites that could re-sequence product features (e.g., if per-tenant keys need D1, that infrastructure work must precede the auth work).
- **gru** provides strategic calibration on which investments have staying power. The backlog has items spanning "next month" to "maybe never" -- gru can help calibrate which `[consider]` items deserve roadmap placement vs. being explicitly parked.

**Added two**:
- **product-marketing-minion** ensures the roadmap sequence tells a coherent story externally, not just internally. WRL's dual-purpose nature (product + showcase) means sequencing decisions have communication implications. product-marketing-minion identifies which items create launch moments and whether the arc builds credibility.
- **lucy** audits the backlog inputs before they become roadmap items. With 15 phases of agent-generated recommendations, intent drift is a real risk. lucy evaluates whether the `[must]` tier is genuinely must, whether `[consider]` items reflect human intent or agent enthusiasm, and whether the backlog's balance matches the project's stated philosophy.

**Agents NOT included in planning**:
- **margo** is a governance reviewer who will review the final plan in Phase 3.5, not a planning contributor. Her concerns (YAGNI, scope creep, over-engineering) are complementary to lucy's but best applied as review of the proposed roadmap rather than input to its construction. lucy catches intent drift in the inputs; margo catches over-engineering in the output.
- **observability-minion**, **test-minion**, **software-docs-minion**, **user-docs-minion** have no unique planning expertise for a roadmap prioritization exercise. Their domains will be scoped within individual roadmap items.

### Scope

**In scope**:
- Reviewing all ~60 backlog items and their sources/rationale
- Classifying each item into near-term (next 1-3 phases), mid-term, or longer-horizon
- Sequencing with explicit dependency reasoning
- Scoping each roadmap item to be issue-ready (title, outcome, rough scope)
- Dropping items with explicit rationale where appropriate
- Identifying natural phase boundaries that deliver coherent capability jumps
- Evaluating backlog items for intent alignment and YAGNI compliance
- Identifying which roadmap milestones serve as external communication moments

**Out of scope**:
- Creating GitHub issues (mechanical follow-up, not part of this task)
- Writing code or changing architecture
- Modifying the backlog document format
- Detailed technical design of individual roadmap items
- Execution timeline estimates (phases are sequenced, not calendared)

### External Skill Integration

No external skills detected in project. Neither `.claude/skills/` nor `.skills/` directories exist in the working directory. User-global skills (`~/.claude/skills/`) are framework skills (nefario, despicable-prompter) or unrelated domain skills (obsidian-tasks, transcribe, juli, etc.) -- none are relevant to product roadmap planning.
