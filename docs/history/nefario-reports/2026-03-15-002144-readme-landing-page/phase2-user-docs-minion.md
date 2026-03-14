# Domain Plan Contribution: user-docs-minion

## Recommendations

### (a) Relationship between "Usage" section and existing "API" section -- merge, replace, or keep both?

**Replace the existing "API" section with a new "Usage" section that includes concrete curl examples, then link to openapi.yaml as a reference.**

Rationale: The current "API" section is three lines of text that tell you a spec file exists but show you nothing. A first-time visitor leaves the README without knowing what the API actually looks like in practice. That is the single biggest landing-page failure right now -- the product is an API, and the README does not demonstrate the API.

The new "Usage" section should contain:

1. **A complete capture-then-retrieve workflow in curl** -- submit a URL, poll status, retrieve artifacts. This is the core "aha moment" flow. Three commands, each with the expected response shown inline. Use `https://wrl.example.com` as the placeholder hostname (matches the openapi.yaml server URL).

2. **A verification example** -- one curl command showing how to verify a capture's WACZ bundle. This demonstrates the cryptographic signing value proposition without requiring the reader to understand Ed25519.

3. **A one-line pointer to the full spec** at the end of the section: "For the full API specification including all error responses, see `openapi.yaml`."

Why not keep both? The current "API" section has no content worth preserving separately. Its two sentences of context ("The capture endpoint accepts a URL and returns a capture ID. Use the capture ID to retrieve the stored artifacts or verify the signed bundle.") become the introductory framing of the Usage section itself. Keeping a separate three-line "API" section alongside a detailed "Usage" section creates redundancy and forces the reader to decide which one to read.

Why not merge? There is nothing to merge into -- the "API" section has no examples, no code, no detail. The Usage section replaces it entirely.

### (b) Badge placement convention

**Place badges on a single line immediately below the H1 heading, before the one-line description.**

Recommended badges, in this order:

1. **CI status** -- `[![CI](https://github.com/benpeter/web-resource-ledger/actions/workflows/ci.yml/badge.svg)](...)` -- signals the project builds and tests pass. This is the most important trust signal for a first-time visitor.
2. **License** -- Apache 2.0 badge. Answers "can I use this?" immediately.
3. **Node version** -- derived from `.nvmrc` / `engines` field. Signals the runtime requirement at a glance.

Keep the badge line short (three badges maximum). More than three badges creates visual noise and delays the reader from reaching the description. Do not add badges for things that do not exist yet (coverage, npm package, etc.).

Place them as linked images on a single line with no blank line between the badges and the project description. This is the dominant convention on GitHub and what readers expect.

### (c) Should "Key Rotation" and "Public Key Endpoint" move to a separate "Reference" section?

**Yes. Move both to a "Reference" section at the bottom of the README, after Setup and Deploy.**

The reasoning from a documentation-type perspective:

- **Key Rotation** is an operational procedure for day-2 maintenance. It is not part of first-time setup. Including it inline between "Signing Key Setup" and "Development" breaks the setup flow and creates anxiety for a first-time reader ("Do I need to worry about rotation before I even deploy?"). It belongs in reference material that operators consult when the need arises.

- **Public Key Endpoint** is informational reference -- it describes what an endpoint returns. It is not a step in any setup or usage procedure. First-time visitors do not need this to get started. Third-party integrators who need this will look for it in the API spec or a reference section, not in setup instructions.

Proposed "Reference" section structure at the bottom of the README:

```
## Reference

### Key Rotation
[existing content, lightly edited for clarity]

### Public Key Endpoint
[existing content]

### API Specification
See `openapi.yaml` for the complete OpenAPI 3.1 specification.
```

This keeps first-time setup focused on: install -> configure -> deploy -> use. Advanced operational topics are available but do not interrupt the path.

### (d) Should README cross-reference CONTRIBUTING.md for local dev or be self-contained?

**Cross-reference CONTRIBUTING.md for local development. Do not duplicate it in the README.**

The README serves two distinct audiences with two distinct goals:

1. **Users/operators** who want to deploy and use WRL. The README should fully serve this audience: setup, deploy, use.
2. **Contributors** who want to run the project locally, modify code, and submit PRs. CONTRIBUTING.md fully serves this audience.

