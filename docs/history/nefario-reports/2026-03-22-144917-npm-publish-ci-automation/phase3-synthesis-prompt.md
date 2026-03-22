MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
**Outcome**: The @w-r-l/verify npm package is published automatically via CI on tag push, with version bump tooling and changelog generation. Manual npm publish is no longer needed.

**Success criteria**:
- GitHub Actions workflow triggers on `v*` tag push to the `verify/` directory
- Workflow runs tests, builds, and publishes to npm under the @w-r-l org
- npm publish uses a scoped automation token stored as a GitHub Actions secret
- Version bump script updates package.json version and creates a git tag in one command
- CHANGELOG.md is generated from conventional commits (or a lightweight equivalent) covering changes since last tag
- Publishing a pre-existing version fails gracefully (no broken CI state)
- The existing v0.1.0 package on npm is unaffected

**Constraints**:
- npm org @w-r-l already exists; package @w-r-l/verify is already published at v0.1.0
- Workflow must not publish on every push to main -- only on explicit tag push
- The verify tool lives in `packages/verify/` subdirectory; workflow should only trigger for changes in that path

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-g11yDo/npm-publish-ci-automation/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-g11yDo/npm-publish-ci-automation/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-g11yDo/npm-publish-ci-automation/phase2-security-minion.md

## Key consensus across specialists:

### Summary: iac-minion
Phase: planning
Recommendation: Use `verify/v*` tag prefix for monorepo-scoped triggers; automation token with `--provenance`; EPUBLISHCONFLICT handling for graceful duplicate version failure.
Tasks: 5 -- Create publish-verify.yml; Create version bump script; Provision npm token; Changelog generation; Dry-run verification
Risks: Tag-version mismatch (high); npm token scope & 2FA (medium)
Conflicts: Recommends automation token, security-minion recommends OIDC

### Summary: devx-minion
Phase: planning
Recommendation: Use `npm version` with `.npmrc` tag prefix instead of custom script; simple git-log-based changelog at scripts/changelog-verify.sh; keep bump and changelog separate.
Tasks: 6 -- Create .npmrc with tag prefix; Create changelog-verify.sh; Create initial CHANGELOG.md; Create retroactive verify/v0.1.0 tag; Optional root npm script; Document release process
Risks: npm version commit message (low); no existing tag for first run (mitigated by retroactive tag)
Conflicts: none

### Summary: security-minion
Phase: planning
Recommendation: Use OIDC Trusted Publishing (no npm token); pin npm to 11.5.1; do not set NODE_AUTH_TOKEN; version-tag check mandatory.
Tasks: 3 -- Configure trusted publisher on npmjs.com; Verify package.json repo URL; Security review of workflow
Risks: npm 10.x in Node 22 needs upgrade for OIDC (high); npm account compromise (medium)
Conflicts: Recommends OIDC over automation token, disagreeing with iac-minion

## KEY CONFLICT TO RESOLVE

iac-minion recommends automation token (battle-tested, no npm version dependency, success criteria literally says "automation token"). security-minion strongly recommends OIDC Trusted Publishing (no secret to manage, superior supply chain security, but requires npm 11.5.1+ upgrade in CI).

Note that the issue success criteria say "npm publish uses a scoped automation token stored as a GitHub Actions secret" — this explicitly requests a token-based approach. However, this may have been written before OIDC was widely available. The synthesis should weigh both approaches and decide.

## IMPORTANT CONSTRAINT

The issue says the verify tool lives at `verify/` but the actual path is `packages/verify/`. Use `packages/verify/` throughout the plan.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve the automation token vs OIDC conflict
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-g11yDo/npm-publish-ci-automation/phase3-synthesis.md
