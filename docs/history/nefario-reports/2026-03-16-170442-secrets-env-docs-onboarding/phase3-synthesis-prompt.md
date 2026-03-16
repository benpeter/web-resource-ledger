MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
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

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-k31WEo/secrets-env-docs-onboarding/phase2-software-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-k31WEo/secrets-env-docs-onboarding/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-k31WEo/secrets-env-docs-onboarding/phase2-ux-strategy-minion.md

## Key consensus across specialists:
## Summary: software-docs-minion
Phase: planning
Recommendation: README owns secret definitions/generation ("what and how"); OPERATIONS owns operational topology and surface mapping ("where and why"). Cross-references flow OPERATIONS→README. "Secret surfaces" lives in OPERATIONS.
Tasks: 6 -- content structure decision; README staging expansion; OPERATIONS token permissions; OPERATIONS secret surfaces; cross-references; evolution log
Risks: Anchor link fragility between files; CONTRIBUTING.md overlap with .dev.vars template
Conflicts: none
Full output: phase2-software-docs-minion.md

## Summary: devx-minion
Phase: planning
Recommendation: README owns bootstrapping (one-time setup, secret generation); OPERATIONS owns steady-state (CD, rollback, GitHub environments). "Secret surfaces" goes in README with OPERATIONS cross-referencing it. Biggest gap is staging infrastructure creation being completely undocumented.
Tasks: 7 -- staging infrastructure docs; Cloudflare permissions checklist; secret surfaces explanation; CD-deploys-code-only principle; Coralogix sourcing; cross-references; evolution log
Risks: Staging KV ID placeholder is the #1 blocker for forking developers
Conflicts: Disagrees with software-docs on where "secret surfaces" should live (README vs OPERATIONS)
Full output: phase2-devx-minion.md

## Summary: ux-strategy-minion
Phase: planning
Recommendation: Missing "three surfaces" mental model is the highest-severity issue. Add a fork setup checklist. Document staging infrastructure, Cloudflare permissions, and CD pipeline scope. GitHub secret naming convention needs explanation.
Tasks: 7 -- surfaces explanation; fork checklist; permissions list; staging docs; Coralogix guidance; cross-references; CD pipeline scope note
Risks: Operators will assume CD manages Worker secrets (contradicts most CI/CD systems); wrangler.toml hardcoded KV IDs need fork-warning comments
Conflicts: none
Full output: phase2-ux-strategy-minion.md

## Key conflict to resolve
software-docs-minion says "secret surfaces" belongs in OPERATIONS.md; devx-minion says it belongs in README.md. ux-strategy-minion did not take a firm position.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-k31WEo/secrets-env-docs-onboarding/phase3-synthesis.md