The current CONTRIBUTING.md already has a clean Quick Start and a "Full Local Development" section that mentions both `SIGNING_KEY` and `CAPTURE_API_KEY` in `.dev.vars`. Duplicating this in the README creates a maintenance burden and muddies the README's purpose as a landing page for users.

The README should include a brief "Development" section (it already has one) with:

```
## Development

For local development and contributing, see [CONTRIBUTING.md](CONTRIBUTING.md).
```

This one-line cross-reference is sufficient. The Development section currently shows `npm run dev` -- that alone is misleading because `npm run dev` requires Cloudflare Workers Paid plan and configured secrets to do anything useful. CONTRIBUTING.md already explains this correctly (Quick Start for tests, Full Local Development for the actual pipeline).

**However**, the CONTRIBUTING.md "Full Local Development" section has a gap that this phase must fix: it mentions `.dev.vars` with `SIGNING_KEY` and `CAPTURE_API_KEY` but does not explain how to generate or set `CAPTURE_API_KEY`. The README's setup section (for production deployment) must document `CAPTURE_API_KEY` at parity with `SIGNING_KEY`, and CONTRIBUTING.md should cross-reference the README for the generation step.

### Additional structural recommendations

**Restructure the README to follow this information architecture:**

```
# Web Resource Ledger (WRL)
[badges]
[one-line description]
[two-sentence elevator pitch expanding on "tamper-evident archival"]

## Usage
[curl examples: capture, poll, retrieve, verify]
[pointer to openapi.yaml]

## Setup
### Prerequisites
### 1. Install dependencies
### 2. Create KV namespace
### 3. Create R2 bucket
### 4. Configure API key (CAPTURE_API_KEY)   <-- NEW, at parity with signing key
### 5. Configure signing key (SIGNING_KEY)   <-- existing content, renumbered

## Deploy
[wrangler deploy -- currently buried as a two-line section]

## Development
[one-line cross-reference to CONTRIBUTING.md]

## Reference
### Key Rotation
### Public Key Endpoint
### API Specification

## License
[one line: Apache 2.0]
```

This structure follows the target flow: **what it does -> how to use it -> how to set it up -> how to deploy -> reference for later**. The first screenful (before any scroll on a standard viewport) should contain the description, badges, and the beginning of the Usage section with the first curl example.

**CAPTURE_API_KEY setup documentation** must include:

1. How to generate a key (there is no script for this -- it is operator-chosen, unlike SIGNING_KEY which has `generate-signing-key.js`). Document the recommended approach: `openssl rand -hex 32` or equivalent.
2. Setting the production secret: `wrangler secret put CAPTURE_API_KEY`
3. Setting the local dev secret: add `CAPTURE_API_KEY=<value>` to `.dev.vars`
4. A note that the API key is required -- unlike SIGNING_KEY, captures fail with 401/503 without it.

## Proposed Tasks

### Task 1: Restructure README information architecture
- Reorder sections to: badges + description -> Usage -> Setup -> Deploy -> Development -> Reference -> License
- Move existing content into the new structure without content loss
- Verify all existing setup instructions (KV namespace, R2 bucket, SIGNING_KEY) are preserved in their new positions
- Dependencies: None (can begin immediately)
- Estimated scope: Medium -- structural moves, not new content

### Task 2: Write Usage section with curl examples
- Write three concrete curl examples: (1) submit capture, (2) poll status, (3) retrieve artifacts
- Add a verification curl example
- Show expected JSON responses inline (derived from openapi.yaml examples)
- Include the Bearer auth header in the capture request to demonstrate CAPTURE_API_KEY usage
- Replace the existing "API" section entirely
- Dependencies: Must align with openapi.yaml response schemas
- Estimated scope: Medium -- needs careful accuracy checking against the spec

### Task 3: Document CAPTURE_API_KEY setup at parity with SIGNING_KEY
- Add "Configure API key" subsection to Setup
- Document key generation (`openssl rand -hex 32`)
- Document `wrangler secret put CAPTURE_API_KEY` for production
- Document `.dev.vars` entry for local development
- Note that CAPTURE_API_KEY is required (unlike SIGNING_KEY which is optional)
- Dependencies: Should review src/auth.js to confirm behavior when key is missing (503)
- Estimated scope: Small -- straightforward documentation of existing functionality

