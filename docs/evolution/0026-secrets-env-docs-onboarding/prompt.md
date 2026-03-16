Fix secrets and environment setup documentation for fork-ready onboarding.

**Goal**: A developer forking WRL can get both staging and production CD pipelines running by following README.md and OPERATIONS.md alone.

**Triggered by**: The 2026-03-16 CD pipeline fix session (phase 0024). During that session, the team discovered that a forking developer could not get pipelines running because:

- Staging infrastructure creation was undocumented -- the staging KV namespace and R2 bucket creation commands existed in README but were buried and not clearly framed as a prerequisite for CD
- Cloudflare API token permissions were vague -- OPERATIONS.md mentioned a token was needed but did not specify which permissions to grant
- The three "secret surfaces" (Worker runtime, GitHub CI, local dev) were never explained -- a fork developer would not know that `wrangler secret put` and GitHub environment secrets are separate concerns, or that Worker secrets persist across deploys
- The CD pipeline's code-only-deploy behavior was not documented as a general principle -- developers may expect the pipeline to re-set secrets or treat each deploy as a fresh environment

**Success criteria**:

1. A fork developer following README.md and OPERATIONS.md in sequence can create staging infrastructure, configure all three secret surfaces, and get the CD pipeline running without external help.
2. The Cloudflare API token section lists exact permissions required (no vague references to templates).
3. The secret surfaces section explains all three surfaces, what each is for, and cross-references README for generation commands.
4. The code-only-deploy principle is stated explicitly so developers do not expect the pipeline to manage Worker runtime secrets.
5. No information is duplicated -- generation commands live in README, operational topology lives in OPERATIONS.
