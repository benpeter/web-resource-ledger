# Domain Plan Contribution: user-docs-minion

## Recommendations

### 1. Information Architecture: Task-First, Not Feature-First

The six pages should be organized around what users want to DO, not around WRL's internal structure. The sidebar navigation should mirror a user's progressive journey:

```
Getting Started          <-- tutorial (learning-oriented)
Authentication           <-- how-to (task-oriented)
Verification             <-- explanation + how-to (understanding + task)
Batch Captures           <-- how-to (task-oriented)
MCP Server               <-- how-to (task-oriented)
API Reference            <-- reference (information-oriented)
```

This ordering reflects the Divio documentation system types and follows the user's natural progression: learn the basics, secure your access, understand the trust model, scale up, integrate with tools, then look up specifics.

The API Reference should be LAST in the navigation -- not first. New users do not start by reading API specs. They start by trying to accomplish something. The API Reference is a lookup resource for users who already understand the product.

### 2. Getting Started Guide: Design for the "Aha Moment"

The Getting Started guide is the single most important page. Research shows improvements in the first 5 minutes drive 50% increases in lifetime value. The "aha moment" for WRL is: "I captured a web page and I can cryptographically prove it hasn't been tampered with."

**Target persona and prerequisites:** Assume the user is a developer or technical user who already has a WRL API key. They do NOT need to deploy their own instance. The Getting Started guide targets API consumers, not self-deployers. Self-deployment is a separate concern covered by the README's Setup section.

Prerequisites to state explicitly:
- A WRL API key (link to Auth guide for how to get one, or to the operator)
- `curl` or any HTTP client
- Node.js 20+ (for the verification step only)
- A URL you want to capture

**Three-step structure (not four):** The current README has a 4-step flow (submit, poll, retrieve, verify). For Getting Started, compress to 3 steps to hit the 72% completion rate sweet spot:

1. **Capture a page** -- POST to /v1/captures, get back an ID
2. **Check the result** -- GET the status URL, see the completed capture with artifact links
3. **Verify the evidence** -- Run `npx @w-r-l/verify` on the capture URL to see all checks pass

Steps 2 and 3 in the README (poll + retrieve) should be collapsed into a single "Check the result" step. The user does not need to understand the polling lifecycle in a Getting Started tutorial -- they just need to wait a few seconds and hit the status URL again. The polling pattern belongs in the API Reference.

**Expected outcomes at each step:** Every step must show the exact JSON the user will see, with clear "you should see..." guidance. After step 3, a callout should say: "You just captured a web page with cryptographic proof. The Ed25519 signature and RFC 3161 timestamp prove this content existed at this moment -- and anyone can verify it."

**Time budget:** Step 1 takes ~5 seconds (one curl command). Step 2 takes ~15-20 seconds (wait + curl). Step 3 takes ~10 seconds (one npx command). Total: under 1 minute of hands-on time, well within the 5-minute ceiling even accounting for reading time.

### 3. Relationship to README: Complementary, Not Duplicative

The README and docs site serve different audiences and access patterns:

| Concern | README | Docs Site |
|---------|--------|-----------|
| Audience | GitHub visitors, potential contributors, evaluators | Active users, API consumers, integrators |
| Access pattern | Scrolled once, top-to-bottom | Navigated by task, bookmarked, searched |
| Depth | Overview + quick start + setup | Comprehensive guides by topic |
| Auth coverage | Brief mention of `$WRL_API_KEY` | Full guide covering tenant keys, admin keys, scopes, legacy mode |
| Verification | 4-line example | Full explanation of cryptographic chain |
| MCP | Link to `docs/mcp.md` | Complete setup + workflow guide |

**Concrete strategy:** The README should remain the "elevator pitch + quick start + self-deployment setup" document. The docs site is where users go for depth after the README convinces them to try WRL.

The README's Usage section (steps 1-4) should stay AS IS but gain a prominent link: "For comprehensive guides, see [docs.webresourceledger.com](https://docs.webresourceledger.com)."

