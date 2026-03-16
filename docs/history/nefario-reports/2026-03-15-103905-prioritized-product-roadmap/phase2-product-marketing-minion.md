## Domain Plan Contribution: product-marketing-minion

### Current Positioning Assessment

Before addressing the planning questions, a brief diagnosis of where WRL sits today.

**Current core message (implicit):** "Capture a URL, get a signed archive, let anyone verify it."

**Current market category:** Tamper-evident web archival -- a category most potential users don't know exists. This is effectively a new-category play, which means WRL must educate the market on the problem before pitching the solution.

**Competitive alternatives today:**
1. Wayback Machine / archive.org (free, no integrity proof, no self-hosting)
2. Manual screenshots + notarization (slow, expensive, not machine-verifiable)
3. Webrecorder/ArchiveWeb.page (browser extension, local capture, no server-side API)
4. "Do nothing" + pray the evidence survives (the most common alternative)
5. Build it yourself with headless Chrome + S3 (no signing, no verification UX, no standard format)

**Unique attributes WRL has vs. all of the above:**
- Cryptographic signing with Ed25519 on every capture
- Public verification endpoint anyone can use without an account
- Self-hosted / own-infrastructure deployment
- WACZ standard format (interoperable, legal pedigree)
- Single API call produces five artifacts (screenshot, HTML, headers, WACZ, verification URL)

**Value proposition gap (honest):** WRL today is a working proof-of-concept that one person can deploy and use via curl. It is not yet something a second person would adopt independently. The README says "Store the capture ID. There is no listing endpoint to recover it." That sentence alone communicates "not ready for real use" louder than any feature list communicates readiness.

---

### Question 1: Launch Moments (3-5 Backlog Items Worth Announcing)

Not every shipped item deserves a blog post. A "launch moment" requires: (a) a before/after story that is easy to tell, (b) a change in what the product can credibly claim, and (c) relevance to at least one target audience. Here are the items that qualify, ranked by positioning impact:

**Launch Moment 1: List/Search Captures Endpoint + Per-Tenant API Keys (shipped together)**

This is the single most important launch moment because it changes WRL's category claim from "a demo you can run" to "a service you can operate." Today, losing a capture ID means losing the capture forever. Today, there is one static API key. Shipping these two together lets you credibly say: "WRL is ready for its first real users beyond the builder." This is the "open for business" moment.

- **Before/After story:** "Previously, WRL was a single-operator tool where losing a capture ID meant losing the capture. Now multiple users can manage their own captures and keys."
- **Positioning shift:** From "technical proof-of-concept" to "self-hosted service you can actually rely on."
- **Announcement channels:** Blog post (detailed), README update (remove the "no list endpoint" warning), social (short).

**Launch Moment 2: RFC 3161 Timestamps (TSA Integration)**

This upgrades WRL's integrity claim from "we signed it" (self-asserted) to "a third party can prove when it existed" (independently verifiable temporal proof). For the legal/compliance use case -- which is the strongest natural wedge -- this is table stakes. Without TSA, WRL's "tamper-evident" claim is weaker than it needs to be: anyone can generate a self-signed timestamp and backdate it.

- **Before/After story:** "WRL captures were signed but self-timestamped. Now every capture includes an RFC 3161 timestamp from an independent authority, creating evidence that holds up to scrutiny."
- **Positioning shift:** From "integrity tool" to "evidence tool." The word "evidence" requires temporal proof.
- **Announcement channels:** Blog post (deep technical dive on why self-asserted timestamps are insufficient), comparison with alternatives, potential crosspost to legal-tech communities.

**Launch Moment 3: Key Versioning + Rotation Without Downtime**

Today, rotating the signing key breaks verification of all prior captures. The README explicitly warns about this. Fixing it is not glamorous, but it removes a dealbreaker for anyone considering production use. This is a trust-building moment, not a feature moment.

- **Before/After story:** "Previously, rotating your signing key meant all old captures showed 'Verification Failed.' Now WRL maintains a key history, and old captures verify against the key that signed them."
- **Positioning shift:** Removes a credibility-destroying caveat from the README. Signals operational maturity.
- **Announcement channels:** Changelog entry (detailed), README update (remove the warning block), brief social mention.

**Launch Moment 4: MCP / AI-Agent Triggers**

This is a positioning play for the despicable-agents audience and for developer mindshare more broadly. "Your AI agent can capture and verify web pages" is a novel, timely pitch that differentiates WRL from every archival alternative. None of the competitive alternatives have an AI-agent integration story.

