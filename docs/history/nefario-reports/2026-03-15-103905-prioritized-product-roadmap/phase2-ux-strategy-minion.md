## Domain Plan Contribution: ux-strategy-minion

### Analysis: The Current User Journey and Its Gaps

**Current state (JTBD mapping):**

WRL today serves exactly one job: "When I need to prove what a web page looked like at a specific moment, I want to capture it with cryptographic integrity, so I can present tamper-evident evidence to a third party."

The journey to accomplish this job is currently:

1. **Capture** -- POST a URL with an API key. Get back a capture ID.
2. **Wait** -- Poll the status endpoint until complete.
3. **Retrieve** -- GET the capture metadata and artifact links.
4. **Verify** -- Share the verification URL with a third party.

This is a complete, functional journey. But it has a critical fragility and several friction points that prevent anyone from *relying* on WRL rather than merely *trying* it.

---

### Recommendations

#### 1. The Trust Gap Is the Real Problem, Not the Feature Gap

The question "what does a user need to go from 'I can capture' to 'I rely on WRL for evidence'" is fundamentally a trust question, not a feature question. Trust is built through three mechanisms:

- **Recoverability** -- "If something goes wrong, I can recover." The lost-ID problem directly undermines this. A user who loses a capture ID has permanently lost their evidence. This is the single biggest barrier to reliance.
- **Verifiability** -- "I can prove this is real to others." This exists today but is fragile: key rotation breaks all prior verification, and the timestamp is self-asserted (operator could lie about when).
- **Reliability** -- "This will work when I need it." The 30s timeout, lack of observability dashboards, and absence of any retry mechanism create anxiety.

The roadmap should sequence around closing these three trust gaps, in that order.

#### 2. Capability Clusters (Natural Groupings That Deliver Meaningful Jumps)

I see five natural clusters in the backlog, ordered by the capability jump they deliver:

**Cluster A: "I can find my captures" (Recoverability)**
- List/search endpoint (`GET /v1/captures`) -- [must]
- Pagination, filtering, sorting -- [consider, but must if list is built]
- Capture ID recovery -- [consider, becomes unnecessary with list]

This is the single highest-value cluster. It transforms WRL from "a tool I use carefully" to "a tool I can rely on." The lost-ID problem is the #1 friction point in the current journey. The response body even warns about it, which is itself an anti-pattern -- if you have to warn users about a design limitation in every response, that limitation is a must-fix.

The JTBD: "When I need to find a capture I made earlier, I want to search by URL or date, so I don't lose evidence because I lost an ID."

**Cluster B: "Others can trust my evidence" (Verifiability)**
- Key versioning / key ID in signature entries -- [should]
- Old public key archive endpoint -- [should]
- RFC 3161 timestamps via TSA -- [should]

This cluster transforms verification from "works if the operator hasn't changed anything" to "works regardless of operational history." Key rotation currently *breaks all prior captures*. The README warns about this in bold. Again, the anti-pattern: if you have to prominently warn users about a catastrophic operational consequence, that consequence is a must-fix before reliance.

RFC 3161 timestamps are the bridge from "the operator says this was captured at time X" to "an independent third party confirms time X." This is the difference between evidence and assertion.

The JTBD: "When I present evidence to a skeptical third party, I want independent timestamp proof, so my evidence isn't dismissed as self-serving."

**Cluster C: "I can scale my usage" (Multi-operator readiness)**
- Per-tenant API keys -- [must]
- Key scoping (read vs write) -- [must]
- API key rotation without downtime -- [must]
- Audit logging of key usage -- [must]
- Per-tenant rate limiting -- [consider]

This cluster is gated: you only need it when a second operator arrives. All items are marked [must], and correctly so -- you cannot share access without them. But building this before there's a second user is textbook premature optimization from a UX perspective. The *readiness* to build it should be validated (clean separation points in the code), but the actual build should wait.

The JTBD: "When I want to give capture access to a colleague or client, I want scoped API keys, so they can capture without seeing my history."

**Cluster D: "Captures are more reliable" (Reliability)**
- Queue migration for capture processing -- [should]
- Screenshot timing / wait-for-load -- [should]
- Rate limit headers in responses -- [should]
- Content security scanning -- [should]
- Hashed IP logging -- [should]

These are quality-of-life improvements that reduce the "will this work?" anxiety. None individually is transformative, but collectively they move WRL from "works for simple pages" to "works for real-world pages." The queue migration is the most impactful -- it removes the 30s hard limit that currently makes WRL unreliable for complex pages.