The Getting Started guide on the docs site should NOT be a copy-paste of the README's usage section. It should be a tutorial (learning-oriented, with context and explanations) whereas the README is a reference-style quick start (here are the commands, go).

The `docs/mcp.md` file currently in the repo should become the canonical source that gets rendered into the docs site's MCP page. This avoids content duplication -- the docs site renders the same markdown, not a copy.

### 4. Authentication Guide: Three Personas, One Page

The auth guide is complex because WRL has three auth modes. Structure it by user persona, not by auth mechanism:

**Section 1: "Using Your API Key" (80% of readers)**
- You have an API key from your WRL operator
- Set it as `Authorization: Bearer YOUR_API_KEY`
- Scopes: `capture` (implies `read`), `read`-only, `admin`
- Quick table showing which endpoints need which scope

**Section 2: "Managing API Keys (Operators)" (15% of readers)**
- For people who run a WRL instance
- Admin key setup
- Creating tenant keys via POST /v1/admin/keys
- Listing keys, revoking keys
- Key lifecycle: create, use, rotate (create new + revoke old), revoke

**Section 3: "Legacy Single-Key Mode" (5% of readers)**
- For existing deployments that haven't migrated
- `CAPTURE_API_KEY` as the static bearer token
- Migration path to per-tenant keys
- This section should be short and directive: "We recommend migrating to per-tenant keys. Here's how."

Use progressive disclosure: sections 2 and 3 can be collapsible (`<details>` elements) so that the 80% of users who just need to use their API key see a clean, short page.

### 5. Verification Guide: Depth Calibration

The verification guide should serve two audiences with progressive disclosure:

**Primary layer -- "How to verify" (task-oriented, all users):**
- Run `npx @w-r-l/verify capture.wacz --origin https://your-wrl.example.com`
- What each check means in plain language (table from verify README is excellent -- reuse it)
- What "PASS" means: "This content has not been modified since it was captured"
- What "FAIL" means: "Something has changed -- the evidence may be compromised"
- Online vs. offline verification options

**Secondary layer -- "How verification works" (explanation-oriented, curious/technical users):**
This should be a collapsible "Under the hood" section or a clearly marked deep-dive area. Cover:

- **Ed25519 signatures:** What they prove (the operator signed this bundle), what they don't prove (that the operator is trustworthy -- that's the domain trust model). Keep to 2-3 paragraphs. Do NOT explain the math of elliptic curve cryptography. Users need to understand the trust model, not the algorithm.

- **RFC 3161 timestamps:** What they prove (an independent authority confirms this hash existed at this time), why they matter (the operator cannot backdate evidence), who the TSA is (DigiCert). 2-3 paragraphs. Link to the RFC for readers who want the specification.

- **WACZ bundle structure:** What's inside (datapackage.json manifest, artifact files, signatures array), how hashes chain together (artifact hashes -> bundle hash -> signature -> timestamp). A simple diagram showing the chain would be valuable here -- ASCII art or a Mermaid diagram. Do NOT reproduce the full WACZ spec. Focus on what a WRL bundle contains specifically.

- **Key rotation and verification:** Brief explanation that old captures continue to verify after key rotation. Link to the `/.well-known/signing-keys` endpoint. 1 paragraph.

This depth calibration avoids two failure modes: (1) scaring users away with cryptography they don't need to understand, and (2) failing to explain the trust model for users who need to evaluate WRL's evidence claims.

### 6. MCP Guide: Workflow-First

The existing `docs/mcp.md` is well-structured. For the docs site version:

- Lead with the value proposition: "Any MCP-compatible agent can capture web pages and verify evidence without writing HTTP client code."
- Setup instructions organized by client (Claude Code, Cursor, Windsurf, generic) -- the current structure is correct
- The tutorial walkthrough (capture-and-verify in 3 tool calls) should be the hero content
- Add an "Example Agent Workflows" section with 2-3 real use cases:
  - "Before deploying, capture the current production page for evidence"
  - "Verify a capture was not tampered with before citing it in a report"
  - "Capture multiple pages for a compliance audit" (connects to Batch guide)

