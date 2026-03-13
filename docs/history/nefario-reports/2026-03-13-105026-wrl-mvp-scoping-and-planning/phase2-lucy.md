# Lucy: Alignment Review -- WRL MVP Scoping

## 1. Original Request (Verbatim Requirements)

From the kickoff prompt (`docs/evolution/0001-kickoff/prompt.md`):

> "The goal is the smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture."

Three explicit requirements extracted:

| ID | Requirement |
|----|-------------|
| R1 | Capture a URL (produce an immutable snapshot of a web resource) |
| R2 | Store it immutably (persist the capture so it cannot be altered) |
| R3 | Let a third party verify the capture (public verification without requiring an account) |

Implicit constraints from the prompt and CLAUDE.md:

| ID | Constraint | Source |
|----|------------|--------|
| C1 | Smallest thing -- YAGNI, no speculative features | Prompt + CLAUDE.md Engineering Philosophy |
| C2 | Each implementation step produces something runnable | Prompt ("Sequence matters -- each step should produce something runnable") |
| C3 | Evolution log documentation for every phase | CLAUDE.md Evolution Log section |
| C4 | Dual-purpose: real product + despicable-agents showcase | CLAUDE.md Agent Framework section |
| C5 | Helix Manifesto principles (KISS, Lean and Mean, vanilla-first) | CLAUDE.md Engineering Philosophy |
| C6 | Prefer JS over TS, vanilla solutions, no frameworks by default | CLAUDE.md + user global CLAUDE.md |
| C7 | Prefer Adobe-adjacent technologies (Fastly/Cloudflare edge, Helix patterns) | CLAUDE.local.md |
| C8 | API-first (OpenAPI as source of truth) | PRODUCT.md "API-first" section |

Note on C8: PRODUCT.md states "OpenAPI spec as the single source of truth" and "All interfaces built on top of the API." This is a declared architectural principle, not a feature. The MVP plan must decide whether this is load-bearing for the minimum shippable product or a constraint that kicks in later. My assessment: API-first is a structural convention for WRL, not an optional feature. The MVP should have an API even if minimal -- but the OpenAPI spec can be hand-written after the routes exist rather than spec-first.

---

## 2. Feature Classification Against R1/R2/R3

### (a) Clearly IN-SCOPE for MVP

| PRODUCT.md Feature | Traces To | Rationale |
|----|-----------|-----------|
| **Capture: HTML snapshot** | R1 | The minimum viable "capture." HTML is the primary content of a web resource. |
| **Capture: HTTP response headers** | R1 | Headers are trivial to collect during fetch and essential for proving what the server returned. Cheap to include; expensive to add later. |
| **Capture: content hash (SHA-256 or similar)** | R2, R3 | The hash IS the immutability guarantee and the verification mechanism. Without it there is no "verify." |
| **Immutable storage** | R2 | Core requirement. Can be as simple as write-once blob storage (S3 with object lock, or even filesystem for local dev). |
| **API trigger (on-demand capture)** | R1 | At least one trigger method is needed. API is the simplest and most general. The prompt says "capture a URL" -- there must be a way to initiate it. |
| **Public verification endpoint** | R3 | Explicit requirement. A third party must be able to confirm capture authenticity without an account. |
| **Shareable proof links** | R3 | PRODUCT.md line 31: "Shareable proof links (no account required to verify)." This is the delivery mechanism for R3. |

### (b) Clearly OUT of MVP Scope

| PRODUCT.md Feature | Rationale for Exclusion |
|----|------------------------|
| **Scheduled captures (cron-style)** | Trigger method beyond MVP. R1 only requires "capture a URL" -- one trigger method suffices. |
| **Webhooks (inbound triggers)** | Same: additional trigger method. Not needed to prove the core value prop. |
| **MCP (AI-agent-driven triggers)** | Same: additional trigger method. |
| **Watch lists / bulk monitoring mode** | PRODUCT.md calls this "the sticky use case" but explicitly says "single URL capture is table stakes." MVP is table stakes. |
| **Change detection / diffing** | Requires multiple captures of the same URL over time. Depends on monitoring mode. Not part of R1/R2/R3. |
| **Notifications (success/failure, quota, change alerts)** | No user asked for notifications. Requires user accounts and notification infrastructure -- scope explosion. |
| **Multi-tenancy (tenant isolation, RBAC)** | R3 says "third party" but nothing about multiple tenants. MVP can be single-tenant or no-tenant (public API with rate limiting). |
| **Social signup / user management** | No authentication requirement in R1/R2/R3. |
| **Billing & quotas** | No monetization requirement in R1/R2/R3. |
| **Legal admissibility (eIDAS, FRCP, timestamping authority)** | PRODUCT.md lists this as an open question. The MVP can use self-signed timestamps. Legal admissibility is a future trust-level upgrade. |
| **Autoscaling** | Ops concern for scale. Not needed to prove the value prop. |
| **Outbound webhooks** | Notification mechanism. Out of scope per above. |