- **Before/After story:** "WRL captures required curl or custom API calls. Now any MCP-compatible AI agent can capture web pages as part of its workflow."
- **Positioning shift:** From "archival tool" to "web evidence infrastructure for AI workflows." This is a big-fish-small-pond play targeting AI-agent builders.
- **Announcement channels:** Blog post framed around use cases (AI agent that monitors regulatory pages, agent that archives sources before summarizing them), demo video, potential Product Hunt / Hacker News moment.

**Launch Moment 5: Web UI for Capture Submission**

This is the moment WRL becomes demonstrable without a terminal. Every launch moment above is curl-first. A web UI lets you send someone a link and say "try it." This dramatically reduces time-to-first-value for evaluation and creates a visual artifact for social sharing.

- **Before/After story:** "WRL required curl to use. Now anyone with a browser can capture and verify a web page."
- **Positioning shift:** From "developer tool" to "tool developers can show to non-developers." Expands the social proof surface.
- **Announcement channels:** Visual-first social post, GIF/video demo, README update with screenshot.

---

### Question 2: Value Proposition Gap -- Smallest Addition Set for Independent Adopters

The current pitch is "capture a URL and verify it." That is technically accurate but fails the Jobs-to-be-Done test: no one's job is "capture a URL." People's jobs are:

- "Prove what was on a webpage at a specific time" (legal, compliance, journalism)
- "Archive web content I need to reference later" (research, due diligence)
- "Monitor a page for changes with proof" (regulatory, competitive intelligence)

The smallest set of additions that upgrades the pitch from "demo" to "tool an independent adopter would use":

1. **List/Search captures** [must] -- Without this, WRL is a write-only system. You cannot browse, search, or recover your captures. This is the single biggest blocker to adoption. No one will trust a system where data loss is one lost ID away.

2. **Per-tenant API keys** [must] -- Without this, there is no safe way to let a second person use the instance. The first adopter beyond the builder hits this wall immediately.

3. **Key versioning** [should] -- The README warning about key rotation breaking all old captures is a dealbreaker for anyone planning to use WRL for more than a week. Production use requires key rotation; key rotation currently destroys the value of every prior capture.

4. **Content moderation / abuse policy** [should] -- Before WRL can be offered to anyone else, it needs terms of service and an abuse reporting mechanism. Without this, the operator is legally exposed.

These four items -- list endpoint, per-tenant keys, key versioning, and abuse policy -- are the minimum viable "second user" package. They transform the pitch from "capture a URL and verify it" to "run a tamper-evident archival service for your team."

Note what is NOT in this minimum set: TSA timestamps, web UI, scheduled captures, WORM storage. Those are valuable but not blocking for a first independent adopter who is comfortable with curl.

---

### Question 3: Best Despicable-Agents Showcase Items

For the despicable-agents audience, the interesting question is not "what was built" but "how was it built, and why was multi-agent orchestration better than a single developer?" The roadmap items that best demonstrate this:

1. **RFC 3161 TSA Integration** -- This involved a genuine specialist conflict (gru vs. security-minion on complexity vs. necessity). The resolution is documented. This is the kind of decision where multiple expert perspectives genuinely produce a better outcome than one person guessing. Blog post title: "When your security agent and your architect disagree: how we resolved the TSA timestamp debate."

2. **Browser Session Reuse / Playwright Migration (Phase 0014, already shipped)** -- A performance optimization that required coordinating security review (TOCTOU analysis), performance engineering, and testing. The categorizeError bug found by test-minion is a perfect anecdote: a specialist caught a real bug that a generalist might have missed. This is already shipped but has not been written up as a despicable-agents showcase piece.

3. **Per-Tenant Auth System** -- Designing an auth system involves security, API design, and UX tradeoffs simultaneously. The multi-agent approach should surface tensions (e.g., security-minion wanting maximum isolation vs. margo wanting minimal friction) that produce a better design than either perspective alone.

4. **Observability Layer (Phase 0015, already shipped)** -- Six specialists reviewed the logging design and caught issues (wrong Coralogix region, missing try/catch, static reason codes). This is a strong "wisdom of the crowd" story where the final design was measurably better than any single proposal.

5. **The Roadmap Phase Itself** -- Meta-showcase: using multi-agent orchestration to plan the roadmap, with specialists arguing about priorities from their domains. This is the phase happening right now. If documented well, it demonstrates that despicable-agents works for planning, not just implementation.

**Key insight for the despicable-agents narrative:** The most compelling showcase items are ones where specialists DISAGREED and the resolution was documented. Agreement is boring; conflict resolution is instructive.

---

### Question 4: Narrative Arc Assessment