**Cluster E: "WRL is a platform" (Future product features)**
- Scheduled captures, watch lists, change detection, notifications
- MCP / AI-agent triggers
- Batch capture
- Web UI for capture submission
- Billing and quotas
- Webhooks / SSE / WebSocket

These are all [consider] items. None of them addresses a job that current users have articulated. They're features for hypothetical users of a hypothetical platform. This is the value cliff.

#### 3. The Value Cliff: Where to Stop

The cliff falls sharply after Cluster B. Here's why:

- **Clusters A + B** serve the *same user* who uses WRL today, but remove the barriers to reliance. They answer: "I can find my captures" and "my evidence holds up under scrutiny." These are must-be features in Kano terms -- their absence destroys the value proposition.

- **Cluster C** serves a *new user type* (multi-operator). Building it before that user exists is building for a hypothesis. The code should be *ready* for it (no architectural debt that blocks it), but the implementation should wait until the second user is real. This is a performance feature in Kano terms -- more tenants = more value, proportionally.

- **Cluster D** improves the current experience incrementally. These are performance features -- they make existing users proportionally more satisfied. They should be picked up opportunistically or when specific pain is felt (a capture fails due to timeout, a page renders incompletely).

- **Cluster E** is almost entirely excitement/indifferent territory for current users. Scheduled captures, change detection, batch capture -- these are solutions looking for problems. No evidence of actual demand. Building any of these before Clusters A and B is choosing novelty over reliability.

The **eIDAS Qualified TSA, WACZ-Auth full implementation, domain-ownership certificates, HSM-backed key storage, S3 Object Lock** -- these are all regulatory/enterprise features that only matter if WRL is being used as evidence in formal proceedings with specific compliance requirements. They're real and important *for that use case*, but building them before any user has that use case is speculative. They belong in "documented upgrade path, not in roadmap."

#### 4. Specific Sequencing Recommendation

**Phase 1: Recoverability (Cluster A)**
- List endpoint with URL and date filtering
- Basic pagination
- This eliminates the lost-ID problem, the single most user-hostile aspect of the current design

**Phase 2: Verification Durability (Cluster B, keys)**
- Key versioning with key ID in signatures
- Old public key archive endpoint
- This makes key rotation safe -- captures signed with old keys remain verifiable

**Phase 3: Independent Timestamps (Cluster B, timestamps)**
- RFC 3161 TSA integration
- This elevates evidence from "operator assertion" to "independently verifiable"

**Phase 4: Reliability Hardening (Cluster D, selective)**
- Queue migration (removes 30s limit)
- Screenshot wait-for-load improvements
- Rate limit response headers
- These address the "will it work?" anxiety for real-world pages

**Phase 5+: Only on demand**
- Multi-tenancy (Cluster C) -- when a second operator actually appears
- Platform features (Cluster E) -- when specific user demand is demonstrated
- Compliance features -- when a user has a specific compliance need

#### 5. Journey Friction Worth Fixing Along the Way

Several small items in the backlog are not clusters but friction points that should be addressed as part of adjacent work:

- **CORS configuration for capture POST** -- if anyone integrates WRL from a web app, this blocks them. Low effort, high annoyance.
- **HTML error pages for 404/429/503** -- browsers showing raw JSON is hostile when someone mistypes a verification URL. Fix when touching the verification page next.
- **HSTS preload submission** -- pure ops hygiene, do it once the domain is final.
- **Content moderation policy and Terms of Service** -- these are must-haves before any public usage, but they're content/legal tasks, not engineering. Should be done before promoting WRL externally.

### Proposed Tasks

#### Task 1: List Endpoint with Search
**What**: Build `GET /v1/captures` with filtering by URL (exact and prefix match) and date range, cursor-based pagination, sorted by creation date descending.
**Deliverables**: Working endpoint, OpenAPI spec update, tests, removal of "lost ID" warnings from response bodies and README.
**Dependencies**: None -- can start immediately.
**UX rationale**: Eliminates the single largest friction point. Changes the mental model from "you get one chance to save the ID" to "your captures are always findable."