### (c) Gray Zone -- Reasonable Disagreement Possible

| PRODUCT.md Feature | Argument FOR MVP | Argument AGAINST MVP | My Assessment |
|----|------------------|---------------------|---------------|
| **Capture: rendered screenshot** | Visual proof is compelling and intuitive for non-technical verifiers. PRODUCT.md lists it as part of the capture definition. | Requires a headless browser (Puppeteer/Playwright), which is a heavy dependency and complicates deployment. HTML snapshot + hash already proves content state. | **ADVISE: Defer.** A screenshot is valuable but adds significant infrastructure complexity (headless browser runtime). The core value prop ("verify the capture") works with HTML + hash alone. Add screenshots as the first post-MVP enhancement. If included, it should be a clearly separable, optional component. |
| **Capture: resource manifest (CSS/JS/images)** | PRODUCT.md lists it as part of the capture definition. Without subresources, the HTML alone may render differently. | Dramatically increases capture complexity (crawling, storage, CORS issues). The HTML snapshot + headers already prove "what was at this URL." | **ADVISE: Defer.** Same reasoning as screenshot. The manifest makes captures more complete but is not required for the core verify flow. |
| **Bundle format (WARC, MHTML, custom)** | A defined format ensures interoperability and future-proofs the archive. PRODUCT.md says "needs to be self-contained and verifiable." | Choosing a format is a design decision that can block progress. For MVP, raw files (HTML + headers JSON + hash) in a directory/blob structure work fine. | **ADVISE: Defer the format decision.** Store raw artifacts with a simple JSON metadata envelope. The bundle format is a packaging concern that can wrap the same artifacts later without data loss. Picking WARC now risks premature commitment. |
| **Signing beyond content hash** | A content hash alone proves integrity but not *when* the capture happened. Trusted timestamping adds the temporal proof. | Full cryptographic chain (TSA, certificate management) is significant complexity. A server-generated timestamp stored alongside the hash is "good enough" for MVP if the server is trusted. | **ADVISE: Defer TSA.** Use server-generated timestamps for MVP. Document this as a known trust limitation. The upgrade path to TSA-backed timestamps does not require architectural changes -- it adds a signature to existing metadata. |
| **OpenAPI spec** | PRODUCT.md declares "API-first" with "OpenAPI spec as the single source of truth." | Writing the spec before the API exists is waterfall-ish. For 2-3 endpoints, inline documentation or a simple route listing suffices. | **ADVISE: Write a minimal OpenAPI spec after routes are implemented, not before.** This respects the API-first principle without letting spec authoring block working code. Consistent with "more code, less blah blah." |
| **Web UI for verification** | A "shareable proof link" (R3) implies something a human can open in a browser. Without any UI, verification is API-only, which limits the "third party" audience. | A verification UI is a separate frontend concern. The API endpoint IS the verification mechanism; a static HTML page that calls it is trivial but still additional scope. | **ADVISE: Include a minimal static verification page.** This is the difference between "developers can verify via curl" and "anyone can verify by clicking a link." The latter matches the intent of R3. A single static HTML file with vanilla JS that calls the verification API endpoint is proportional. |

---

## 3. CLAUDE.md Convention Compliance -- Requirements for the MVP Plan

### Evolution Log (CLAUDE.md, mandatory)

The plan MUST:
1. Create `docs/evolution/0002-mvp-plan/` (or appropriate next number) with `prompt.md` before implementation begins.
2. Maintain `decisions.md` during implementation.
3. Write `outcome.md` after completion.
4. Update `docs/evolution/README.md` index.

This is declared "non-negotiable" in CLAUDE.md. Any plan that omits evolution log steps is non-compliant.

### Dual-Purpose Showcase (CLAUDE.md, "Agent Framework" section)

The plan should acknowledge that the build process is a deliverable. This means:
- Decisions should be documented in evolution log, not just made silently.
- The plan's GitHub issues should be structured so they demonstrate how despicable-agents decomposes and executes work.
- This does NOT mean adding extra features for showcase purposes -- it means the *process* is visible, not that the *product* is bloated.

### Engineering Philosophy Compliance

