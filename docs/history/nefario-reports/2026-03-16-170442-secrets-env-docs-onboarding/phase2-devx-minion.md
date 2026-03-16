# Domain Plan Contribution: devx-minion

## Audit: Current State vs. Fork-Ready Onboarding

I traced the complete path a forking developer must follow to get both pipelines green. Here is what exists, what is missing, and where the developer gets stuck.

### What is documented today

| Step | Where | Status |
|------|-------|--------|
| Install deps | README step 1 | Complete |
| Create KV namespace (production) | README step 2 | Complete -- includes wrangler command and "update wrangler.toml" instruction |
| Create R2 bucket (production + preview) | README step 3 | Complete |
| Generate CAPTURE_API_KEY | README step 4 | Complete -- generation command, wrangler secret put, .dev.vars |
| Generate SIGNING_KEY | README step 5 | Complete -- script, wrangler secret put, .dev.vars |
| Generate IP_HASH_SEED | README step 6 | Complete -- generation command, wrangler secret put, .dev.vars |
| Coralogix send key | README step 7 | **Partial** -- says "the API key for structured log ingestion" but does not say where to find it in the Coralogix UI |
| Deploy production | README step 9 | Complete |
| GitHub environment secrets table | OPERATIONS.md lines 110-149 | Complete table layout, but descriptions are vague ("Cloudflare API token with Workers deploy permission") |
| Rollback and secrets caveat | OPERATIONS.md lines 39-85 | Complete |
| Staging deploy command | README staging section | Complete |
| Staging secrets | README staging section + CONTRIBUTING.md | Complete -- `wrangler secret put ... --env staging` commands listed |

### What is missing (the gaps that block a forking developer)

**Gap 1: Staging infrastructure creation is undocumented.** README step 2 says `wrangler kv namespace create wrl-kv` for production. The staging section says `wrangler.toml includes an [env.staging] configuration with its own R2 bucket and KV namespace` but never tells the developer to *create* `wrl-captures-staging` (R2) or the staging KV namespace. The `env.staging` block in `wrangler.toml` has a hardcoded KV ID (`ed564f8e...`) from the original author's account -- a forking developer must create their own namespace and replace this ID. This is the single biggest blocker. The developer reads "staging auto-deploys on merge to main" and then the deploy fails because the KV namespace does not exist in their account.

**Gap 2: Cloudflare API token permissions are unspecified.** OPERATIONS.md says "Cloudflare API token with Workers deploy permission" -- this is not actionable. The Cloudflare dashboard has dozens of permission options. The security-minion analysis in the CD pipeline phase identified the minimum permissions (Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit, Account Settings Read, User Memberships Read) but this was never promoted to the documentation. A developer creating a Cloudflare API token will either use the overly-broad "Edit Cloudflare Workers" template (bad) or spend 20 minutes guessing which permissions to select (worse).

**Gap 3: "Secret surfaces" are never explained.** WRL has three distinct places where secrets exist, and they serve different purposes:
1. **Cloudflare Worker secrets** (set via `wrangler secret put`) -- runtime values the Worker reads at execution time. These persist across deploys.
2. **GitHub environment secrets** (set in repo Settings > Environments) -- used by CI/CD workflows for authentication and smoke tests. The workflow reads `CLOUDFLARE_API_TOKEN` to authenticate with wrangler, and `WRL_STAGING_CAPTURE_API_KEY` to run smoke tests.
3. **`.dev.vars`** -- local dev overrides, never deployed anywhere.

A forking developer does not understand why they need to set `CAPTURE_API_KEY` both via `wrangler secret put` AND as `WRL_STAGING_CAPTURE_API_KEY` in GitHub. They look like the same value set twice (and they ARE the same value set twice) but for different reasons. Without this explanation, the developer either skips one surface or does not understand why both are needed.

**Gap 4: Worker secrets persist across deploys (and the CD pipeline does NOT push them).** I verified this directly: neither `deploy-staging.yml` nor `deploy-production.yml` use wrangler-action's `secrets:` block. The workflows deploy code only. Worker secrets are set once via `wrangler secret put` and survive all subsequent deploys. This is the mental model gap that caused the pipeline fix session today -- the developer must understand that secret setup is a one-time bootstrapping step, not part of the deploy cycle. OPERATIONS.md hints at this in the rollback section ("Secrets are NOT rolled back with code") but never states it as a general principle.

