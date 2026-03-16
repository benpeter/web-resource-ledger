## Domain Plan Contribution: software-docs-minion

### Recommendations

#### Source-of-truth boundary: README owns secrets, OPERATIONS owns surfaces

The core question is where to draw the line between README.md (developer-facing setup) and OPERATIONS.md (ops-facing runbook). After reading both files and the three GitHub Actions workflows, the answer falls out of the existing structure:

**README.md owns "what secrets exist, how to generate them, how to set them."** Steps 4-8 already do this well. README is the onboarding document -- a fork developer reads it first and follows it sequentially. Every secret has its generation command here and nowhere else.

**OPERATIONS.md owns "where secrets appear across operational surfaces."** It already owns the GitHub environment setup tables. It should additionally own the "secret surfaces" concept (the explanation of Worker runtime vs GitHub CI vs `.dev.vars`), because this is operational knowledge -- it answers "I set the secret but my deploy still fails, why?" which is an ops question, not a setup question.

**CONTRIBUTING.md owns "what you need for local dev."** It already has a `.dev.vars` template. It cross-references README for Cloudflare setup. This file needs no changes for this task.

The linking pattern that avoids staleness:

1. **README.md** lists all secrets with generation commands, one-time `wrangler secret put` instructions, and `.dev.vars` entries. This is the canonical source. Each secret section stays exactly as it is (steps 4-8).

2. **OPERATIONS.md** references README for generation/setup ("see README steps 4-8 for secret generation and initial setup") and then adds the operational layer: the GitHub environment secrets table (mapping `CAPTURE_API_KEY` to `WRL_PROD_CAPTURE_API_KEY` and `WRL_STAGING_CAPTURE_API_KEY`), the "secret surfaces" explanation, the Cloudflare API token permissions, and the "secrets persist across deploys" note.

3. **Cross-reference direction is always OPERATIONS -> README, never the reverse.** README already has a one-liner pointing to OPERATIONS.md. OPERATIONS.md should add specific section anchors when linking back (e.g., `README.md#4-configure-capture-api-key`). This means README is stable -- it rarely needs updating when ops processes change -- and OPERATIONS.md is the document that synthesizes across surfaces.

#### The "secret surfaces" explanation belongs in OPERATIONS.md

Reasoning:

- The three surfaces (Worker runtime, GitHub CI, `.dev.vars`) are operationally distinct. A developer hitting a "missing secret" error during a CD pipeline run needs to understand *which* surface they missed. That is an ops diagnosis, not a setup task.
- README is sequential: "do step 4, then step 5." It should not include a conceptual section that breaks the flow. README readers are setting up for the first time -- they don't yet need to understand the full topology.
- OPERATIONS.md is reference material. Conceptual explanations fit naturally here.
- The explanation should be a short (6-10 line) section near the top of OPERATIONS.md, before the GitHub environment tables, titled something like "Secret Surfaces" or "Where Secrets Live." It should use a three-row table: Surface | Set via | Used by | Persists across deploys?.

#### Cloudflare API token permissions: OPERATIONS.md, as a callout within the GitHub environment tables

The five specific permissions (Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit, Account Settings Read, User Memberships Read) are needed when configuring the `CLOUDFLARE_API_TOKEN` GitHub secret. This is operational setup, not application setup. Put it immediately after the `CLOUDFLARE_API_TOKEN` row in the environment tables, or as a dedicated subsection "Cloudflare API Token Permissions" right below the tables.

#### Staging infrastructure prerequisites: README.md staging section

The README staging section (lines 249-269) currently says "wrangler.toml includes an `[env.staging]` configuration" but does not mention that a fork developer must create the KV namespace and R2 bucket for staging before deploying. The production setup steps (2-3) cover `wrl-kv` and `wrl-captures` but there is no equivalent for `wrl-captures-staging` and the staging KV namespace. This is a documentation gap -- a fork developer will hit a deploy error.

The fix should go in README.md's staging section because it is infrastructure creation (like steps 2-3), not ops configuration. The staging section should list:
- `wrangler kv namespace create KV --env staging` (and updating `wrangler.toml` with the returned ID)
- `wrangler r2 bucket create wrl-captures-staging`

#### Coralogix send key sourcing: README.md step 7

Step 7 already says "CORALOGIX_SEND_KEY is the API key for structured log ingestion to Coralogix" but does not tell a fork developer where to find this key in the Coralogix UI. Add a single sentence: "In Coralogix, find this under Settings > Send Your Data > API Keys." This is setup documentation, so it belongs in README.

#### "Secrets persist across deploys" note: OPERATIONS.md

This is the most subtle and dangerous gap. A developer who sees a failing deploy might think they need to re-set secrets. The note belongs in OPERATIONS.md in the "Secret Surfaces" section and should also appear in the deploy-to-production flow. One sentence: "Worker secrets persist across deploys. The CD pipeline deploys code only -- it does not set or rotate Worker secrets."

### Proposed Tasks

**Task 1: Add "Secret Surfaces" section to OPERATIONS.md**

- Add a new section after the Environments table and before the Monitoring section (or before GitHub Environment Setup -- wherever the logical flow is best)
- Content: a 3-row table (Worker runtime / GitHub CI / Local dev) with columns: Surface, Set via, Used by, Persists across deploys?
- Include the "secrets persist across deploys, CD deploys code only" statement
- Cross-reference README steps 4-8 for generation commands
- Deliverable: Updated OPERATIONS.md with "Secret Surfaces" section
- Dependencies: None