The current 15-phase evolution reads as a coherent build story: scaffold, core pipeline (capture, bundle, retrieve, verify), UX layer (verification page), hardening (OpenAPI, security), and operational maturity (open-source readiness, README, session reuse, observability). This is a credible "zero to working product" arc.

**The risk going forward is exactly the "random feature accretion" problem the question raises.** If the roadmap sequence is: list endpoint, then TSA, then web UI, then MCP triggers, then scheduled captures -- that reads as a grab bag. Each item is individually useful but the sequence tells no story.

**Recommended narrative arc for the roadmap (three acts):**

**Act 1: "Ready for Others" (Phases 0016-0019ish)**
Theme: Everything needed so a second person can use WRL confidently.
Items: List/search endpoint, per-tenant API keys, key versioning, abuse policy, content moderation.
Positioning shift: "I built a thing" becomes "you can use this thing."
Launch moment: "WRL is open for users" blog post.

**Act 2: "Evidence-Grade" (Phases 0020-0022ish)**
Theme: Upgrading from integrity verification to legal-grade evidence.
Items: RFC 3161 timestamps, HSTS preload, potentially eIDAS groundwork.
Positioning shift: "Tamper-evident" becomes "evidence-grade." The word "evidence" carries legal weight that "tamper-evident" does not.
Launch moment: "WRL captures are now independently timestamped" technical deep-dive.

**Act 3: "Infrastructure" (Phases 0023+)**
Theme: WRL as infrastructure other tools and agents build on.
Items: MCP triggers, scheduled captures, webhooks, web UI.
Positioning shift: "Archival service" becomes "web evidence infrastructure." Other products and workflows integrate with WRL rather than using it directly.
Launch moment: "Your AI agent can now capture and verify web pages" demo.

This three-act structure builds credibility in sequence: first prove you can be relied upon (Act 1), then prove your evidence is rigorous (Act 2), then prove you fit into larger workflows (Act 3). Each act makes the next one's claims credible. You cannot credibly pitch "evidence infrastructure for AI agents" if you do not have key rotation working.

**The despicable-agents narrative maps to the same acts:** Act 1 showcases multi-agent planning and auth design. Act 2 showcases specialist conflict resolution on technical standards. Act 3 showcases how agent-built software evolves to serve other agents.

---

### Recommendations

#### On Sequencing

1. **Ship the "Ready for Others" bundle before any new feature work.** The list endpoint, per-tenant keys, and key versioning are not exciting features, but they are the foundation every future launch moment stands on. Shipping MCP triggers before fixing "losing a capture ID loses the capture" undermines the entire positioning.

2. **Pair backlog items into launch moments, not individual ships.** List endpoint alone is not a launch moment. List endpoint + per-tenant keys + key versioning shipped as "WRL is ready for real users" IS a launch moment. The roadmap should identify bundles, not just items.

3. **Do not ship the Web UI too early.** A web UI on top of a single-key, no-list-endpoint system invites evaluation by people who will hit the sharp edges immediately. Ship it after Act 1 is complete.

4. **TSA timestamps should precede MCP triggers.** TSA strengthens the core value proposition (evidence). MCP expands the addressable audience. Strengthening the core before expanding the audience is the safer sequence.

#### On Messaging

5. **Retire the README caveat about capture ID loss as soon as the list endpoint ships.** That single paragraph is the most damaging sentence in the current positioning. It signals "not production-ready" to anyone evaluating WRL.

6. **Start using "web evidence" instead of "web archival" in positioning.** Archival competes with archive.org (free, massive, established). Evidence competes with manual screenshots and notarization (expensive, slow, unverifiable). The evidence framing puts WRL in a category where it wins on every dimension.

7. **Write the "Before/After" blog post for Phase 0014 (session reuse) now.** This is already shipped, has a strong technical narrative (10x throughput, security bug caught by test-minion, Playwright migration), and is excellent despicable-agents showcase material. It costs nothing to write and starts building the content library.

#### On the Despicable-Agents Showcase

8. **Every Act boundary should produce a "how we built it" blog post**, not just a changelog. The evolution log is the raw material; the blog post is the positioning artifact. The evolution log is for practitioners who want to reproduce the process. The blog post is for practitioners who want to understand why multi-agent orchestration matters.

9. **Track and publish "catches" -- things a specialist agent found that a solo developer would likely have missed.** The categorizeError bug in Phase 0014, the Coralogix region correction in Phase 0015 -- these are concrete proof points for the despicable-agents value proposition. Maintain a running list.

---

### Proposed Tasks