**Gap 5: Coralogix send key sourcing.** README step 7 tells you to run `wrangler secret put CORALOGIX_SEND_KEY` but does not say where to get the value. For all other secrets, README provides a generation command (`openssl rand`, `node scripts/generate-signing-key.js`). CORALOGIX_SEND_KEY is the only secret that must be obtained from an external service, and the path (Coralogix > Settings > Send Your Data > API Keys) is not documented.

**Gap 6: The two GitHub environments are not linked to their wrangler.toml equivalents.** OPERATIONS.md documents `production` and `staging` environments with their secret tables, but does not explain that the `production` environment maps to the top-level wrangler.toml config (deployed with plain `wrangler deploy`) and the `staging` environment maps to `[env.staging]` (deployed with `wrangler deploy --env staging`). This mapping is obvious to the author but invisible to a forker.

**Gap 7: No "bootstrap vs. steady-state" distinction.** README steps 2-7 are bootstrapping steps (done once per fork). Step 9 is the steady-state deploy. The CD pipeline handles steady-state after initial setup. But this is never framed that way -- the developer reads a flat list of steps and does not know which ones are one-time vs. ongoing.

### Ordering that minimizes back-and-forth

The current README ordering (steps 1-9) is almost right for production bootstrapping. The problems are:
1. Staging bootstrapping is invisible
2. GitHub environment setup (the CD pipeline prerequisite) is in OPERATIONS.md, disconnected from the bootstrapping flow
3. The "what do I do after initial setup?" transition is missing

The optimal information path for a forking developer:

```
Phase A: Prerequisites (already documented in README)
  - Wrangler CLI, Node.js, Cloudflare account

Phase B: Infrastructure (per-environment, once per fork)
  B1. Create production KV namespace --> update wrangler.toml id
  B2. Create production R2 bucket + preview bucket
  B3. Create staging KV namespace   --> update wrangler.toml env.staging id
  B4. Create staging R2 bucket
  (Gap: B3 and B4 do not exist in docs today)

Phase C: Secrets (per-environment, once per fork)
  C1. Generate CAPTURE_API_KEY (openssl rand)
  C2. Generate SIGNING_KEY (node scripts/generate-signing-key.js)
  C3. Generate IP_HASH_SEED (openssl rand)
  C4. Obtain CORALOGIX_SEND_KEY (Coralogix Settings > Send Your Data > API Keys)
  C5. Set production Worker secrets (wrangler secret put ...)
  C6. Set staging Worker secrets (wrangler secret put ... --env staging)
  C7. Set .dev.vars for local development
  (Gap: C4 sourcing path not documented)

Phase D: CD Pipeline Setup (once per fork)
  D1. Create Cloudflare API token with specific permissions
  D2. Create GitHub production environment with secrets
  D3. Create GitHub staging environment with secrets
  D4. Set protection rules (reviewer for production, none for staging)
  (Gap: D1 permissions are vague, D2/D3 cross-reference to secret values in C is unclear)

Phase E: Verify
  E1. wrangler deploy --env staging (manual first deploy)
  E2. Run smoke test against staging
  E3. Push to main -- staging auto-deploys
  E4. Approve production deploy
  (Gap: E1-E4 not documented as a verification sequence)
```

## Recommendations

### 1. Cloudflare API token permissions: use a checklist, not prose

The Cloudflare dashboard presents permissions as a form with dropdowns. The developer is staring at the dashboard while reading the docs. A checklist maps directly to what they see on screen:

```
Required Cloudflare API token permissions:
- Account > Workers Scripts > Edit
- Account > Workers KV Storage > Edit
- Account > Workers R2 Storage > Edit
- Account > Account Settings > Read
- User > User Details > Read
```

Prose ("create a token with Workers deploy permission") fails because it does not match the UI vocabulary. The developer sees "Workers Scripts" in the dropdown, not "Workers deploy permission." Match the docs to the dashboard labels exactly.

