MODE: SYNTHESIS
ADVISORY: true

You are synthesizing specialist planning contributions into a
team recommendation. This is an advisory-only orchestration --
no code will be written, no branches created, no PRs opened.

Do NOT produce task prompts, agent assignments, execution order,
approval gates, or delegation plan structure. Produce an advisory
report using the advisory output format defined in your AGENT.md.

## Original Task
Should we create a separate branch, say staging, that deploys to staging when merges happen, and only main deploys to prod?

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jbkVHU/staging-branch-deploy-strategy/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jbkVHU/staging-branch-deploy-strategy/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jbkVHU/staging-branch-deploy-strategy/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jbkVHU/staging-branch-deploy-strategy/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jbkVHU/staging-branch-deploy-strategy/phase2-software-docs-minion.md

## Key consensus across specialists:
- iac-minion: Do not introduce staging branch. Current model already provides staging-before-production safety. Real gap is race condition between deploy workflows.
- devx-minion: Keep current model. Two-branch adds 3-4 steps to ship with drift risk. Cloudflare Workers lack artifact promotion so branch model gives no safety benefit.
- security-minion: Keep current model. Separate branch introduces secret drift, wrong-code-tested, doubled attack surface. Real gap is race condition fixable with commit-hash verification.
- ux-strategy-minion: Solution looking for a problem. No evidence of pain. If "test without shipping" needed, workflow_dispatch already supports it. If strict ordering, workflow_run is the fix.
- software-docs-minion: Single-branch has near-zero docs maintenance. Two-branch doubles explanation surface across 7 locations. Rollback docs must stay in sync with any workflow changes.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Identify consensus and dissent -- preserve minority positions
4. Produce an advisory report with executive summary, team consensus,
   dissenting views, supporting evidence, risks, next steps, and
   conflict resolutions
5. Write your complete advisory synthesis to
   /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jbkVHU/staging-branch-deploy-strategy/phase3-synthesis.md
