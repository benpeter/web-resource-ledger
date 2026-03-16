## Delegation Plan

**Team name**: docs-drift-audit
**Description**: Fix all documentation drift against recent code changes (PRs #54-#57), covering README, CONTRIBUTING, openapi.yaml, and repo-root document organization.

---

### Conflict Resolution: PRODUCT.md and MVP.md

**ux-strategy-minion** recommends moving both files into `docs/evolution/0001-kickoff/` to eliminate conflicting narratives in the repo root. **software-docs-minion** recommends keeping them in place with status headers because backlog.md and evolution log entries reference them by path.

**Resolution: Keep in place with status headers (software-docs-minion's approach).**

Rationale:
- There are 5 references to `MVP.md` in `docs/backlog.md` and 15+ references across evolution log files. Moving would break all of these or require updating them, which means editing historical records -- the evolution log is explicitly append-only.
- The CLAUDE.md engineering philosophy says KISS -- adding a status header is a 2-line change per file; moving files and fixing references is a multi-file refactor with risk of broken cross-references.
- ux-strategy-minion's core concern (cognitive load from conflicting narratives) is addressed by the status headers: a newcomer reading PRODUCT.md sees immediately that it's a historical vision document and is directed to README.md for current state. The signal is clear without the file move.
- PRODUCT.md lives at the repo root, not in `docs/`. It's visible but the README is the entry point (GitHub renders README.md by default). A newcomer would have to actively click into PRODUCT.md to encounter it -- at which point the status header catches them.

ux-strategy-minion's concern about "three conflicting narratives" is valid but the mitigation (headers) is proportionate to the risk. The move would be warranted if these files appeared in documentation navigation or were linked from the README -- they are neither.

---

### Task 1: Fix OpenAPI spec -- missing routes, responses, and headers
- **Agent**: api-spec-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The OpenAPI spec is the API contract source of truth. Changes propagate to SDK generation, mock servers, and contract tests. 13 discrepancies across 4 categories; getting these right before downstream documentation tasks reference the spec is critical.
- **Prompt**: |
    You are updating `openapi.yaml` in the web-resource-ledger project to fix 13
    discrepancies between the spec and the actual implementation in `src/index.js`.

    ## Context

    The OpenAPI spec is at version 0.3.0 and was last updated in phase 0019.
    Recent PRs (#54-#57) added features that the spec partially documents but
    with gaps. The spec is the API contract source of truth -- mock servers
    (Prism), SDK generators, and contract tests depend on it.

    ## What to fix

    **Must-fix (7 items):**

    1. **Add OPTIONS /v1/captures operation** -- `src/index.js:55-67` handles
       CORS preflight returning 204 with Access-Control-Allow-Origin,
       Access-Control-Allow-Methods, Access-Control-Allow-Headers,
       Access-Control-Max-Age, Vary, and Cache-Control: no-store. Add this as
       an `options` operation under `/v1/captures`.

    2. **Add 503 response to GET /v1/captures** -- `src/index.js:225-231`
       returns 503 when GLOBAL_CAPTURE_LIMITER rejects with Retry-After: 10.
       The spec (lines 730-735) lists only 400, 401, 429.

    3. **Add 500 response to GET /v1/captures** -- `src/index.js:261-265`
       returns 500 on KV error. No 500 in spec.

    4. **Add 422 response to GET /v1/verify/{captureId}** --
       `src/index.js:473-475` returns 422 for oversized WACZ bundles. Spec
       (lines 1141-1146) lists only 404, 429, 503.

    5. **Add Link (TermsLink) header to ALL response definitions** --
       `src/index.js:107` sets the Link header on every response
       unconditionally. Currently only documented on GET /health 200 (line
       613-614). Add to all ~25 response definitions including all Problem
       response components (Problem400, Problem401, Problem404, Problem415,
       Problem422, Problem429, Problem503).

    6. **Add Retry-After header to Problem503 component** -- `src/index.js:154`
       returns Retry-After: 10 on 503 capacity limit. Problem503 (lines
       574-592) doesn't include it.

    7. **Add CORS headers to POST /v1/captures error responses** --
       `src/index.js:87-94` applies CORS headers to ALL POST /v1/captures
       responses including errors. Currently only documented on the 202
       response (lines 781-789). Add Access-Control-Allow-Origin and Vary to
       the 400, 401, 415, 422, 429, 503 responses under POST /v1/captures.

    **Should-fix (4 items):**

    8. **Add failed/pending examples to listCaptures 200 response** -- Current
       examples (lines 708-729) only show complete status. Add examples showing
       the `failedAt`, `error`, `retryable` fields and a pending capture.

    9. **Add `legal` to health endpoint required array** --
       `src/index.js:113-119` always returns the legal object. Spec (lines
       618-632) only requires `status`. Add `legal` to required, and add
       `required: [terms, policy]` to the legal object.

    10. **Reconcile example detail strings with code output** -- Several
        Problem response examples don't match actual code strings:
        - 429 example: spec says "Try again in 60 seconds", code says "Try
          again later"
        - 503 example: spec says "Service is not configured. Contact the
          operator.", code says "Service is at capacity. Retry in 10 seconds."
        - 415 example: spec has trailing period, code does not
        Pick the code's actual strings as canonical.

    11. **Add note about X-RateLimit-Limit on error responses** -- The header
        appears on all non-503 responses from rate-limited endpoints, not just
        success responses. Add a description note to the X-RateLimit-Limit
        header component, or add the header to error responses on rate-limited
        endpoints.

    **Nice-to-have (2 items):**

    12. Add `example: 60` to the RetryAfter header schema.
    13. Add `example: 5` to the 202-specific Retry-After reference.

    ## What NOT to do

    - Do NOT change any behavioral aspects of the API -- this is documentation-only
    - Do NOT bump the spec version (the orchestrator will handle versioning decisions)
    - Do NOT restructure the spec layout or rename components
    - Do NOT add endpoints that don't exist in code
    - Do NOT document trailing-slash normalization or catch-all 404 -- those are
      server behavior, not API contract

    ## Files to modify

    - `openapi.yaml` (the only file)

    ## How to verify

    After making changes, run `npm run lint:api` to validate the spec.

    ## Deliverables

    Updated `openapi.yaml` with all 13 discrepancies resolved. Each change
    should be traceable to the numbered items above.

- **Deliverables**: Updated `openapi.yaml` with all discrepancy fixes
- **Success criteria**: `npm run lint:api` passes; every response definition includes the Link header; all error codes match what the code can actually return

### Task 2: Rewrite README Reference section (Key Rotation + Public Key + signing-keys)
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The Key Rotation section is actively misleading -- it tells deployers that key rotation destroys old capture verification, which is false since PR #54. Getting this wrong could cause a deployer to avoid rotating a compromised key. High blast radius (operator trust), hard to reverse (published misinformation).
- **Prompt**: |
    You are rewriting the Reference section of `README.md` in the
    web-resource-ledger project. The current Key Rotation and Public Key
    Endpoint sections contain dangerously stale information.

    ## Context

    PR #54 (phase 0017) implemented key versioning. The code now:
    - Computes a `keyId` (first 8 hex chars of SHA-256 of raw public key) for
      every key (`src/signing.js:73-74`)
    - Archives every signing key in KV before completing a capture
      (`src/kv.js:251-263`)
    - Looks up the archived key by `keyId` from the KV record during
      verification (`src/index.js:438-448`)
    - Exposes `/.well-known/signing-keys` (plural) listing all historical keys
      (`src/index.js:534-551`)
    - Returns `keyId` in the `/.well-known/signing-key` response
      (`src/index.js:528`)

    ## What to fix

    **1. Rewrite Key Rotation section (lines 216-226)**

    The current text says:
    - "Rotating the signing key invalidates signature verification for all
      captures signed with the previous key" -- FALSE
    - "There is no key history endpoint yet" -- FALSE
    - "Key versioning and old-key verification are not yet implemented" -- FALSE

    Replace with accurate documentation:
    - Key rotation is safe: old captures continue to verify because keys are
      archived automatically
    - Each key gets a `keyId` fingerprint (8-char hex of SHA-256 of raw public
      key bytes)
    - During verification, the system looks up the correct historical key by
      the `keyId` stored in the WACZ bundle's `signedData`
    - The `/.well-known/signing-keys` endpoint exposes the full key archive
    - Keep the rotation procedure steps (generate, update secret, update
      .dev.vars) -- those are still correct
    - Mention that pre-key-versioning captures (signed before PR #54 was
      deployed) fall back to the current key for verification -- if the current
      key doesn't match, those specific captures will fail. This is the one
      edge case to note honestly.

    **2. Update Public Key Endpoint section (lines 228-230)**

    The current text documents the response shape as `{ algorithm, publicKey }`.
    The actual response is `{ algorithm, publicKey, keyId }`. Update the shape
    and explain what `keyId` is (8-char hex fingerprint of SHA-256 of the raw
    public key bytes).

    **3. Add Key Archive Endpoint section (new, after Public Key Endpoint)**

    Document `GET /.well-known/signing-keys` (plural):
    - Purpose: lists all historical signing keys for third-party verification
    - Response shape: `{ keys: [{ keyId, algorithm, publicKey, archivedAt }] }`
    - Use case: third-party verifiers matching WACZ `signedData.keyId` against
      the key archive to verify captures signed with any historical key
    - Rate-limited (same group as the singular endpoint)

    ## Writing style

    - Match the existing README voice: direct, technical, no fluff
    - Keep it scannable -- deployers skim, they don't read novels
    - Use code blocks for response shapes and commands
    - The warning box format (> **Warning:**) is appropriate for genuine
      caveats, but do NOT use it for the false "key rotation breaks things"
      message -- that's the whole point of this fix

    ## What NOT to do

    - Do NOT rewrite sections outside Reference (Key Rotation, Public Key
      Endpoint, and the new Key Archive Endpoint)
    - Do NOT add documentation for health endpoint, response headers, staging,
      CORS, or missing secrets -- those are separate tasks
    - Do NOT change the Setup section
    - Do NOT modify any other files

    ## Files to modify

    - `README.md` (lines 214-231, plus new section after line 231)

    ## How to verify

    Read the code at `src/signing.js:73-74`, `src/kv.js:251-263`,
    `src/index.js:438-448`, `src/index.js:528`, `src/index.js:534-551` and
    confirm every claim in the new text matches the implementation.

    ## Deliverables

    Updated Reference section of README.md with accurate Key Rotation, updated
    Public Key Endpoint, and new Key Archive Endpoint documentation.

- **Deliverables**: Rewritten Key Rotation section, updated Public Key Endpoint section, new Key Archive Endpoint section in README.md
- **Success criteria**: Every factual claim in the Reference section matches the current code; no false warnings about key rotation breaking verification

### Task 3: Update README -- missing secrets, staging, response headers, health endpoint, roadmap
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2 (modifies same file, must sequence)
- **Approval gate**: no
- **Prompt**: |
    You are updating several sections of `README.md` in the web-resource-ledger
    project to document features that shipped in recent PRs but were never
    added to the README.

    ## Context

    PRs #54-#57 added: IP hash seed for privacy logging, Coralogix
    integration, CORS support, HSTS preload, X-RateLimit-Limit header, staging
    environment, and smoke tests. The README Setup section only documents
    `CAPTURE_API_KEY` and `SIGNING_KEY`. The README has no mention of staging,
    CORS configuration, the health endpoint, or the new response headers.

    ## What to fix

    **1. Add missing secrets to Setup section (after step 5, before step 6 "Deploy")**

    Add documentation for these secrets/configuration:

    - `IP_HASH_SEED` -- HMAC seed for privacy-safe IP hashing in logs
      (`src/ip-hash.js`). Recommended for abuse correlation. Generate with
      `openssl rand -hex 32`. Set via `wrangler secret put IP_HASH_SEED`.
      Without it, log entries have no IP correlation.

    - `CORALOGIX_SEND_KEY` -- API key for structured log ingestion to Coralogix
      (`src/log.js:24`). Required for production observability. Set via
      `wrangler secret put CORALOGIX_SEND_KEY`. Without it, the worker
      produces no structured logs.

    - `CORS_ORIGINS` -- Optional comma-separated list of allowed origins for
      CORS (`wrangler.toml:46-47`, `src/index.js:30-38`). Only needed if
      browser-based clients will call the API. Set as an environment variable
      in `wrangler.toml`, not a secret.

    Present as a complete secrets/configuration table so deployers can verify
    they have everything. Mark which are required vs recommended vs optional.

    **2. Add staging environment documentation**

    Add a brief "Staging" subsection under Setup or Development:
    - `wrangler.toml` includes an `[env.staging]` configuration
    - Deploy to staging: `wrangler deploy --env staging`
    - Staging auto-deploys on merge to `main` via `deploy-staging.yml`
    - Staging has its own R2 bucket (`wrl-captures-staging`) and KV namespace
    - Secrets must be set separately: `wrangler secret put <NAME> --env staging`
    - Smoke tests: `npm run smoke` (requires `SMOKE_URL` and `SMOKE_API_KEY`
      env vars)

    Keep it brief -- 8-12 lines max. This is a signpost, not a tutorial.

    **3. Add response headers documentation to Reference section**

    Add a "Response Headers" subsection in the Reference section (after the
    signing key sections):
    - `Link: <...TERMS.md>; rel="terms-of-service"` -- present on ALL
      responses (`src/index.js:107`)
    - `X-RateLimit-Limit` -- present on responses from rate-limited endpoints
      (captures, verify, signing-key). Shows the per-minute limit.
    - `Strict-Transport-Security` with `includeSubDomains; preload`
      (`src/index.js:105`). Note for deployers using a custom domain: submit
      to the HSTS preload list.

    **4. Add health endpoint to Reference section**

    Add a brief entry for `GET /health`:
    - Returns `{ status: "ok", legal: { terms: "...", policy: "..." } }`
    - Useful for monitoring and health checks
    - The `legal` URLs point to the Terms of Service and Content Moderation
      Policy

    **5. Update Roadmap section (line 204)**

    Change "Solid Foundation (in progress)" to "(complete)" -- all Act 1 items
    are done per `docs/backlog.md`.

    ## Writing style

    - Match the existing README voice: direct, technical, scannable
    - For the secrets table, use a format consistent with the existing step
      structure (step 4 and step 5 are the model)
    - Keep staging docs minimal -- point to `wrangler.toml` and
      `deploy-staging.yml` for details

    ## What NOT to do

    - Do NOT modify the Key Rotation, Public Key Endpoint, or Key Archive
      Endpoint sections (those were handled in a prior task)
    - Do NOT reorganize the README structure or add new top-level sections
      beyond what's specified
    - Do NOT add a separate "Deployer Guide" or "API Reference" document
    - Do NOT modify openapi.yaml or any code files
    - Do NOT over-expand -- the README should stay scannable. Each new
      subsection should be 5-15 lines

    ## Files to modify

    - `README.md`

    ## Deliverables

    Updated README.md with: complete secrets documentation, staging section,
    response headers reference, health endpoint reference, corrected roadmap.

- **Deliverables**: Updated README.md with missing secrets, staging docs, response headers, health endpoint, corrected roadmap
- **Success criteria**: A deployer following the Setup section can configure all required secrets; staging environment is discoverable; all response headers mentioned in code are documented

### Task 4: Update CONTRIBUTING.md -- staging, secrets, deploy pipeline
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 3 (should align with README staging docs)
- **Approval gate**: no
- **Prompt**: |
    You are updating `CONTRIBUTING.md` in the web-resource-ledger project to
    cover the staging environment and complete the local dev setup instructions.

    ## Context

    CONTRIBUTING.md currently tells contributors to set up `.dev.vars` with
    only `SIGNING_KEY` and `CAPTURE_API_KEY`. The project now has additional
    secrets (`IP_HASH_SEED`, `CORALOGIX_SEND_KEY`) and a full staging
    environment with CI/CD pipeline and smoke tests.

    ## What to fix

    **1. Update the "Full Local Development" section**

    The `.dev.vars` list (line 20) is incomplete. For full local dev with
    observability and CORS, it should mention:
    - `SIGNING_KEY` (existing)
    - `CAPTURE_API_KEY` (existing)
    - `IP_HASH_SEED` (new -- for privacy-safe IP hashing in logs)
    - `CORALOGIX_SEND_KEY` (new -- for structured log ingestion; optional for
      local dev since logs go to console)
    - `CORS_ORIGINS` (new -- optional, only needed when testing browser clients)

    Mark which are required vs optional for local dev.

    **2. Add staging environment and deploy pipeline subsection**

    Add a "Staging & Deployment" subsection (or similar) explaining:
    - Merging to `main` triggers: CI test -> staging deploy -> smoke test
      (the `deploy-staging.yml` workflow)
    - How to deploy to staging manually: `wrangler deploy --env staging`
    - Staging has its own secrets set via `wrangler secret put <NAME> --env staging`
    - How to run smoke tests: `npm run smoke` with `SMOKE_URL` and
      `SMOKE_API_KEY` environment variables
    - What the smoke test validates (health, security headers, signing key,
      capture round-trip)

    Keep it contributor-focused: what do I need to know before I merge?

    ## Writing style

    - Match the existing CONTRIBUTING.md voice: concise, practical, with
      specific gotchas called out
    - The "Running Tests" section with its gotcha bullets is the model for
      tone and detail level

    ## What NOT to do

    - Do NOT rewrite existing sections that are correct
    - Do NOT add contributor workflow changes (branching strategy, PR process)
    - Do NOT modify README.md or any other files
    - Do NOT document the OpenAPI spec-first workflow in detail -- the existing
      `npm run lint:api` mention is sufficient

    ## Files to modify

    - `CONTRIBUTING.md`

    ## Deliverables

    Updated CONTRIBUTING.md with complete `.dev.vars` list and staging/deployment
    guidance.

- **Deliverables**: Updated CONTRIBUTING.md with complete secrets list and staging documentation
- **Success criteria**: A new contributor can set up complete local dev and understands the deploy pipeline before merging

### Task 5: Add status headers to PRODUCT.md and docs/MVP.md
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are adding status headers to two historical documents in the
    web-resource-ledger project to frame them correctly for newcomers.

    ## Context

    PRODUCT.md (repo root) is the original product vision document from the
    planning phase. docs/MVP.md is the implementation plan for the initial
    build (phases 0001-0011). Both documents describe a state that no longer
    reflects reality -- PRODUCT.md describes a full SaaS platform with billing
    and RBAC, MVP.md references Puppeteer and implementation steps that are all
    complete.

    These files are referenced by `docs/backlog.md` (5 references to MVP.md)
    and by evolution log entries (15+ references). They must NOT be moved or
    renamed -- that would break cross-references in historical records.

    ## What to do

    **1. Add status header to PRODUCT.md**

    Add a blockquote at the very top of the file (before the first heading):

    ```markdown
    > **This is the original product vision document.** It describes the full
    > scope of what WRL could become. For what has actually been built, see the
    > [README](README.md). For current priorities, see
    > [docs/backlog.md](docs/backlog.md). For how each feature was implemented,
    > see [docs/evolution/](docs/evolution/).
    ```

    **2. Add status header to docs/MVP.md**

    Add a blockquote at the very top of the file (before the first heading):

    ```markdown
    > **This document is a historical artifact.** It was the implementation
    > plan for WRL's initial build (phases 0001-0011, March 2025). All items
    > are now implemented, deferred to [docs/backlog.md](backlog.md), or
    > explicitly dropped. The document is preserved for traceability -- the
    > evolution log phases reference it.
    ```

    ## What NOT to do

    - Do NOT modify any content in the body of either document
    - Do NOT move or rename either file
    - Do NOT remove the existing inline "Resolved" annotations in MVP.md
    - Do NOT update links in other files
    - Do NOT add status headers to any other files

    ## Files to modify

    - `PRODUCT.md`
    - `docs/MVP.md`

    ## Deliverables

    Both files with status header blockquotes at the top.

- **Deliverables**: Status headers added to PRODUCT.md and docs/MVP.md
- **Success criteria**: A newcomer reading either file immediately understands it's historical and knows where to find current information

---

### Cross-Cutting Coverage

- **Testing**: Not included as execution task. No executable code is being produced -- all changes are documentation and spec files. Phase 6 (post-execution) will run `npm run lint:api` to validate the OpenAPI spec and `npm test` to catch any regressions. Task 1 prompt includes `npm run lint:api` as verification.
- **Security**: Not included as execution task. No attack surface, auth, or secret handling is being created or modified. The Key Rotation rewrite (Task 2) must accurately describe security-relevant behavior -- this is covered by the approval gate and the Phase 5 code review.
- **Usability -- Strategy**: Covered. ux-strategy-minion participated in planning. The PRODUCT.md/MVP.md conflict resolution and the Key Rotation rewrite directly address the cognitive load and trust concerns raised. The status header approach was the resolution.
- **Usability -- Design**: Not included. No user-facing interfaces are being produced -- all changes are prose documentation and YAML spec.
- **Documentation**: This IS the documentation task. software-docs-minion and user-docs-minion are the primary executing agents.
- **Observability**: Not included. No runtime components are being created or modified.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - **api-spec-minion**: Task 1 modifies the API contract source of truth (openapi.yaml) with 13 discrepancy fixes. The spec reviewer should verify the fixes are correct and complete before the approval gate. (Note: api-spec-minion is also the executing agent for Task 1 -- the review pass serves as self-verification against the original audit.)
- **Not selected**: ux-design-minion (no UI), accessibility-minion (no HTML/UI), sitespeed-minion (no web-facing runtime code), observability-minion (no runtime components), user-docs-minion (executing agent, not reviewer)

### Conflict Resolutions

**PRODUCT.md / MVP.md disposition** -- Resolved in favor of software-docs-minion's "keep in place with status headers" approach over ux-strategy-minion's "move to evolution log" approach. Rationale: 20+ cross-references in backlog.md and evolution log entries would break; evolution log is append-only by project convention; status headers address the cognitive load concern without the file-move risk. Full reasoning in the Conflict Resolution section above.

**OPTIONS preflight in OpenAPI spec** -- software-docs-minion recommended NOT adding OPTIONS to the spec ("preflight is a browser transport concern"). api-spec-minion recommended adding it ("clients and mock servers cannot discover the preflight behavior"). Resolved in favor of api-spec-minion: the route handler exists in code, returns specific headers, and is testable behavior. The spec documents what the server does, not just what API consumers call intentionally. Omitting it means contract tests (Schemathesis) will flag it as unexpected.

**openapi.yaml drift assessment** -- user-docs-minion stated "No drift found" in openapi.yaml. api-spec-minion found 13 discrepancies. The specialist audits don't conflict -- user-docs-minion was evaluating from a user documentation perspective (is the spec roughly right?), while api-spec-minion did a line-by-line contract audit. The 13 discrepancies are real and Task 1 addresses them.

### Risks and Mitigations

1. **Key Rotation rewrite could introduce new inaccuracies** -- The current text is actively harmful (says rotation breaks verification). The rewrite must be precise about the one edge case: pre-key-versioning captures. Mitigation: Task 2 has an approval gate, and the prompt specifies exactly which code paths to verify against.

2. **Link header propagation is repetitive** -- Adding the TermsLink header to ~25 response definitions in openapi.yaml is tedious and error-prone. Mitigation: Task 1 prompt is explicit about which components need it. `npm run lint:api` catches structural errors.

3. **README scope expansion** -- Tasks 2-3 add several new subsections. Risk of the README becoming unwieldy. Mitigation: each new subsection is capped at 5-15 lines in the prompt; the overall structure (Setup -> Development -> Roadmap -> Reference) is preserved.

4. **Sequential README edits** -- Tasks 2 and 3 both modify README.md and must run sequentially. If Task 2 requires revision at the approval gate, Task 3 is delayed. Mitigation: Task 2 is surgical (3 subsections in Reference) and unlikely to need major revision.

5. **Example string drift will recur** -- Fixing detail strings in openapi.yaml examples (Task 1, item 10) is a point-in-time fix. Future code changes will cause drift again. Mitigation: recommend adding a Prism contract test to CI as a backlog item (not in scope for this plan).

### Execution Order

```
Batch 1 (parallel):
  Task 1: Fix OpenAPI spec (api-spec-minion)
  Task 2: Rewrite README Reference section (user-docs-minion)  [GATE]
  Task 5: Add status headers to PRODUCT.md and MVP.md (software-docs-minion)

  -- Task 1 APPROVAL GATE --
  -- Task 2 APPROVAL GATE --

Batch 2 (sequential after Task 2 gate clears):
  Task 3: Update README -- missing secrets, staging, headers, health, roadmap (user-docs-minion)

Batch 3 (after Task 3):
  Task 4: Update CONTRIBUTING.md (user-docs-minion)
```

Gate budget: 2 gates (within the 3-5 target). Task 1 gates because the OpenAPI spec is the API contract -- errors propagate to SDK generation and contract tests. Task 2 gates because the Key Rotation section is security-relevant and the current text is actively misleading.

### Verification Steps

After all tasks complete:
1. Run `npm run lint:api` -- OpenAPI spec must pass linting
2. Run `npm test` -- no test regressions
3. Manual review: read the README top-to-bottom as a new user and verify no contradictions with `src/index.js`
4. Verify PRODUCT.md and MVP.md have status headers and no body changes
5. Verify all cross-references in `docs/backlog.md` to `MVP.md` still resolve
6. Verify CONTRIBUTING.md `.dev.vars` list includes all 4 secrets from `deploy-staging.yml`
