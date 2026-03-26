# Phase 3: Synthesis — Mermaid Architecture Diagrams

## Delegation Plan

**Team name**: mermaid-architecture-diagrams
**Description**: Create two Mermaid architecture diagrams (user interaction flows + capture pipeline/integrity chain) as a new Architecture page on the WRL documentation site, with Mermaid JS rendering support.

### Task 1: Add Mermaid JS rendering to docs site
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Add client-side Mermaid rendering to the WRL documentation site.

    ## Context

    The docs site at `site/` uses Eleventy with the `layouts/doc.njk` layout.
    The base layout is at `site/_includes/layouts/base.njk`. Mermaid code fences
    (` ```mermaid `) are already used in `site/content/security/whitepaper.md`
    (3 diagrams) but there is NO Mermaid JS loaded anywhere -- these diagrams
    currently render as plain code blocks.

    ## What to do

    Add a client-side Mermaid initialization script that:
    1. Loads Mermaid from CDN (use `https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js`)
    2. Finds all `<pre><code class="language-mermaid">` blocks (this is how markdown-it renders fenced code blocks with the `mermaid` language tag)
    3. Replaces them with rendered Mermaid diagrams
    4. Uses `mermaid.initialize({ startOnLoad: false, theme: 'neutral' })` and then `mermaid.run()` targeting the identified elements

    Create a new file `site/js/mermaid-init.js` with the initialization logic.
    Add a `<script>` tag in `site/_includes/layouts/base.njk` to load the CDN
    script (with `type="module"`) and then the init script.

    ## What NOT to do

    - Do not install Mermaid as an npm dependency or build-time plugin
    - Do not modify any content files
    - Do not add Mermaid CSS -- the library handles its own styling
    - Do not use a framework or complex setup -- vanilla JS only

    ## Files to modify

    - `site/_includes/layouts/base.njk` -- add script tags before `</body>`
    - `site/js/mermaid-init.js` -- new file with init logic

    ## Success criteria

    - Mermaid fenced code blocks render as SVG diagrams on all doc pages
    - Existing whitepaper diagrams (3 Mermaid blocks) render correctly
    - No console errors on pages without Mermaid diagrams
    - Script loads defer/async so it doesn't block page rendering

- **Deliverables**: `site/js/mermaid-init.js` (new), `site/_includes/layouts/base.njk` (modified)
- **Success criteria**: Mermaid code fences render as SVG diagrams; no console errors on pages without diagrams

### Task 2: Create Architecture page with Mermaid diagrams
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: The diagrams define how the system is publicly described. Inaccurate or over-detailed diagrams expose attack surface or create false trust assumptions. The content needs review before merging.
- **Gate rationale**: |
    Chosen: Two conceptual-level diagrams on a single Architecture page (sequence diagram for user flows, flowchart for capture pipeline + integrity chain)
    Over: (1) Endpoint-level diagrams mirroring API Reference (rejected: redundant, unreadable at that detail level); (2) Split across multiple pages (rejected: content is complementary, nav already has 21 entries)
    Why: Conceptual level matches audience (evaluators, potential customers) and avoids duplicating the existing API Reference. Single page keeps nav clean and serves readers who want the full architecture picture.
- **Prompt**: |
    Create the Architecture documentation page for the WRL docs site with two Mermaid diagrams.

    ## Context

    This page explains how WRL works at the architecture level -- the user interaction
    flows and the internal capture pipeline with its cryptographic integrity chain.
    The audience is potential customers and technical evaluators. The diagrams should
    be clear, conceptual, and accurate.

    Source: GitHub issue #168. The issue description has inaccuracies (noted below).
    The codebase is the source of truth.

    ## What to create

    Create `site/content/architecture.md` with:

    ### Frontmatter
    ```yaml
    ---
    layout: layouts/doc.njk
    title: Architecture
    description: How WRL captures web pages, builds cryptographic proof bundles, and enables independent verification.
    ---
    ```

    ### Page structure

    1. `# Architecture` heading
    2. Brief intro (2-3 sentences): what this page shows and who it's for
    3. `## User Interaction Flows` -- sequence diagram + explanatory prose
    4. `## Capture Pipeline & Integrity Chain` -- flowchart + explanatory prose
    5. Cross-links to [Verification](/verification/), [API Reference](/api-reference/), [Security & Compliance](/security/) where relevant

    ### Diagram 1: User Interaction Flows (sequence diagram)

    Show these interaction patterns at a CONCEPTUAL level (use descriptive labels
    like "Create Capture", not endpoint paths as primary labels; endpoint paths
    can appear in parentheses):

    **Actors**: Tenant (API Consumer), WRL API, Browser Rendering, Storage, Verifier

    **Flows to include:**
    1. **Authentication** (two paths): GitHub OAuth PKCE flow OR API key (Bearer token)
    2. **Capture lifecycle**: Create capture (single) --> 202 Accepted --> Queue processing --> Poll status --> Retrieve result + artifacts
    3. **Batch capture**: Show as variant entry point alongside single capture, converging at queue processing
    4. **Verification**: Public verify endpoint --> 5 integrity checks --> Certificate download (PDF)
    5. **Account management**: API key CRUD, webhook setup, eIDAS opt-in (brief, not detailed)

    **Flows to EXCLUDE:**
    - Share links (`POST /v1/captures/{id}/share`) -- THIS DOES NOT EXIST in the codebase. Do not include it.
    - Scheduled captures -- exists but out of scope for this page (keep diagrams focused)
    - Admin endpoints -- infrastructure-internal, not user-facing
    - Billing/Stripe flows -- internal, not architecturally interesting for evaluators
    - Notification/email subsystem -- secondary, keep diagrams clean
    - MCP handler -- integration interface, not core architecture

    ### Diagram 2: Capture Pipeline & Integrity Chain (flowchart)

    Show the data flow through the system internals:

    **Components** (use generic labels, NOT internal binding names):
    - API Worker, Queue, Browser Rendering, Object Storage (R2), Database (D1), Rate Limiter (KV)
    - External: Threat Screening (Google Web Risk), RFC 3161 TSA, eIDAS Qualified TSA

    **Flow:**
    1. **Ingestion**: HTTP request --> Authentication --> Rate Limiting --> Quota Check --> URL Validation (SSRF prevention) --> Threat Screening --> Database record (pending) --> Queue --> 202 response
    2. **Processing**: Queue --> Browser Rendering (headless Chromium) --> Screenshot + DOM + Headers --> Cookie Consent Dismissal
    3. **WACZ Assembly & Signing**: Build WARC --> SHA-256 hashes of artifacts --> datapackage.json manifest --> bundleHash = SHA-256(canonical JSON) --> Ed25519 signature --> Optional RFC 3161 timestamp --> Optional eIDAS qualified timestamp
    4. **Storage & Completion**: Object Storage (hash-addressed) --> Database update (complete) --> Webhook dispatch

    **Integrity chain visualization** -- this is the key selling point, highlight it clearly:
    - Each artifact --> SHA-256 hash --> datapackage.json --> canonical JSON --> bundleHash
    - bundleHash --> Ed25519 signature (using server signing key)
    - bundleHash --> RFC 3161 timestamp (independent time attestation) [optional]
    - bundleHash --> eIDAS qualified timestamp (legally binding) [optional]
    - ALL signatures/timestamps cover the SAME bundleHash (siblings in array, NOT a sequential chain)
    - The signed payload is the UTF-8 string representation of bundleHash, not raw bytes

    **Verification** (5 independent checks):
    1. artifactHashes -- each file matches its hash in datapackage.json
    2. bundleHash -- SHA-256 of canonical datapackage matches signedData.hash
    3. signature -- Ed25519 verification using SERVER's public key (resolved via keyId from DB, NOT the embedded key)
    4. timestamp -- RFC 3161 messageImprint matches bundleHash (skip if absent, fail if present but invalid)
    5. qualifiedTimestamp -- same as above for eIDAS

    Show that verification uses server-side key resolution (via `.well-known/signing-key(s)`) as the trust anchor.

    ## SECURITY REDACTION RULES (MANDATORY)

    The following details MUST NOT appear in the diagrams or prose:

    1. **No rate limit numbers or thresholds** -- show "Rate Limiting" as a step without values
    2. **No queue re-validation** -- show URL validation once at API entry only. Do NOT show the defense-in-depth re-validation in the queue consumer
    3. **No error categorization or retry logic details** -- show "Queue (with retries)" as a single concept
    4. **No threat check fail-open behavior** -- show "Threat Screening" without indicating degradation behavior
    5. **No internal binding names** -- use "Queue" not "CAPTURE_QUEUE", "Database" not "D1", "Object Storage" not "R2", "Rate Limiter" not "CAPTURE_RATE_LIMITER"
    6. **No KV key patterns, D1 table names, or R2 key naming conventions**
    7. **No internal IP blocklist CIDR ranges**
    8. **No retry counts, backoff values, or max retry constants**

    **SAFE to show:**
    - Ed25519 signing model, keyId derivation, bundleHash computation
    - `.well-known/signing-key(s)` endpoint as public trust anchor
    - RFC 3161 / eIDAS timestamping conceptual flow
    - That verification uses server-side key resolution (not embedded keys)
    - That the verify endpoint is unauthenticated (by design, for third-party verification)
    - Cookie consent dismissal via autoconsent

    ## Writing conventions (match existing docs)

    - H1 matches `title` exactly
    - Opening paragraph immediately after H1: concise summary
    - Cross-links use relative URLs with trailing slash (e.g., `[Verification](/verification/)`)
    - Use `<details>/<summary>` for deep-dive content most readers can skip
    - Use `> **Note:**` for callouts
    - Keep each diagram to 5-12 participants/nodes -- if larger, simplify
    - Add brief explanatory prose (2-4 sentences) after each diagram explaining what it shows

    ## Available Skills
    The following project skills are available for this task. Read and follow
    their instructions when they are relevant to your work:
    - mermaid: `~/.claude/skills/mermaid/SKILL.md` (Mermaid diagram syntax reference for all 23 diagram types)

- **Deliverables**: `site/content/architecture.md` (new file with two Mermaid diagrams)
- **Success criteria**: Both diagrams render correctly; no redacted details exposed; prose matches existing doc conventions; diagrams are readable at conceptual level (not cluttered with endpoint-level detail)

### Task 3: Add Architecture to site navigation
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    Add the Architecture page to the WRL docs site navigation.

    ## What to do

    1. **Update `site/_data/site.js`**: Add `{ title: "Architecture", url: "/architecture/" }`
       after `{ title: "API Reference", url: "/api-reference/" }` (line 13) and before
       the `// Security & Compliance` comment (line 14).

    2. **Update `site/content/index.md`**: Add an Architecture card to the "What's next"
       card grid at the bottom of the Getting Started page. Place it after the API Reference
       card and before the Security card. Card text:
       ```
       **[Architecture](/architecture/)**
       How WRL processes captures, signs bundles, and maintains the integrity chain.
       ```

    ## What NOT to do

    - Do not modify any other navigation or content files
    - Do not reorder existing nav entries
    - Do not modify `architecture.md` (created in a prior task)

    ## Files to modify

    - `site/_data/site.js`
    - `site/content/index.md`

- **Deliverables**: Updated `site/_data/site.js` (nav entry), updated `site/content/index.md` (card link)
- **Success criteria**: Architecture appears in sidebar navigation between API Reference and Security & Compliance; card appears on Getting Started page

### Cross-Cutting Coverage

- **Testing**: Excluded. This task produces static documentation (Markdown + a small JS init script). No executable business logic. The Mermaid init script is trivial (~15 lines) and will be visually verified. Phase 6 test execution will run existing tests to confirm no regressions.
- **Security**: Covered. Security-minion provided a comprehensive redaction list (9 items) that is embedded directly in the Task 2 prompt. No separate security review task needed -- the redaction rules are constraints on the content, not a review gate.
- **Usability -- Strategy**: Covered implicitly. The page placement decision (after API Reference, before Security) follows the natural reading flow identified by software-docs-minion: onboarding --> usage --> reference --> understanding --> trust. No separate UX strategy task needed for a single documentation page.
- **Usability -- Design**: Excluded. No custom UI components or interaction patterns. The page uses the existing `doc.njk` layout with standard Markdown rendering.
- **Documentation**: This IS the documentation task. software-docs-minion is the primary agent.
- **Observability**: Excluded. No runtime components, APIs, or background processes.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. Rationale: No UI components produced (excludes ux-design-minion, accessibility-minion). No web-facing runtime code (excludes sitespeed-minion). No runtime components needing coordinated logging (excludes observability-minion). No end-user workflow changes (excludes user-docs-minion -- this is reference documentation, not a how-to guide).
- **Not selected**:
  - ux-design-minion: No custom UI components; page uses existing doc layout
  - accessibility-minion: Mermaid diagrams have known a11y limitations (SVG without alt text), but this is a Mermaid-wide issue, not something solvable at the page level. The existing whitepaper already uses Mermaid with the same limitations.
  - sitespeed-minion: Adding a CDN script (~160KB gzipped) is notable but standard; the script loads async/defer and won't block rendering
  - observability-minion: No runtime components
  - user-docs-minion: This is architecture reference documentation, not user-facing guides or tutorials

### Decisions

- **Diagram abstraction level**
  Chosen: Conceptual flows with descriptive labels (e.g., "Create Capture") and endpoint paths only in parentheses
  Over: Endpoint-level diagrams showing every route path (api-design-minion recommendation aligned)
  Why: The API Reference page already serves as the endpoint inventory. Architecture diagrams should explain HOW the system works, not repeat WHAT endpoints exist.

- **Share link flow**
  Chosen: Remove entirely from both diagrams
  Over: Including it as a "planned feature" or "future" flow
  Why: `POST /v1/captures/{id}/share` does not exist in the codebase (confirmed by api-design-minion). The verify endpoint is public and needs no share token. Diagramming non-existent features misleads users.

- **Scope of user interaction flows**
  Chosen: 5 interaction patterns (auth, single capture, batch, verification+certificate, account management)
  Over: 6 patterns including scheduled captures + diff + notifications (api-design-minion recommendation)
  Why: The issue asks for two diagrams on an architecture overview page. Scheduled captures, diff, and notifications are real features but including them makes the sequence diagram too complex for the "clear enough for potential customers and technical evaluators" goal. These can be added later or documented on their own pages.

- **Mermaid rendering approach**
  Chosen: Client-side CDN script (async load + init)
  Over: Build-time rendering via Eleventy plugin (e.g., eleventy-plugin-mermaid)
  Why: The site already has 3 unrendered Mermaid blocks in the whitepaper. Client-side rendering fixes all existing and future diagrams with zero build complexity. Aligns with project's "prefer lightweight, vanilla solutions" principle.

### Risks and Mitigations

1. **Mermaid CDN availability** (LOW): If jsdelivr is down, diagrams render as code blocks. Mitigation: acceptable degradation -- content remains readable as text. No build dependency means no build failures.

2. **Diagram inaccuracy** (MEDIUM): The diagrams must reflect actual system behavior, not the (partially inaccurate) issue description. Mitigation: Task 2 prompt embeds the verified pipeline sequence from security-minion's source code analysis. The approval gate catches inaccuracies before merge.

3. **Security information leakage** (MEDIUM): Over-detailed diagrams could expose attack surface. Mitigation: 8-item redaction checklist embedded in Task 2 prompt, derived from security-minion's analysis. Phase 3.5 security review will verify compliance.

4. **Mobile overflow** (LOW): Wide Mermaid diagrams may overflow on narrow screens. Mitigation: Mermaid generates responsive SVGs by default. If overflow occurs, a CSS `overflow-x: auto` wrapper can be added in a follow-up.

### Execution Order

```
Batch 1: Task 1 (Mermaid JS rendering)
         ↓
Batch 2: Task 2 (Architecture page with diagrams) [APPROVAL GATE]
         ↓
Batch 3: Task 3 (Navigation update)
```

All tasks are sequential. Task 2 has an approval gate because the diagram content
defines the public description of the system's architecture and security model.

### Verification Steps

1. Build the docs site locally (`cd site && npx @11ty/eleventy --serve`) and verify:
   - Architecture page renders at `/architecture/`
   - Both Mermaid diagrams render as SVG (not code blocks)
   - Existing whitepaper Mermaid diagrams also render correctly
   - Navigation shows "Architecture" between "API Reference" and "Security & Compliance"
   - Getting Started page shows Architecture card
2. Review diagram content against the 8-item redaction checklist
3. Verify no share link flow appears in either diagram
4. Check that the cryptographic proof chain correctly shows signatures/timestamps as siblings (not sequential chain)