This checklist belongs in OPERATIONS.md (in the GitHub Environment Setup section) because it is part of the CD pipeline setup, not the local dev setup.

### 2. Add "secret surfaces" as a concept, once, in README

README already owns the secret lifecycle (generation, storage, local dev). It should own the mental model too. A short section (5-8 lines) after the current step 7 (before Deploy) explaining:

- **Worker secrets** (`wrangler secret put`): runtime values, persist across deploys, set once per environment
- **GitHub environment secrets**: CI/CD workflow authentication, different names than Worker secrets, same underlying values
- **.dev.vars**: local dev only, never deployed

Then OPERATIONS.md's GitHub Environment Setup tables cross-reference README for secret generation ("generate with the command in README step 4") rather than explaining what the secret is.

### 3. Expand README staging section with infrastructure creation steps

The staging section currently assumes infrastructure exists. Add the missing wrangler commands:

```bash
# Create staging KV namespace
wrangler kv namespace create KV --env staging
# Copy the returned id into wrangler.toml [env.staging.kv_namespaces] id field

# Create staging R2 bucket
wrangler r2 bucket create wrl-captures-staging
```

This is 4 lines of content. The developer's time savings: potentially hours of debugging a failed deploy.

### 4. Add Coralogix send key sourcing path

In README step 7, add one line: "Find your send key in the Coralogix dashboard: Settings > Send Your Data > API Keys."

### 5. Frame bootstrapping vs. steady-state explicitly

After the current step 9 (Deploy), add a brief "What happens next" note:

> Steps 1-8 are one-time setup. After initial deployment, the CD pipeline handles staging and production deploys automatically on push to main. See OPERATIONS.md for the deploy flow and rollback procedures.

This bridges the README (bootstrapping) to OPERATIONS.md (steady-state) and tells the developer they are done with setup.

### 6. Document the "CD pipeline deploys code only" principle

In OPERATIONS.md, at the top of the GitHub Environment Setup section, state clearly:

> The CD pipeline deploys code only. Worker secrets (CAPTURE_API_KEY, SIGNING_KEY, etc.) are set once via `wrangler secret put` and persist across all subsequent deploys. You do not need to re-set secrets after each deploy.

This is the most common source of confusion. It should appear before the environment tables, not buried in the rollback section.

## Proposed Tasks

### Task 1: Expand README.md staging section with infrastructure creation

**What**: Add wrangler commands for creating the staging KV namespace and R2 bucket. Note that the KV ID in wrangler.toml must be replaced with the developer's own namespace ID.

**Deliverables**: Updated README.md staging section (approximately 10 new lines).

**Dependencies**: None. This can be written independently.

### Task 2: Add Coralogix send key sourcing to README step 7

**What**: Add "Find your send key in the Coralogix dashboard: Settings > Send Your Data > API Keys" to the existing step 7.

**Deliverables**: One added sentence in README.md.

**Dependencies**: None.

### Task 3: Add "secret surfaces" explanation to README

**What**: After the existing secret setup steps and before the Deploy step, add a short explanation of the three places secrets live and why. This becomes the canonical reference that OPERATIONS.md points to.

**Deliverables**: New subsection in README.md (approximately 10-15 lines).

**Dependencies**: Must be written before Task 5 (OPERATIONS.md cross-references depend on this section existing).

### Task 4: Add Cloudflare API token permission checklist to OPERATIONS.md

**What**: Replace "Cloudflare API token with Workers deploy permission" with the specific 5-permission checklist using exact Cloudflare dashboard labels.

**Deliverables**: Updated permission descriptions in both the production and staging environment secret tables in OPERATIONS.md.

**Dependencies**: None.

### Task 5: Add "CD pipeline deploys code only" explanation to OPERATIONS.md

**What**: Add a brief (3-4 line) explanation at the top of the GitHub Environment Setup section stating that Worker secrets persist across deploys and the pipeline only deploys code. Cross-reference README for secret generation commands rather than duplicating them.

**Deliverables**: Updated OPERATIONS.md GitHub Environment Setup section.