#### Task 2: Key Versioning and Archive
**What**: Add key ID to signature entries, store historical public keys, add `GET /.well-known/signing-keys` (pluralized) that returns all historical keys with their validity periods.
**Deliverables**: Updated signing flow, key archive endpoint, updated verification to check against the correct historical key, removal of the bold key-rotation warning from README.
**Dependencies**: None -- can start immediately, but should ship after Task 1 to maintain focus.
**UX rationale**: Eliminates the catastrophic "key rotation breaks all prior captures" failure mode. Non-negotiable for any user relying on WRL for evidence.

#### Task 3: RFC 3161 Timestamp Integration
**What**: Add TSA timestamp request to the WACZ signing pipeline, store the TSA response in the signatures array, update verification to validate the TSA timestamp.
**Deliverables**: TSA integration, updated WACZ format, updated verification endpoint and page, documentation of what the timestamp proves vs. what the self-signature proves.
**Dependencies**: Task 2 (key versioning) should be done first so the signing pipeline is already being touched.
**UX rationale**: Transforms the evidence quality from "operator asserts" to "independently proven." This is the capability that makes WRL useful for actual disputes, not just record-keeping.

#### Task 4: Capture Queue Migration
**What**: Move capture processing from `ctx.waitUntil()` to Cloudflare Queues. This removes the 30s hard limit and gives 15 minutes of processing budget.
**Deliverables**: Queue-based processing, updated status polling behavior, updated error handling for queue failures.
**Dependencies**: None architecturally, but should follow the trust-building Tasks 1-3 in the roadmap.
**UX rationale**: The 30s limit means complex pages can fail silently. Users who try WRL on a real-world page and get a failure will not come back. Queue migration makes the promise ("capture any page") actually reliable.

#### Task 5: Terms of Service and Content Policy
**What**: Draft ToS prohibiting illegal use, content moderation policy, and abuse reporting mechanism. Publish at a well-known URL.
**Deliverables**: ToS page, content policy, abuse reporting endpoint or email.
**Dependencies**: None -- can be done in parallel with any technical work.
**UX rationale**: Required before any public promotion. Users relying on WRL need to know the rules. Operators hosting WRL need legal cover.

### Risks and Concerns

**Risk 1: Building multi-tenancy too early.** All five auth/access items are marked [must] in the backlog, but they're [must] *before second user*, not [must] *now*. If the roadmap prioritizes multi-tenancy over recoverability and verification durability, WRL will have enterprise features for hypothetical users while the single real user can't find their captures. This is the classic "building for scale before finding product-market fit" anti-pattern.

**Risk 2: The "evidence" framing creates expectations WRL can't yet meet.** The README says "tamper-evident archival" and "evidence." But with self-asserted timestamps and key rotation that breaks verification, the evidence claim is aspirational. If a user relies on WRL for a real dispute and the evidence is challenged ("you could have set the timestamp to anything"), the product fails its core promise. RFC 3161 timestamps are not a nice-to-have -- they're the minimum for the "evidence" job to actually be done.

**Risk 3: Cluster E items distract from foundational trust.** Items like scheduled captures, MCP triggers, and change detection are exciting to build but add zero value until the foundation is trustworthy. Every hour spent on a [consider] platform feature is an hour not spent closing the trust gap. The roadmap should make it uncomfortable to work on Cluster E until Clusters A and B are complete.

**Risk 4: The D1 / database consideration is a hidden dependency.** The list endpoint (Task 1) will stress KV's query limitations. KV is a key-value store -- it doesn't support filtering, sorting, or range queries natively. The list endpoint implementation will likely require either (a) a secondary index pattern in KV, (b) migration to D1 (edge SQLite), or (c) a creative workaround. This architectural decision should be made upfront, not discovered during implementation.

**Risk 5: No feedback loop with actual users.** The backlog is entirely agent-generated. There's no signal from real users about what they actually need. The sequencing I've recommended is based on first-principles user journey analysis, but it should be validated. Even a handful of real captures by real users with real problems would provide more signal than the current backlog.

### Additional Agents Needed

**None for the roadmap itself**, but I want to flag:

- When Task 1 (list endpoint) reaches implementation, an **api-design-minion** should be involved to ensure the pagination, filtering, and sorting patterns are consistent with the existing API and don't create migration pain when the query backend eventually changes (KV secondary indexes vs. D1).
- The **security-minion** should review the list endpoint's auth model -- currently all read endpoints are auth-free (capture ID is the secret). A list endpoint changes this fundamentally: if it's authenticated, it's consistent but requires auth for browsing. If it's unauthenticated, anyone can enumerate all captures. This is a significant security design decision, not just an implementation detail.
