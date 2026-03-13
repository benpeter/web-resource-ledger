# Meta-Plan: WRL Minimum Shippable Product Scoping

## Task Summary

Define the MVP scope for Web Resource Ledger (capture URL, store immutably, verify by third party), produce docs/MVP.md, a sequenced implementation plan, and GitHub issues for each work unit.

## Planning Consultations

### Consultation 1: Technology Landscape Assessment

- **Agent**: gru
- **Planning question**: Given the WRL product vision (capture web resources, store immutably with cryptographic proof, public verification), what is the current technology landscape for: (a) web archival bundle formats (WARC vs MHTML vs custom), (b) cryptographic timestamping approaches (RFC 3161 TSA vs blockchain-anchored vs simpler HMAC-based), (c) headless browser capture engines (Playwright vs Puppeteer vs lightweight alternatives), and (d) immutable storage backends suitable for MVP (S3 with object lock vs R2 vs simpler file-hash-based approach)? For each, recommend the simplest viable option that doesn't close the door on legal admissibility later. Factor in the technology bias toward Fastly/Cloudflare edge platforms, JavaScript/TypeScript, and Helix/Franklin architecture patterns.
- **Context to provide**: PRODUCT.md (full vision), CLAUDE.md (Helix Manifesto engineering philosophy), CLAUDE.local.md (technology bias toward Adobe-adjacent tech, Fastly/Cloudflare, JS/TS preference). Emphasize that MVP should pick the simplest option that doesn't create technical debt for the legal admissibility path.
- **Why this agent**: gru evaluates technology choices and adopt/hold/wait decisions. The bundle format, signing approach, and storage backend are foundational choices that constrain everything downstream. Getting these wrong at MVP means a painful rewrite.

### Consultation 2: Intent Alignment and Scope Guard

- **Agent**: lucy
- **Planning question**: Review the original user prompt (docs/evolution/0001-kickoff/prompt.md) against PRODUCT.md and identify: (a) which PRODUCT.md features are clearly in-scope for "the smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture", (b) which features are clearly out of MVP scope, (c) which features are in a gray zone where reasonable people could disagree, and (d) what conventions from CLAUDE.md must the MVP plan respect (evolution log, dual-purpose showcase, engineering philosophy)? Flag any tension between the "more code less blah blah" principle and the evolution log documentation requirement -- how should the plan balance these?
- **Context to provide**: PRODUCT.md, CLAUDE.md, docs/evolution/0001-kickoff/prompt.md. The user's stated goal is explicitly "capture a URL, store it immutably, and let a third party verify the capture" -- use this as the litmus test for in/out.
- **Why this agent**: lucy ensures the plan stays true to human intent and repo conventions. The biggest risk in MVP scoping is scope creep disguised as "essential" features. lucy's job is to hold the line on what the user actually asked for.

### Consultation 3: Simplicity and YAGNI Enforcement

- **Agent**: margo
- **Planning question**: Given the PRODUCT.md feature list and the MVP goal ("capture a URL, store it immutably, and let a third party verify"), audit the following for over-engineering risk: (a) Do we need multi-tenancy, auth, or user management for MVP? (b) Do we need a web UI for MVP, or is API-only sufficient? (c) Do we need scheduled captures / watch lists for MVP, or is on-demand-only enough? (d) Do we need change detection for MVP? (e) Do we need notifications for MVP? (f) Should the MVP use a database at all, or can we get away with the filesystem / blob storage as the only state? (g) Is an OpenAPI spec necessary for MVP, or can we spec it later when the API surface stabilizes? For each, give a clear in/out recommendation with rationale grounded in YAGNI/KISS.
- **Context to provide**: PRODUCT.md, CLAUDE.md (especially the Helix Manifesto principles). Frame each question as: "Does the MVP user story require this to deliver the core value prop?"
- **Why this agent**: margo prevents over-engineering and scope creep. PRODUCT.md describes a full-featured product; the risk is building a "small version of everything" instead of a "complete version of the essential thing." margo's YAGNI lens is critical for cutting scope ruthlessly.

### Consultation 4: API Surface Design for MVP