**Task 2: Add Cloudflare API token permissions to OPERATIONS.md**

- Add the five specific permissions immediately after/near the `CLOUDFLARE_API_TOKEN` row in the GitHub environment tables
- Format: bulleted list or table showing the 5 permissions
- Deliverable: Updated OPERATIONS.md with explicit permission list
- Dependencies: None (can be done in parallel with Task 1)

**Task 3: Expand README.md staging section with infrastructure prerequisites**

- Add KV namespace creation command (`wrangler kv namespace create KV --env staging`) with note to update `wrangler.toml`
- Add R2 bucket creation command (`wrangler r2 bucket create wrl-captures-staging`)
- Add a note that staging secrets must be set separately (already partially documented, but tighten the cross-reference to steps 4-7)
- Deliverable: Updated README.md staging section
- Dependencies: None

**Task 4: Add Coralogix send key sourcing to README.md step 7**

- Add one sentence to step 7: where to find the key in Coralogix UI (Settings > Send Your Data > API Keys)
- Deliverable: Updated README.md step 7
- Dependencies: None (can be done in parallel with Task 3)

**Task 5: Replace OPERATIONS.md secret descriptions with README cross-references**

- In the GitHub environment tables, replace inline descriptions for secrets that duplicate README content (e.g., "Ed25519 private key (PKCS8 DER, base64)") with cross-references like "See [README step 5](#5-configure-signing-key)"
- Keep the GitHub-specific secret name mapping (e.g., `WRL_PROD_SIGNING_KEY`) -- this is OPERATIONS.md's unique contribution
- Also update the `CLOUDFLARE_API_TOKEN` description from "Cloudflare API token with Workers deploy permission" to reference the new permissions section
- Deliverable: Updated OPERATIONS.md environment tables with cross-references instead of duplicated descriptions
- Dependencies: Tasks 1, 2 (the sections being referenced must exist first)

**Task 6: Create evolution log phase directory**

- Create `docs/evolution/0025-secrets-env-docs-onboarding/` with `prompt.md`, `decisions.md`, `outcome.md`
- `prompt.md` captures the task briefing
- `decisions.md` captures the source-of-truth boundary decision (README vs OPERATIONS ownership), the rationale for "secret surfaces" placement, and any alternatives considered
- `outcome.md` captures what changed and references today's pipeline fixes as context
- Update `docs/evolution/README.md` index
- Deliverable: Complete evolution log directory
- Dependencies: All other tasks (write outcome.md last)

### Risks and Concerns

**1. Anchor link fragility.** Cross-references from OPERATIONS.md to README.md sections (e.g., `README.md#4-configure-capture-api-key`) break silently when README headings change. Mitigation: use the GitHub-rendered anchor format and test links after editing. There is no automated check for this, so it is a staleness vector. Consider noting this in the evolution log decisions.md as a known tradeoff.

**2. Three-file surface for secrets.** Secrets are now mentioned in README.md (generation/setup), OPERATIONS.md (surfaces/GitHub mapping), and CONTRIBUTING.md (`.dev.vars` template). The task asks for zero duplication between README and OPERATIONS, but CONTRIBUTING.md also has a `.dev.vars` block that partially duplicates README steps 4-7. The task scope does not include CONTRIBUTING.md, but the overlap should be acknowledged. CONTRIBUTING.md's `.dev.vars` template is a different concern (quick-start convenience) and can be justified as a legitimate separate entry point, but if it drifts from README it will confuse contributors.

**3. Placeholder URLs remain.** OPERATIONS.md uses `<YOUR_PRODUCTION_URL>` and `<YOUR_STAGING_URL>` placeholders. The task states "the constraint that URLs remain as placeholders." This is fine, but the "Secret Surfaces" section should not introduce new placeholders. Keep it generic (e.g., "the deployed Worker" rather than a URL).

**4. Scope creep into CONTRIBUTING.md.** The task scope is README.md and OPERATIONS.md. If the implementation team notices CONTRIBUTING.md inconsistencies, they should note them as a follow-up item in outcome.md rather than expanding scope.

**5. The `wrangler.toml` KV ID problem is real but partly out of scope.** The staging KV namespace ID in `wrangler.toml` (line 62) is hardcoded to the project owner's namespace. A fork developer must replace it. README step 2 already says "Update `wrangler.toml` with the returned `id` and `preview_id`" for production, and Task 3 should mirror this instruction for staging. But the `wrangler.toml` file itself has no comment on the staging ID saying "replace this." Consider adding a comment in `wrangler.toml` like `# Replace with output of: wrangler kv namespace create KV --env staging` -- oh wait, that comment already exists at line 61. Good. The README staging section just needs to reference this.

### Additional Agents Needed

None. The current team is sufficient for documentation restructuring. The changes are confined to two Markdown files, an evolution log, and potentially minor `wrangler.toml` comment adjustments. No application code, API design, security review, or infrastructure changes are involved.

One note: if the implementation agent has questions about the exact Cloudflare API token permissions (the five listed in the task), they should verify against the actual Cloudflare dashboard or documentation rather than relying solely on the task spec. The permissions listed in the success criteria look correct for wrangler deploy operations, but a quick verification against the Cloudflare API token creation UI would be prudent. This does not require a separate specialist -- it is a verification step the implementing agent can do.
