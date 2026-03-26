MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Automate the vendored autoconsent update process via a GitHub Action (issue #152). Weekly cron + manual dispatch, version check, npm update, regenerate vendor script, run tests + battery, open PR if tests pass.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nkBysh/autoconsent-update-pipeline/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nkBysh/autoconsent-update-pipeline/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nkBysh/autoconsent-update-pipeline/phase2-test-minion.md

## Key consensus across specialists:
- iac-minion: Use `gh pr create` (no third-party action). Branch naming encodes version. Close stale PRs. `contents: write` + `pull-requests: write` permissions.
- devx-minion: Node ESM script for vendoring, JSON.stringify for escaping. Zero external deps. Add `vendor:autoconsent` npm script.
- test-minion: Two separate jobs (unit blocking, battery advisory). ubuntu-latest sufficient. Battery results in PR body, not blocking.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nkBysh/autoconsent-update-pipeline/phase3-synthesis.md