**Dependencies**: Task 3 must be complete (the cross-reference target must exist).

### Task 6: Add "What happens next" bridging note to README

**What**: After step 9 (Deploy), add a 2-3 line note framing steps 1-8 as one-time bootstrapping and pointing to OPERATIONS.md for steady-state operations.

**Deliverables**: Small addition to README.md after the Deploy section.

**Dependencies**: None.

### Task 7: Evolution log phase 0025

**What**: Create `docs/evolution/0025-secrets-env-docs/` with prompt.md, decisions.md, and outcome.md. Reference today's pipeline fix session as the triggering context. Update `docs/evolution/README.md` index.

**Deliverables**: Evolution log directory with three files, updated index.

**Dependencies**: All other tasks complete (outcome.md documents what was produced).

### Recommended execution grouping

Tasks 1, 2, 4, and 6 are independent and can be done in parallel (or by a single agent in sequence). Task 3 must precede Task 5. Task 7 is last. This gives two batches:

- **Batch 1**: Tasks 1, 2, 3, 4, 6 (all README and OPERATIONS edits)
- **Batch 2**: Task 5 (OPERATIONS cross-references, depends on Task 3)
- **Batch 3**: Task 7 (evolution log, depends on all content being final)

In practice, a single agent can do Batch 1 and 2 together since Tasks 3 and 5 can be sequenced within the same editing session. The real constraint is that the evolution log comes last.

## Risks and Concerns

### Risk 1: README length creep

README.md is already 360 lines. Adding staging infrastructure, secret surfaces, and a bridging note adds approximately 25-30 lines. This is acceptable -- the content is essential for the primary use case (forking and deploying). However, the README should not become an operations manual. The boundary must be clear: README owns bootstrapping (one-time setup), OPERATIONS.md owns steady-state (deploy, rollback, monitoring).

### Risk 2: wrangler.toml contains hardcoded KV IDs that will break on fork

The production KV ID (`b5cd6168cd32485dba7a90558e5fad29`) and staging KV ID (`ed564f8e8f4d4133aaee779e7f9e61cb`) in wrangler.toml are specific to the original author's Cloudflare account. A forking developer must replace these, but the current docs only mention this for production (README step 2: "Update wrangler.toml with the returned id and preview_id"). The staging section must say the same thing explicitly. Missing this causes a runtime error that is not obvious from the error message (KV namespace not found in the developer's account).

### Risk 3: The two CLOUDFLARE_API_TOKEN secrets (same name, different environments) may confuse

OPERATIONS.md shows `CLOUDFLARE_API_TOKEN` in both the production and staging tables. This is correct -- GitHub environment scoping means they can have the same name with different values. But a developer who is new to GitHub environments might think they are the same secret. The documentation should state explicitly: "Each environment has its own `CLOUDFLARE_API_TOKEN`. Create separate Cloudflare API tokens for staging and production."

### Risk 4: Coralogix is optional, but this is not obvious in the CD pipeline context

README step 7 says CORALOGIX_SEND_KEY is "required for production observability" but the Worker runs fine without it (logs go to console only). OPERATIONS.md lists `WRL_PROD_CORALOGIX_SEND_KEY` as a required GitHub secret. A forking developer who does not have Coralogix might think the pipeline will fail without it. Clarify that the Worker starts and functions without CORALOGIX_SEND_KEY -- you just get no structured logs. The GitHub secret can be set to an empty string or omitted if you do not use Coralogix.

### Risk 5: Browser Rendering prerequisite is easy to miss

README prerequisites say "Cloudflare account with R2 and Browser Rendering enabled" but Browser Rendering requires a Workers Paid plan and explicit opt-in. This is already documented, but it is the kind of prerequisite that a developer discovers only after everything else is set up and the first capture fails. Consider making it more prominent (bold or a callout).

## Additional Agents Needed

None. The current team (software-docs-minion for structure, devx-minion for onboarding flow, ux-strategy-minion for cognitive load) covers this documentation-only task. Security-minion should review the final plan in Phase 3.5 to verify no sensitive values are accidentally included in the documentation, but this is already anticipated in the metaplan.