### Task 4: Add badges
- Add CI status badge (GitHub Actions workflow)
- Add License badge (Apache 2.0)
- Add Node.js version badge (from .nvmrc or engines field)
- Place on single line below H1
- Dependencies: None
- Estimated scope: Small

### Task 5: Create Reference section
- Move Key Rotation content to Reference section
- Move Public Key Endpoint content to Reference section
- Add API Specification pointer
- Light editing for clarity (no content changes)
- Dependencies: Task 1 (structural reorganization)
- Estimated scope: Small

### Task 6: Update Development section and CONTRIBUTING.md cross-reference
- Replace current `npm run dev` snippet with cross-reference to CONTRIBUTING.md
- Verify CONTRIBUTING.md accurately describes the full local dev setup including CAPTURE_API_KEY
- Dependencies: Task 3 (CAPTURE_API_KEY must be documented in README before CONTRIBUTING.md can reference it)
- Estimated scope: Small

## Risks and Concerns

### Risk 1: Curl examples become stale if API changes
- **Likelihood**: Low for now (API is pre-1.0 and simple), but increases over time
- **Impact**: High -- incorrect examples on the landing page destroy trust immediately
- **Mitigation**: Curl examples should use the exact response shapes from openapi.yaml examples. Consider adding a CI check that validates README curl examples against the spec (post-MVP, not this phase). For now, manual verification during this phase is sufficient.

### Risk 2: CAPTURE_API_KEY generation guidance could conflict with future per-tenant key system
- **Likelihood**: Medium -- backlog explicitly lists per-tenant API keys as [must]
- **Impact**: Low -- the README will need updating when per-tenant keys ship regardless
- **Mitigation**: Document the current single-key approach honestly. Do not speculate about future key systems. Include a note like "WRL uses a single API key for all capture requests" so readers understand the current model.

### Risk 3: Missing `.dev.vars.example` file
- **Likelihood**: Certain -- no `.dev.vars.example` exists in the repo
- **Impact**: Medium -- contributors must read two separate README sections to assemble the correct `.dev.vars` file
- **Mitigation**: This phase should create a `.dev.vars.example` file listing all expected variables with placeholder values and comments. This is a common convention for projects with environment-variable configuration. The file should contain:
  ```
  # API key for capture submission (required)
  # Generate with: openssl rand -hex 32
  CAPTURE_API_KEY=your-api-key-here

  # Ed25519 signing key for WACZ bundles (optional)
  # Generate with: node scripts/generate-signing-key.js
  SIGNING_KEY=your-base64-signing-key-here
  ```
  This is a small addition with high payoff -- it is the single file a new contributor needs to get a working local dev environment.

### Risk 4: README length after restructuring
- **Likelihood**: Medium -- adding Usage examples and CAPTURE_API_KEY docs adds content
- **Impact**: Low if structured well -- progressive disclosure via clear headings lets readers jump to their section
- **Mitigation**: Keep examples minimal (one capture workflow, one verification). Do not document every error case or edge case in the README -- that is what openapi.yaml is for. The Reference section at the bottom is naturally "below the fold" for casual visitors.

### Risk 5: `npm run dev` alone does not produce a working local environment
- **Likelihood**: Certain -- this is current behavior
- **Impact**: Medium -- the README currently shows `npm run dev` as if it just works, but it requires Cloudflare Workers Paid plan, Browser Rendering, and configured secrets
- **Mitigation**: The restructured README should not show `npm run dev` as a standalone section. The Development section cross-references CONTRIBUTING.md which correctly explains the two-tier setup (tests only vs full local dev). This phase resolves the issue by restructuring, not by adding more caveats.

## Additional Agents Needed

**None beyond what is presumably already involved.** The work is primarily user-facing documentation restructuring. However:

- If a **devx-minion** is involved, coordinate on the `.dev.vars.example` file -- it straddles documentation and developer experience. The devx-minion may have opinions on its format and placement.
- If a **security-minion** is involved, they should review the CAPTURE_API_KEY generation guidance (`openssl rand -hex 32`) to confirm it produces a key of adequate entropy and that the README does not inadvertently encourage weak key choices.
- The curl examples in the Usage section should be **validated against the actual running API** if possible, not just derived from the OpenAPI spec. If an **edge-minion** or **test-minion** is available, they could confirm the exact response shapes. The openapi.yaml examples are the best source of truth available, but spec-vs-reality drift is a real risk.