| Principle | Implication for MVP Plan |
|-----------|------------------------|
| YAGNI | Every feature in the plan must trace to R1, R2, or R3. No "while we're at it" additions. |
| KISS | Prefer the simplest storage, simplest API framework, simplest deployment. |
| Lean and Mean | Minimize dependencies. If a headless browser is deferred, that's one fewer heavy dep. |
| Vanilla-first | No React/Vue for the verification page. Plain HTML + vanilla JS. |
| <300ms latency | Verification endpoint must be fast. Capture can be async (it's inherently slower). |
| JS over TS | CLAUDE.local.md: "Where possible, prefer JS over TS." MVP should use plain JavaScript unless a specific component needs TypeScript. |
| Adobe-adjacent tech preferences | Favor Fastly/Cloudflare for edge/CDN, Helix patterns for architecture. Do not mention Adobe explicitly in published code or docs. |

---

## 4. Tension: "More Code, Less Blah Blah" vs. Evolution Log

This is a real tension. The principles pull in opposite directions:

- **"More code, less blah blah"** says: prioritize working code and commits over lengthy discussion. Ship.
- **Evolution log** says: every phase must have prompt.md, decisions.md, outcome.md. Document.

### Resolution

These are not contradictory if scoped correctly. The key insight is in what each principle targets:

- **"More code, less blah blah"** targets *planning paralysis and over-discussion before acting*. It says: don't debate endlessly, write code.
- **Evolution log** targets *retrospective transparency*. It says: after you make a decision, record it so others can follow.

**Practical guidance for the plan:**

1. **Keep evolution log entries terse.** Decisions.md should be bullet points with rationale, not essays. A decision entry can be three lines: what, why, what was rejected.
2. **Write prompt.md before the phase** (this is just copying the task description -- 2 minutes).
3. **Write decisions.md incrementally** during implementation, not as a separate documentation phase. One line per decision as it happens.
4. **Write outcome.md after the phase** as a brief summary (what shipped, what didn't, surprises). Five to ten lines.
5. **Do not create a separate "documentation task"** in the issue breakdown. Documentation is part of each implementation task, not a standalone work unit. Splitting it out would violate "more code, less blah blah" by making documentation a first-class blocker.

The plan should explicitly state this balance: evolution log entries are mandatory but must be kept lean. If a decisions.md file exceeds one page, something has gone wrong.

---

## 5. Traceability Summary

### Requirements Coverage (does every requirement have a plan element?)

| Requirement | Minimum Plan Element Needed |
|-------------|-----------------------------|
| R1: Capture a URL | API endpoint that accepts a URL, fetches it, stores HTML + headers |
| R2: Store immutably | Write-once storage with content hash |
| R3: Third-party verification | Public verification endpoint + minimal verification page |

### Scope Boundary Markers (the plan MUST explicitly exclude these)

The MVP plan should contain an explicit "Out of Scope" section listing deferred features. This prevents scope creep during implementation -- when an implementer wonders "should I also add screenshot support?", the answer is documented.

---

## 6. Risks to Flag

### Risk 1: Capture Definition Scope Creep
PRODUCT.md defines a capture as "an immutable bundle containing: rendered screenshot, HTML snapshot, HTTP response headers, resource manifest." If the plan adopts this definition wholesale, the MVP balloons. The plan must explicitly redefine MVP-capture as a subset: HTML + headers + hash + server timestamp.

### Risk 2: Storage Over-Engineering
"Cloud-native, immutable blob storage" and "separate stores for runtime data, tenant config, capture artifacts" is the full vision. MVP needs one store for capture artifacts. If the plan introduces multiple storage backends or a storage abstraction layer, that is scope creep for a product with zero users.

### Risk 3: API-First as Blocking Constraint
If "OpenAPI spec as source of truth" is interpreted as "write the full spec before any code," it creates a documentation bottleneck that contradicts "more code, less blah blah." The plan should clarify: build routes, then document them in OpenAPI.

### Risk 4: Auth/Multi-tenancy Creep
The verification endpoint must be public (R3). But someone might argue "we need API keys for the capture endpoint to prevent abuse." For MVP, rate limiting is sufficient. Adding auth introduces user management, which introduces a database for users, which introduces... The plan should explicitly defer all auth to post-MVP.

### Risk 5: Showcase Motivation Inflating Scope
The dual-purpose nature ("showcase for despicable-agents") could tempt the plan to add features that make the demo more impressive. The showcase value comes from the *process being visible*, not from the product having more features. The plan should resist this.

---

## 7. Verdict

**ADVISE** -- No blocking issues found, but the plan must:

1. **Explicitly narrow the capture definition** to HTML + response headers + content hash + server timestamp for MVP. Screenshot and resource manifest are post-MVP.
2. **Explicitly list out-of-scope features** to prevent implementation drift.
3. **Include evolution log steps** as part of each implementation task, not as standalone documentation tasks.
4. **State the evolution log brevity rule**: entries are mandatory but terse. Bullet points, not essays.
5. **Defer bundle format** decision. Store raw artifacts with JSON metadata.
6. **Defer auth entirely.** Rate limiting only for abuse prevention.
7. **Include a minimal static verification page** (single HTML file, vanilla JS) to satisfy R3 for non-technical third parties.
8. **Build routes first, write OpenAPI spec after** -- not spec-first.
9. **Respect technology preferences**: JS over TS, vanilla solutions, Fastly/Cloudflare-friendly architecture, no frameworks.