### 7. Batch Guide: Pattern-Oriented

The batch guide should focus on the two patterns users need:

**Pattern 1: Submit and poll**
- POST /v1/captures/batch with a urls array
- Parse the 207 response: check each item's status
- Poll each accepted capture individually
- Handle mixed results (some accepted, some failed)

**Pattern 2: Error handling**
- Per-item failures (422 for private IPs, 429 for rate limits)
- Whole-batch failures (401 auth, 400 bad structure, 503 capacity)
- Rate limit behavior: tokens consumed per URL, not per request

Include a complete curl example showing a 2-URL batch, the 207 response, and the polling follow-up. This is the kind of content users will copy-paste and adapt.

### 8. Landing Page Decision

The docs site needs a landing page, but it should be minimal. Do NOT create a marketing-style landing page. Create a brief hub page that:

- States what WRL does in one sentence
- Shows the 6 guides as cards or a list with one-sentence descriptions
- Points users to the Getting Started guide as the obvious first action
- Links to the GitHub repo and the README for setup/deployment

This page is a wayfinding tool, not a sales pitch.

---

## Proposed Tasks

### Task 1: Content Architecture Document
**What to do:** Write a content architecture specification that defines the page hierarchy, per-page outline (H2/H3 structure), cross-page link map, and terminology glossary. This is the blueprint every content page is written against.

**Deliverables:**
- `site/content-architecture.md` -- page hierarchy, per-page H2/H3 outline, internal link map, terminology decisions (e.g., always "API key" not "token", always "capture" not "snapshot")

**Dependencies:** None. This should happen before any content writing begins. It is the output of this planning phase and should be approved at the content structure gate.

### Task 2: Getting Started Tutorial
**What to do:** Write the Getting Started page following the 3-step structure defined above. Include exact curl commands and expected JSON responses. Use the WRL production URL (wrl.benpeter.workers.dev) for examples where a real URL is needed, and `wrl.example.com` for generic examples. End with "What's next" links to Auth, Verification, and MCP guides.

**Deliverables:**
- `site/content/getting-started.md` (or `.njk` depending on the build approach chosen by frontend-minion)

**Dependencies:** Task 1 (content architecture). Also depends on frontend-minion's decision on the build approach (11ty vs. plain HTML), which determines the content file format.

### Task 3: Authentication Guide
**What to do:** Write the Authentication page with the three-persona structure (Using Your API Key, Managing Keys for Operators, Legacy Mode). Include scope reference table, curl examples for key creation/listing/revocation, and migration guidance.

**Deliverables:**
- `site/content/authentication.md`

**Dependencies:** Task 1.

### Task 4: Verification Guide
**What to do:** Write the Verification page with the two-layer structure (how to verify + how it works). Include the CLI usage examples from `packages/verify/README.md` (do not duplicate -- reference or include). Write the "Under the hood" explanation section with the cryptographic chain diagram.

**Deliverables:**
- `site/content/verification.md`

**Dependencies:** Task 1.

### Task 5: MCP Server Guide
**What to do:** Adapt the existing `docs/mcp.md` into the docs site format. Add the "Example Agent Workflows" section with 2-3 use cases. Ensure setup instructions cover all four client types.

**Deliverables:**
- `site/content/mcp.md` (or symlink/include from `docs/mcp.md` to avoid duplication -- depends on build approach)

**Dependencies:** Task 1. The existing `docs/mcp.md` content is well-structured and should be the starting point.

### Task 6: Batch Captures Guide
**What to do:** Write the Batch Captures page with the two-pattern structure (submit-and-poll, error handling). Include a complete end-to-end curl example with 207 response parsing.

**Deliverables:**
- `site/content/batch.md`

**Dependencies:** Task 1.

### Task 7: Landing Page
**What to do:** Write the minimal landing page content: one-sentence product description, 6-guide card content (title + one-sentence summary each), prominent Getting Started CTA.