- **Agent**: api-design-minion
- **Planning question**: For an MVP with three core operations -- (1) capture a URL (submit + async result), (2) retrieve a capture by ID, (3) verify a capture's authenticity -- what is the minimal API surface? Specifically: (a) What HTTP methods/endpoints? (b) Should capture be synchronous or asynchronous (capture could take 5-30 seconds for rendering)? If async, what's the simplest polling/callback pattern? (c) What does the verification endpoint look like -- does it return a boolean, a signed attestation, or a full proof bundle? (d) What error model is appropriate for MVP (simple HTTP status codes vs structured error responses)? Keep it minimal -- this is the foundation that everything else builds on top of.
- **Context to provide**: PRODUCT.md (API-first principle, verification endpoint description), CLAUDE.md (KISS, <300ms latency target for uncached ops). Note the latency target is for uncached operations -- capture itself will be async, but retrieval and verification must be fast.
- **Why this agent**: The API surface is the contract everything else depends on -- the verification endpoint IS the core value prop. Getting the API shape wrong means rework across every consumer. api-design-minion brings REST design expertise to define the minimal, correct surface.

### Consultation 5: Infrastructure and Deployment Strategy for MVP

- **Agent**: iac-minion
- **Planning question**: For an MVP that needs: (a) an HTTP API server (Node.js/JS), (b) a headless browser for page capture, (c) immutable blob storage for capture artifacts, and (d) a public verification endpoint -- what is the simplest deployment architecture? Consider: should this be a single containerized service or split? Can we use Cloudflare Workers / R2 for any of this? What's the cheapest way to run headless Chrome in the cloud? Does the MVP need CI/CD from day one, or is manual deployment acceptable? Factor in the preference for Fastly/Cloudflare edge platforms and the <300ms latency target. Aim for the architecture that a single developer can operate.
- **Context to provide**: PRODUCT.md (storage requirements, latency target), CLAUDE.md (ops reliability wins, lean and mean), CLAUDE.local.md (Fastly/Cloudflare preference). Emphasize: single-developer operability is a hard constraint for MVP.
- **Why this agent**: iac-minion determines what infrastructure the MVP actually needs. The headless browser requirement is the tricky part -- it constrains where we can deploy. Getting the deployment model right avoids expensive re-platforming.

### Consultation 6: Security Model for MVP

- **Agent**: security-minion
- **Planning question**: For an MVP capture service that accepts URLs from users and renders them in a headless browser: (a) What are the critical security risks (SSRF via user-supplied URLs, headless browser sandbox escapes, etc.) that MUST be addressed even in MVP? (b) What is the minimum viable auth model -- API keys, or can MVP be unauthenticated with rate limiting? (c) For the cryptographic signing of captures, what is the simplest signing approach that provides meaningful integrity guarantees without requiring a full PKI or timestamping authority? (d) Does the verification endpoint need any protection, or should it be fully public? Distinguish between "must have for MVP" and "should add before production."
- **Context to provide**: PRODUCT.md (signing/hashing, verification endpoint, legal admissibility as future goal), CLAUDE.md engineering philosophy. Emphasize: URL rendering in a headless browser is a significant attack surface. The signing approach needs to be upgradeable to legal-admissibility-grade later.
- **Why this agent**: Accepting arbitrary URLs and rendering them in a browser is inherently dangerous. Security-minion needs to identify the non-negotiable security controls for MVP. The signing model is also a security question -- getting it wrong undermines the entire value proposition.

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning? **No for planning, yes for execution plan.** The planning question is about scope and sequencing, not test strategy. test-minion should be included in the execution plan (Phase 3.5 architecture review will catch this as a mandatory reviewer). Test strategy will be shaped by the MVP scope decisions from lucy/margo.
- **Security**: **Included** -- security-minion is Consultation 6 above. URL rendering in headless browsers is a first-order security concern that shapes MVP scope.
- **Usability -- Strategy**: **Deferred to execution.** The MVP is API-only (no UI). UX strategy will matter when we add a web interface, but for the planning phase, the "user journey" is: call API, get capture, share verification link. ux-strategy-minion should still review the execution plan in Phase 3.5 to ensure the API-as-product experience is coherent.
- **Usability -- Design**: **Not needed for planning.** No UI in MVP scope.
- **Documentation**: **Included implicitly.** CLAUDE.md mandates evolution log documentation. software-docs-minion and user-docs-minion will be needed in the execution plan for API docs and the evolution log, but not for the planning consultation -- the documentation structure is already defined in CLAUDE.md.
- **Observability**: **Not needed for planning.** MVP is a single-service, single-developer operation. observability-minion should review the execution plan in Phase 3.5 to recommend minimal logging/metrics, but doesn't need to help shape MVP scope.

