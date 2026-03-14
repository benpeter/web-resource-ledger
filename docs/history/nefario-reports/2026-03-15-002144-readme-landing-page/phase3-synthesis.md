## Delegation Plan

**Team name**: readme-landing-page
**Description**: Restructure README.md as an effective landing page: positioning, usage examples, setup docs -- in that order.

### Task 1: Rewrite README.md as project landing page
- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: README.md is the single most visible file in the repo and the primary landing page for all visitors. The restructure changes information architecture, adds new content (positioning, usage examples, CAPTURE_API_KEY docs), and moves existing content. Hard to reverse in the sense that getting the structure wrong means every visitor gets the wrong first impression. High blast radius -- downstream documentation phases (Phase 8) will build on whatever structure lands here.
- **Prompt**: |
    You are rewriting the README.md for Web Resource Ledger (WRL) to serve as
    an effective project landing page. The current README is a setup manual --
    it shows infrastructure commands before explaining what the product does.
    Your job is to restructure it so first-time visitors quickly understand
    what WRL does, see it working, and then find setup instructions.

    ## Files to Read First

    Read these files before writing anything:

    - `README.md` (current content -- preserve all setup instructions)
    - `openapi.yaml` (API spec -- derive curl examples from the examples section)
    - `CONTRIBUTING.md` (local dev docs -- cross-reference, don't duplicate)
    - `package.json` (version, engines, dependencies)
    - `docs/evolution/README.md` (phase count for the despicable-agents section)

    ## Target Structure (in this exact order)

    ```
    # Web Resource Ledger (WRL)

    [badges on one line]
    [one-line tagline -- keep existing]
    [2-3 sentence positioning expansion]

    ## What you get

    [concrete artifacts from a single capture -- bullet list]

    ## Usage

    [env var setup note + 4-step numbered walkthrough]

    ## Setup
    ### Prerequisites
    ### 1. Install dependencies
    ### 2. Create KV namespace
    ### 3. Create R2 bucket
    ### 4. Configure capture API key     <-- NEW
    ### 5. Configure signing key          <-- existing content, renumbered
    ### 6. Deploy

    ## Development
    [one-line cross-reference to CONTRIBUTING.md]

    ## Built with despicable-agents
    [short section, links to docs/evolution/]

    ## Reference
    ### Key Rotation
    ### Public Key Endpoint

    ## License
    [one line: Apache 2.0 with link]
    ```

    ## Section-by-Section Instructions

    ### Badges (one line, immediately below H1)

    Place these badges on a single line with spaces between them, before the
    tagline. Order: CI status, license, despicable-agents, vibe-coded.

    ```markdown
    [![CI](https://github.com/benpeter/web-resource-ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/benpeter/web-resource-ledger/actions/workflows/ci.yml)
    [![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
    ![despicable](https://img.shields.io/badge/%E2%9A%97%EF%B8%8F-despicable-FFC107?style=flat&labelColor=FFF8E1)
    [![Vibe Coded](https://img.shields.io/badge/Vibe_Coded-ff69b4?logo=claude&logoColor=white)](https://github.com/trieloff/vibe-coded-badge-action)
    ```

    Use `style=flat` for the despicable badge (not `for-the-badge`) so it
    matches the other badges in height.

    ### Tagline + Positioning

    Keep the existing one-liner as the tagline (line immediately after badges):

    > Tamper-evident archival of web resources -- captures rendered screenshots,
    > HTML snapshots, HTTP headers, and resource manifests as cryptographically
    > signed, immutable bundles.

    Follow it with a 2-3 sentence positioning expansion. The positioning should:
    - Explain the "why" (prove what was online, and when)
    - List the concrete outputs (screenshot, HTML, headers, Ed25519-signed WACZ)
    - Emphasize self-hosted, your-keys positioning
    - NOT mention Cloudflare, R2, or Workers in the positioning (save for Setup)
    - NOT overclaim legal admissibility -- use "prove" not "legally admissible"

    Product-marketing-minion's recommended positioning (use as starting point,
    edit for concision):

    > Submit a URL, get back a screenshot, rendered HTML, HTTP headers, and an
    > Ed25519-signed archive that anyone can verify without an account. Deploy
    > it on your own infrastructure; your captures, your keys, your evidence.

    ### What You Get

    A bullet list of the concrete artifacts a single capture produces. This
    maps directly to what the API returns -- not abstract features, but actual
    outputs. Use this structure:

    ```markdown
    ## What you get

    A single API call produces:

    - **Full-page screenshot** (PNG)
    - **Rendered HTML** -- the DOM after JavaScript execution
    - **HTTP response headers** -- the server's response at capture time
    - **Signed WACZ bundle** -- all artifacts packaged, hashed, and signed with Ed25519
    - **Verification URL** -- a shareable link anyone can use to confirm authenticity
    ```

    ### Usage Section

    Write a 4-step numbered walkthrough using curl. This is the most important
    section -- it demonstrates the entire value proposition.

    **Key design decisions (all four specialists agreed on these):**

    1. **Use `$WRL_API_KEY` as the env var in examples.** Show the export once
       at the top of the section. The actual Cloudflare secret name is
       `CAPTURE_API_KEY` -- bridge this in the Setup section.

    2. **Use `wrl.example.com` as the placeholder hostname** (matches
       openapi.yaml). Add a note: "Replace `wrl.example.com` with your
       deployment URL, or `localhost:8787` for local dev."

    3. **4 steps: capture, poll, retrieve, verify.** Use H4 (`####`) for each
       step so they stay out of the GitHub TOC.

    4. **Show the 202 response JSON for step 1 only.** Steps 2-4 describe
       responses in prose, not full JSON blocks, to keep the section compact.

    5. **Auth asymmetry callout at step 2:** "No auth required -- the capture
       ID acts as the access secret."

    6. **Happy path only.** No error examples. One note about 401 if auth is
       missing. Point to openapi.yaml for all error codes.

    7. **Add a bridge note at the top:** "Requires a running WRL instance. See
       [Setup](#setup) below."

    8. **Total section length: under 50 lines of markdown.** If it exceeds 50
       lines, trim response bodies.

    Derive all example values from `openapi.yaml`:
    - Capture ID: `cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`
    - Host: `wrl.example.com`
    - Response shapes: use the `examples` from each endpoint

    Structure:

    ```
    ## Usage

    > Requires a running WRL instance. See [Setup](#setup) below.

    Set your API key once:
    ```bash
    export WRL_API_KEY="your-api-key"
    ```

    #### 1. Capture a page
    [POST curl with -H "Authorization: Bearer $WRL_API_KEY"]
    [202 response JSON -- the full response]

    #### 2. Poll for completion
    [GET curl -- no auth header]
    No auth required -- the capture ID acts as the access secret. Poll until
    `status` is `"complete"`.

    #### 3. Retrieve the capture
    [GET curl -- no auth header]
    Returns metadata, artifact URLs, and WACZ bundle info.

    #### 4. Verify the bundle
    [GET verify curl]
    Returns `{ "verified": true, ... }` with individual check results.
    ```

    After the walkthrough, add:

    > **Note:** The capture ID is the only way to access a capture -- there is
    > no list endpoint. Treat capture IDs like credentials.
    >
    > See [`openapi.yaml`](openapi.yaml) for all endpoints, request/response
    > schemas, and error codes.

    ### Setup Section

    Restructure existing setup content into this order. **Preserve all existing
    instructions** -- nothing removed, only reorganized and augmented.

    **Prerequisites**: Keep existing content. Change "Node.js 18+" to
    "Node.js 20+" (package.json says `>=20.0.0`).

    **Steps 1-3**: Keep existing KV namespace and R2 bucket instructions
    verbatim (adjust numbering).

    **Step 4 -- Configure capture API key (NEW)**:

    This is the main new content. Document CAPTURE_API_KEY at parity with
    the existing SIGNING_KEY section:

    - Explain what it is (static bearer token for submitting captures)
    - How to generate: `openssl rand -hex 32`
    - Production: `wrangler secret put CAPTURE_API_KEY`
    - Local dev: add to `.dev.vars`
    - Note: this key is REQUIRED (unlike SIGNING_KEY which is optional)
    - Bridge to usage: "In the usage examples above, this is `$WRL_API_KEY`."
    - Security: never commit to version control, `.dev.vars` is in `.gitignore`

    **Step 5 -- Configure signing key**: Move existing "Signing Key Setup"
    content here. Keep the content but integrate it into the numbered flow.
    Include the note that signing is optional.

    **Step 6 -- Deploy**: Move existing `wrangler deploy` content here.

    ### Development Section

    Replace the current `npm run dev` snippet with a one-line cross-reference:

    ```markdown
    ## Development

    For local development, testing, and contributing, see
    [CONTRIBUTING.md](CONTRIBUTING.md).
    ```

    Do NOT show `npm run dev` -- it's misleading without the full context
    that CONTRIBUTING.md provides.

    ### Built with despicable-agents Section

    Short section near the bottom. State the fact, link to evidence:

    ```markdown
    ## Built with despicable-agents

    This project was built from scratch using
    [despicable-agents](https://github.com/benpeter/despicable-agents), a
    multi-agent orchestration framework. Every design decision, specialist
    consultation, and outcome is documented in
    [`docs/evolution/`](docs/evolution/) -- 12 phases from kickoff to
    open-source readiness.
    ```

    ### Reference Section

    Move these existing sections here with minimal editing:
    - **Key Rotation** (existing content from current README)
    - **Public Key Endpoint** (existing content from current README)

    Do NOT add a separate "API Specification" subsection here -- the pointer
    to openapi.yaml already lives in the Usage section.

    ### License Section

    One line:

    ```markdown
    ## License

    [Apache 2.0](LICENSE)
    ```

    ## Constraints

    - **Single file change**: Only modify `README.md`. Do not modify
      openapi.yaml, CONTRIBUTING.md, or any source code.
    - **Preserve all existing setup content**: Every KV namespace, R2 bucket,
      SIGNING_KEY, Key Rotation, and Public Key Endpoint instruction must
      survive the restructure. Content can move sections but cannot be deleted.
    - **No `.dev.vars.example` file**: This is out of scope for this task
      (single-file README restructure). It's a good idea for a future phase.
    - **No frameworks or build tools**: This is a markdown file.
    - **Node version**: Use "Node.js 20+" in prerequisites (from package.json
      engines field, not the current incorrect "18+").
    - **Badge style**: Use `style=flat` for custom badges to match the CI and
      license badges.
    - **Auth terminology**: The Cloudflare secret is `CAPTURE_API_KEY`. The
      usage examples use `$WRL_API_KEY`. Bridge this explicitly in the Setup
      section.

    ## What NOT to Do

    - Do not add a "How it works" or architecture section -- architecture
      detail belongs in docs/, not the landing page.
    - Do not add error response examples -- happy path only in Usage.
    - Do not add a maturity/disclaimer note -- the v0.1.0 badge is sufficient.
    - Do not change the tagline (first line after H1 and badges).
    - Do not add a "Features" list -- the "What you get" section replaces it.
    - Do not mention Cloudflare in the positioning expansion -- only in Setup.
    - Do not add more than 4 badges.
    - Do not include Contributing, Security, or Code of Conduct sections --
      these have their own files and GitHub auto-links them.

- **Deliverables**: Rewritten `README.md`
- **Success criteria**:
  1. README structure follows: positioning/why -> usage examples -> setup/deploy (in that order)
  2. Positioning section explains what WRL does and why (1-2 sentences beyond tagline)
  3. Usage section includes 4-step curl walkthrough derived from openapi.yaml
  4. CAPTURE_API_KEY documented for both production and local dev, at parity with SIGNING_KEY
  5. README mentions despicable-agents in a dedicated section near the bottom
  6. Both the despicable badge and vibe-coded badge are present
  7. All existing setup instructions preserved (KV, R2, SIGNING_KEY, Key Rotation, Public Key Endpoint)
  8. Node.js version corrected to 20+ (matches package.json)
  9. Development section cross-references CONTRIBUTING.md instead of showing bare `npm run dev`
  10. Total README length under 200 lines

### Cross-Cutting Coverage

- **Testing** (test-minion): Not needed for execution. This is a markdown-only change with no executable output. Phase 6 will run existing tests to confirm no regressions (CI linting of README links etc.).
- **Security** (security-minion): Phase 3.5 reviewer. Will review the CAPTURE_API_KEY documentation for adequate entropy guidance and ensure examples don't encourage weak key practices.
- **Usability -- Strategy** (ux-strategy-minion): Covered. ux-strategy-minion was a Phase 2 planning consultant and provided the information architecture, progressive disclosure strategy, and cognitive load constraints that are baked into the task prompt. Phase 3.5 mandatory reviewer.
- **Usability -- Design** (ux-design-minion, accessibility-minion): Not needed. README is plain markdown rendered by GitHub -- no custom UI components or interaction design. Accessibility is handled by GitHub's rendering engine.
- **Documentation** (software-docs-minion / user-docs-minion): Covered. user-docs-minion was a Phase 2 planning consultant. The execution task IS the documentation task -- devx-minion writes the README using the structural guidance from all four planning specialists. Phase 8 will handle any follow-on documentation needs.
- **Observability** (observability-minion, sitespeed-minion): Not needed. No runtime components produced.

### Architecture Review Agents
- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - user-docs-minion: The README restructure changes what end users see as their first documentation touchpoint. user-docs-minion should validate that the documentation hierarchy (README -> CONTRIBUTING.md cross-reference, README -> openapi.yaml pointer) serves both operators and contributors without gaps.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion

### Conflict Resolutions

**1. Placeholder hostname: `wrl.example.com` vs `$WRL_URL` vs `your-wrl.workers.dev`**

- ux-strategy-minion recommended `$WRL_URL` (env var placeholder, avoids confusion)
- devx-minion recommended `wrl.example.com` with a note (matches openapi.yaml, one env var is enough)
- product-marketing-minion used `your-wrl.workers.dev` (conversational)

**Resolution**: Use `wrl.example.com` (devx-minion's recommendation). Rationale: it matches the openapi.yaml server URL exactly, so developers who cross-reference the spec see consistency. Two env vars (`$WRL_URL` + `$WRL_API_KEY`) to set before the first example is one too many for onboarding. A brief note above the examples ("Replace `wrl.example.com` with your deployment URL") handles the confusion risk with zero setup overhead.

**2. Separate "What you get" section vs. inline in positioning**

- product-marketing-minion strongly recommended a separate "What you get" section between positioning and usage
- ux-strategy-minion recommended jumping straight from positioning to usage examples
- devx-minion had no opinion on this

**Resolution**: Include "What you get" as a brief section. Rationale: it serves the Evaluator persona by showing concrete outputs before asking them to read curl commands. Product-marketing-minion's insight is correct -- artifact-focused bullets (screenshot, HTML, headers, signed bundle, verify URL) communicate value faster than abstract feature claims. The section is only 7 lines, so it doesn't push Usage below the fold.

**3. Number of usage steps: 3 vs 4**

- product-marketing-minion and ux-strategy-minion recommended 3 steps (capture, poll/retrieve combined, verify)
- devx-minion recommended 4 steps (capture, poll, retrieve, verify) because the async API makes poll-then-retrieve a meaningful two-step process

**Resolution**: Use 4 steps (devx-minion's recommendation). Rationale: WRL's API is async -- the capture endpoint returns 202 and the developer must poll before retrieving. Combining poll+retrieve hides the async nature, which will confuse developers when they try to copy-paste. The 4-step walkthrough teaches the actual API flow. The extra step adds ~8 lines, keeping the section well under 50 lines.

**4. Badge set: 3 badges vs 4 badges**

- user-docs-minion recommended 3 badges (CI, license, Node version)
- Task requirements mandate despicable-agents badge and vibe-coded badge

**Resolution**: Use 4 badges (CI, license, despicable, vibe-coded). The Node version badge is dropped -- it's visible in Prerequisites and package.json. The despicable and vibe-coded badges are project requirements. Four badges is the upper limit for visual cleanliness.

**5. env var name: `$WRL_API_KEY` vs `$CAPTURE_API_KEY` vs `$API_KEY`**

- devx-minion recommended `$WRL_API_KEY` (user-facing, shorter, follows `{PRODUCT}_{TYPE}` convention)
- product-marketing-minion used `$API_KEY` (too generic)
- The actual Cloudflare secret is `CAPTURE_API_KEY`

**Resolution**: Use `$WRL_API_KEY` in examples, `CAPTURE_API_KEY` in setup docs, with an explicit bridge sentence. devx-minion's rationale is sound -- the README-facing name should follow the `{PRODUCT}_{CREDENTIAL_TYPE}` convention. The bridge ("In the usage examples above, this is `$WRL_API_KEY`") prevents confusion.

### Risks and Mitigations

1. **Curl examples becoming stale if API changes** (likelihood: low, impact: high). Mitigation: examples are derived directly from openapi.yaml's `examples` section, ensuring consistency at write time. A CI check to validate README examples against the spec is a future backlog item.

2. **CAPTURE_API_KEY vs WRL_API_KEY naming confusion** (likelihood: medium, impact: medium). Mitigation: explicit bridge sentence in Setup section. The task prompt mandates this.

3. **Usage section exceeding 50-line budget** (likelihood: medium, impact: low). Mitigation: task prompt instructs agent to show full JSON response only for step 1. If section exceeds 50 lines, trim response bodies. Approval gate catches this.

4. **Copy-paste developers hitting `wrl.example.com`** (likelihood: medium, impact: low). Mitigation: note above examples says to replace with actual deployment URL or `localhost:8787`.

5. **Node.js version mismatch** (likelihood: certain, impact: low). Current README says "18+", package.json says ">=20.0.0". Task prompt corrects this to "20+".

### Execution Order

```
Batch 1: Task 1 (devx-minion writes README.md)
  |
  v
APPROVAL GATE: Review README.md draft
  |
  v
Phase 3.5: Architecture review (mandatory: security-minion, test-minion,
           ux-strategy-minion, lucy, margo; discretionary: user-docs-minion)
```

Single task, single gate, single review round. This is a documentation-only change to one file.

### Verification Steps

1. README structure follows the target order: badges -> tagline -> positioning -> what you get -> usage -> setup -> development -> despicable-agents -> reference -> license
2. All curl examples use values from openapi.yaml (capture ID format, response shapes, endpoint paths)
3. CAPTURE_API_KEY has production (`wrangler secret put`) and local dev (`.dev.vars`) instructions
4. All original content preserved: KV namespace, R2 bucket, SIGNING_KEY setup, Key Rotation, Public Key Endpoint
5. No broken markdown links (all internal references resolve)
6. README total length under 200 lines
7. CI passes (`npm test`, `npm run lint:api` -- though README changes shouldn't affect these)