#### Task 1: Define the "Ready for Others" Launch Bundle
**What:** Identify the exact backlog items that constitute the Act 1 bundle. Write the target positioning statement that becomes true when this bundle ships. Draft the README changes that would follow (removing caveats, updating the pitch).
**Deliverables:** Launch bundle definition document, draft README diff, draft blog post outline.
**Dependencies:** Backlog prioritization (this roadmap exercise). No code dependency.

#### Task 2: Reframe Core Messaging from "Archival" to "Evidence"
**What:** Audit all current copy (README, OpenAPI description, verification page text) for "archival" framing. Propose replacement language using "evidence" framing. Test: does each claim hold up if a skeptical developer reads it?
**Deliverables:** Messaging audit with specific find-and-replace recommendations. Updated messaging hierarchy (core message, supporting messages, proof points).
**Dependencies:** None. Can be done immediately. Should inform all subsequent copy.

#### Task 3: Write Phase 0014 Technical Narrative (Blog-Ready)
**What:** Using the evolution log from Phase 0014 (browser session reuse), write a technical narrative suitable for blog publication. Focus on the multi-agent orchestration angle: how specialists coordinated, where they disagreed, what the test-minion caught.
**Deliverables:** Blog post draft (~1500 words), targeting developers interested in AI-assisted development.
**Dependencies:** Phase 0014 evolution log (already complete).

#### Task 4: Build "Specialist Catches" Tracking
**What:** Review all 15 phases and extract instances where a specialist agent identified something that would likely have been missed by a solo developer. Maintain as a running document that grows with each phase.
**Deliverables:** "Catches" document with phase reference, specialist, what was caught, and impact assessment.
**Dependencies:** Evolution log phases 0001-0015 (already complete).

#### Task 5: Competitive Positioning Page
**What:** Draft an honest comparison of WRL vs. alternatives (Wayback Machine, manual screenshots, Webrecorder, build-it-yourself). Acknowledge where alternatives are stronger. Focus differentiation on: self-hosted, cryptographic verification, API-first, WACZ standard format.
**Deliverables:** Comparison document suitable for README "Alternatives" section or standalone page.
**Dependencies:** Task 2 (messaging reframe) should complete first to ensure consistent language.

---

### Risks and Concerns

1. **"Evidence" framing without TSA is a credibility risk.** Self-asserted timestamps do not constitute evidence in any rigorous sense. If WRL adopts "evidence" language before shipping TSA timestamps, technically sophisticated users will call this out. Mitigation: use "evidence" in aspirational positioning but be explicit about what is and is not independently verifiable today. Do not claim "legal-grade" or "court-admissible" until TSA is shipped.

2. **The despicable-agents showcase narrative could overshadow the product narrative.** If WRL is positioned primarily as "look what AI agents built," it undermines confidence in the product itself. No one wants to trust their evidence to a demo project. Mitigation: keep the two narratives in separate channels. README and product pages lead with the product. Blog posts and evolution log lead with the process. The despicable-agents badge in the README is fine as a signal, not a headline.

3. **The backlog is heavily [consider]-weighted.** Of approximately 60 items, the majority are [consider]. This is appropriate for a young project but creates a risk of scope creep if the roadmap tries to address too many [consider] items before the [must] items are solid. Mitigation: the three-act structure above prioritizes [must] items in Act 1 and treats [consider] items as Act 3 candidates that may never ship.

4. **No user research to validate positioning assumptions.** All target persona analysis is inferred from the product's capabilities, not from conversations with actual users. The "legal/compliance" and "journalism" use cases are hypotheses. Mitigation: flag these as hypotheses in all positioning documents. Seek validation through community engagement once Act 1 ships.

5. **The "99% vibe coded" badge may work against production credibility.** For the despicable-agents audience, this badge is a feature. For the adopter audience, it could signal "untested experiment." These audiences see the same README. Mitigation: this is a judgment call for the project owner. If the primary near-term audience is despicable-agents showcase viewers, keep it. If independent adopters are the priority, consider whether the badge serves or undermines the pitch.

---

### Additional Agents Needed

**content-strategy-minion or equivalent** -- The three-act roadmap produces at least three blog posts and ongoing "catches" documentation. Someone needs to own the content calendar, ensure posts are written at Act boundaries, and maintain consistency between the product narrative and the process narrative. This is execution work that falls between product-marketing (positioning) and user-docs (tutorials). If no content specialist exists in the agent framework, this work defaults to the human or to product-marketing-minion doing double duty.

Otherwise, the current team (gru for technical viability, ux-strategy-minion for user journey, product-marketing-minion for positioning) is sufficient for the roadmap planning phase. Security-minion should review the Act 1 bundle definition since per-tenant auth and key versioning are security-critical.