**Deliverables:**
- `site/content/index.md`

**Dependencies:** Task 1.

### Task 8: README Cross-Link Update
**What to do:** Add a docs site link to the README. Add a brief "For comprehensive guides..." callout after the Usage section. Update the MCP Server section's link to point to the docs site instead of `docs/mcp.md` (or add the docs site as the primary link).

**Deliverables:**
- Updated `README.md` with docs site links

**Dependencies:** Tasks 2-7 (all content written), and the docs site being deployed.

---

## Risks and Concerns

### Risk 1: Content Duplication Drift
The README, `docs/mcp.md`, `packages/verify/README.md`, and the docs site all describe WRL usage. Over time, changes to the API will be reflected in some places but not others.

**Mitigation:** Establish clear ownership boundaries. The docs site is the canonical user-facing documentation. The README is the GitHub landing page. Package READMEs are package-specific. Where possible, the docs site build should include content from existing markdown files (e.g., `docs/mcp.md`) rather than maintaining a separate copy. Add a CI check or at minimum a documented convention: "When you change an API endpoint, update `openapi.yaml` and the relevant docs site page."

### Risk 2: Getting Started Prerequisites Assumption
The guide assumes users have an API key. If the primary deployment is Ben's own instance, new users cannot self-provision keys. They need to contact the operator.

**Mitigation:** The Getting Started guide must clearly state: "You need a WRL API key. If you're using a hosted WRL instance, request one from your operator. If you're running your own instance, see the Authentication guide for how to create keys." Do not hand-wave this prerequisite or assume users will figure it out.

### Risk 3: Cryptography Explanation Depth
Going too deep into Ed25519 and RFC 3161 will alienate the 90% of users who just want to verify their captures. Going too shallow will fail the 10% who need to evaluate WRL's trust model for compliance or legal use cases.

**Mitigation:** The two-layer progressive disclosure structure (action layer + understanding layer) addresses this. The action layer must be self-contained -- a user who never opens the "Under the hood" section should still be able to verify captures and understand what the results mean. The explanation layer should explain the trust model (what is proven, what is not proven, what trust assumptions exist) rather than the cryptographic algorithms.

### Risk 4: openapi.yaml as Single Source of Truth Creates a Hard Dependency
If the API reference page is auto-generated from openapi.yaml, the build pipeline must handle a 2,868-line YAML file. Rendering failures in the API spec block the entire docs site build.

**Mitigation:** This is primarily a frontend-minion and api-spec-minion concern (build pipeline), but from a content perspective: the hand-written guide pages (Getting Started, Auth, etc.) should NOT depend on the auto-generated API reference content. They should be self-contained how-to guides that link to the API reference for details, not pages that embed or inline API reference content. This means a broken API reference build degrades one page, not all six.

### Risk 5: Stale Example URLs and Responses
The guides will include curl examples with URLs and JSON response bodies. As the API evolves, these examples may become inaccurate.

**Mitigation:** Use `wrl.example.com` as the example hostname (matching the README and openapi.yaml conventions). For JSON response examples, match the openapi.yaml examples exactly where possible -- this creates a single source of truth for response shapes. Consider a CI step that validates example curl commands against the staging environment, though this may be over-engineering for a first version.

---

## Additional Agents Needed

**None for the planning phase.** The five consultations in the meta-plan cover the necessary expertise: frontend-minion (build), api-spec-minion (OpenAPI rendering), iac-minion (deployment), user-docs-minion (content -- this contribution), and ux-strategy-minion (navigation UX).

For the **execution phase**, I recommend:

- **accessibility-minion** should review the final built site against the Lighthouse >= 90 accessibility target. This is called out in the meta-plan already.
- If the verification guide's cryptographic chain explanation needs technical accuracy review, **security-minion** should review that specific section for correctness of trust model claims (what Ed25519 proves vs. what it doesn't, what RFC 3161 proves vs. what it doesn't). Incorrect claims about cryptographic guarantees are worse than no claims.