## Anticipated Approval Gates

1. **MVP Scope Document (docs/MVP.md)** -- MUST gate. This is the foundational decision that everything else depends on. Hard to reverse (all downstream work is scoped to it), high blast radius (all implementation tasks depend on it). The user needs to confirm what's in and what's out before any implementation planning happens.

2. **Technology Choices (bundle format, signing approach, storage backend)** -- MUST gate. These are architectural decisions with high switching cost. gru's recommendations need user sign-off before they're baked into the implementation plan.

3. **Implementation Plan / Issue Breakdown** -- OPTIONAL gate. The sequenced plan and GitHub issues are the final deliverable. They're relatively easy to revise (just re-order or re-scope issues), but the user should review the sequencing before issues are created.

Target: 3 gates. Within budget.

## Rationale

Six specialists are consulted for planning. The first three (gru, lucy, margo) were explicitly requested by the user and address the three biggest risks in MVP scoping:

- **gru**: Wrong technology choices that constrain the product or require expensive rewrites
- **lucy**: Scope drift from the user's stated intent ("capture, store, verify")
- **margo**: Over-engineering -- building a "small version of everything" instead of a focused MVP

The additional three specialists (api-design-minion, iac-minion, security-minion) were added because their domains directly shape MVP scope:

- **api-design-minion**: The API surface IS the product for MVP. Its shape determines what "done" looks like.
- **iac-minion**: The headless browser requirement constrains deployment options and cost. This affects what's feasible for a single-developer MVP.
- **security-minion**: Rendering arbitrary URLs in a headless browser is dangerous enough that security controls are scope-defining, not just implementation details.

## Specialists Considered but Not Selected

- **mcp-minion**: MCP is listed as a trigger method in PRODUCT.md, but it's clearly not MVP. On-demand API capture is sufficient.
- **oauth-minion**: Auth model for MVP is likely API keys or unauthenticated + rate limiting. OAuth is post-MVP.
- **api-spec-minion**: OpenAPI spec authoring is valuable but can happen after the API surface stabilizes. margo will likely recommend deferring formal specs.
- **data-minion**: Database selection could be relevant, but margo's YAGNI lens may eliminate the need for a database entirely in MVP (blob storage + filesystem might suffice).
- **edge-minion**: CDN/edge is important for the verification endpoint's latency target, but this is an implementation detail, not a planning question.
- **ai-modeling-minion**: No AI/ML components in MVP scope.
- **frontend-minion**: No web UI in MVP scope.
- **ux-design-minion**: No UI to design.
- **accessibility-minion**: No UI to audit.
- **seo-minion**: No public website in MVP.
- **sitespeed-minion**: No web frontend to optimize.
- **observability-minion**: Single-service MVP; observability is Phase 3.5 review territory, not planning.
- **devx-minion**: Developer experience (CLI, SDK) is post-MVP.
- **debugger-minion**: No existing code to debug.
- **code-review-minion**: No code written yet.
- **software-docs-minion**: Documentation structure is already defined in CLAUDE.md. Will be needed in execution, not planning.
- **user-docs-minion**: No end-user documentation needed at planning phase.
- **product-marketing-minion**: Positioning and messaging are post-MVP.
- **test-minion**: Test strategy depends on MVP scope; will be included in execution plan and Phase 3.5 review.

## Scope

**In scope for this planning task:**
- Defining what features are in/out for the minimum shippable product
- Documenting the MVP scope in docs/MVP.md
- Choosing foundational technologies (bundle format, signing, storage, deployment)
- Designing the minimal API surface
- Identifying security controls that are non-negotiable even for MVP
- Sequencing the implementation into self-contained work units
- Creating GitHub issues for each work unit
- Documenting decisions in docs/evolution/0001-kickoff/decisions.md
- Documenting outcomes in docs/evolution/0001-kickoff/outcome.md

**Out of scope for this planning task:**
- Writing any implementation code
- Setting up infrastructure
- Creating CI/CD pipelines
- Building a web UI
- Implementing auth/multi-tenancy
- Formal OpenAPI spec authoring (may be recommended as an implementation task)

## External Skill Integration

No external skills detected in project.
