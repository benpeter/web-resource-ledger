Fix secrets and environment setup documentation for fork-ready onboarding

**Outcome**: A developer forking WRL can get both staging and production CD pipelines running by following README.md and OPERATIONS.md alone, without needing to reverse-engineer which secrets go where, what Cloudflare token permissions are required, or what infrastructure must pre-exist. This closes documentation gaps exposed during the pipeline fix session on 2026-03-16.

**Success criteria**:
- OPERATIONS.md lists the 5 specific Cloudflare API token permissions (Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit, Account Settings Read, User Memberships Read)
- OPERATIONS.md explains that Worker secrets persist across deploys and the CD pipeline only deploys code
- A "secret surfaces" explanation exists (once, in one file, cross-referenced from the other) covering: Cloudflare Worker secrets (runtime), GitHub environment secrets (CI), `.dev.vars` (local dev)
- README.md staging section documents KV namespace creation, R2 bucket creation, and wrangler.toml KV ID requirement
- Coralogix send key sourcing is documented (Settings > Send Your Data > API Keys)
- OPERATIONS.md environment setup tables link to README secret generation commands rather than duplicating them
- No content duplication between README.md and OPERATIONS.md — one is source of truth, the other cross-references
- Evolution log phase references today's pipeline fixes as context

**Scope**:
- In: README.md setup/staging sections, OPERATIONS.md environment setup section, evolution log entry for this phase
- Out: Code changes, workflow changes, wrangler.toml changes, new documentation files, CI pipeline modifications

**Constraints**:
- URLs in OPERATIONS.md remain as placeholders (they are correctly fork-dependent)
- Assume the reader knows Cloudflare Workers basics — document WRL-specific setup, not Workers 101
