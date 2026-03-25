# Domain Plan Contribution: iac-minion

## Recommendations

### 1. Version Synchronization Strategy: Single Source of Truth

**package.json is the single source of truth for the version number.** The deploy pipeline already reads it (`jq -r .version package.json`) and injects it as `BUILD_VERSION`. The CI check should verify that openapi.yaml's `info.version` matches package.json's `version`, and that git tags stay consistent. This avoids introducing a third authority.

The coupling chain:

```
package.json .version  <-- source of truth (what gets deployed as BUILD_VERSION)
openapi.yaml info.version  <-- must match package.json (CI-enforced)
git tag v{version}  <-- must exist for the version in package.json on main (CI-enforced at tag/release time, not on every PR)
```

**Why not openapi.yaml as source?** The deploy pipeline already uses package.json. Changing the source would require modifying both deploy-staging.yml and deploy-production.yml, and YAML parsing is heavier than `jq -r .version`. Keep the existing plumbing.

**Why not enforce tag existence on every PR?** During development, the version in package.json/openapi.yaml may be bumped in a PR before the tag exists. The tag is created after merge. CI should enforce version-file consistency (package.json == openapi.yaml) on every PR, and enforce tag-version consistency only at release time.

### 2. CI Enforcement: Shell Script Step in Existing Test Job

Add a single shell step to the existing `test` job in ci.yml, right after the checkout step and before the code-change gate. This check should run on **every PR** including docs-only changes, because version files are neither code nor docs -- they are metadata that must always be consistent.

The check is a simple shell comparison:

```bash
# scripts/check-version-sync.sh
#!/usr/bin/env bash
set -euo pipefail

PKG_VERSION=$(jq -r .version package.json)
API_VERSION=$(grep -m1 '^  version:' openapi.yaml | awk '{print $2}')

if [ "$PKG_VERSION" != "$API_VERSION" ]; then
  echo "::error::Version mismatch: package.json=$PKG_VERSION, openapi.yaml=$API_VERSION"
  exit 1
fi

echo "Versions in sync: $PKG_VERSION"
```

**Why a shell script, not a dedicated job or reusable action?**
- It runs in <1 second. A separate job would add ~30s of runner startup for a sub-second check.
- It has zero dependencies (jq is preinstalled on ubuntu-latest, grep/awk are universal).
- A reusable action is overkill for a single-repo check with no cross-repo consumers.
- Keeping it in `scripts/` makes it runnable locally too.

**Why not skip it behind the code-change gate?** Version file changes (package.json, openapi.yaml) are not purely docs and not purely code. The version sync check must run unconditionally. Place it before the code-change gate in the step sequence.

### 3. CHANGELOG.md Enforcement: CI Lint Step

Add a CI step that checks whether CHANGELOG.md was modified in PRs that change API behavior. This is a heuristic check, not a hard gate -- there will be PRs that touch code but don't affect the API (refactors, test-only changes). The check should warn, not fail.

Approach: a step that runs on PRs only, checks if files in `src/` or `openapi.yaml` were modified, and if so, verifies CHANGELOG.md is also in the diff. If not, it posts an annotation warning (not an error):

```bash
# In ci.yml, after version-sync check
- name: Check changelog updated
  if: github.event_name == 'pull_request'
  run: |
    BASE_REF="${{ github.event.pull_request.base.sha }}"
    CHANGED=$(git diff --name-only "$BASE_REF"...HEAD)
    if echo "$CHANGED" | grep -qE '^(src/|openapi\.yaml)'; then
      if ! echo "$CHANGED" | grep -q '^CHANGELOG.md'; then
        echo "::warning::API-affecting files changed but CHANGELOG.md was not updated. If this PR changes API behavior, please update the changelog."
      fi
    fi
```

**Why a warning, not a failure?** Many PRs touch `src/` without affecting the API (refactors, internal improvements, test infrastructure). A hard failure would create friction and false positives. The PR template checklist (below) is the primary enforcement; CI is the safety net reminder.

### 4. PR Template

Create `.github/pull_request_template.md` with a lightweight checklist. This is the primary mechanism for CHANGELOG enforcement -- it relies on human judgment (which PRs affect the API) rather than brittle file-change heuristics.

```markdown
## Changes

<!-- Brief description of what this PR does -->

## Checklist

- [ ] Tests pass (`npm test`)
- [ ] API spec updated if endpoints changed (`openapi.yaml`)
- [ ] CHANGELOG.md updated if API behavior changed
- [ ] Version bumped in package.json and openapi.yaml if releasing
```

Keep it minimal. A long template gets ignored.

### 5. Git Tag Workflow: Manual Annotated Tags via CLI

Tags should be created manually via `git tag -a` on main after the version-bump PR is merged. Not automated on every merge (most merges are not releases). Not via GitHub Release UI (that creates lightweight tags by default and adds ceremony that is not needed for a single-maintainer project).

The workflow:

1. Developer bumps version in package.json and openapi.yaml in a PR.
2. PR updates CHANGELOG.md with the new version section.
3. CI verifies version sync (package.json == openapi.yaml).
4. PR merges to main.
5. Developer creates annotated tag on main:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0 -- API stability commitment"
   git push origin v1.0.0
   ```
6. Optionally, create a GitHub Release from the tag (can be done later, provides a nice UI for the changelog).

**Why not automate tag creation on merge?** Not every merge to main is a release. Automating this requires a merge-time signal (e.g., a label, or detecting version changes in the merge commit), which adds complexity for a workflow that happens infrequently. Manual tagging is simple, explicit, and appropriate for the current project scale.

**Why annotated tags, not lightweight?** Annotated tags store the tagger, date, and message. They show up in `git describe`, they are what `git push --follow-tags` pushes, and they are the convention for release tags. Lightweight tags are for bookmarks, not releases.

### 6. No Pre-Commit Hooks

Do not add pre-commit hooks for version checking. Reasons:

- The project has no pre-commit hook infrastructure (no husky, no lefthook, no .git/hooks).
- Adding hook infrastructure is a separate concern and adds a dev dependency.
- Pre-commit hooks run on every commit, but version sync only matters at PR/merge time.
- CI is the single enforcement point -- it cannot be bypassed (unlike local hooks which can be skipped with `--no-verify`).

If the team grows and hook infrastructure is added for other reasons (linting, formatting), the version check can be added at that time. Do not add infrastructure for a single check.

### 7. Deploy Pipeline Adjustments

The existing deploy pipelines (deploy-staging.yml, deploy-production.yml) already inject `BUILD_VERSION` from package.json. No changes are needed to the deploy pipelines for the version synchronization to work. The version that gets deployed as `BUILD_VERSION` will naturally match the openapi.yaml version because CI enforces they are the same.

One consideration: the `WRL-API-Version` response header (to be implemented in src/index.js) should read from the same `BUILD_VERSION` define that the health endpoint already uses, not hardcode a version string. This keeps runtime behavior consistent with the deploy pipeline.

## Proposed Tasks

### Task 1: Create version-sync check script
- **What**: Create `scripts/check-version-sync.sh` that compares package.json version to openapi.yaml version and exits non-zero on mismatch.
- **Deliverables**: `scripts/check-version-sync.sh` (executable, with shellcheck-clean bash)
- **Dependencies**: None. Can be done first.

### Task 2: Add version-sync step to ci.yml
- **What**: Add a step to the `test` job in `.github/workflows/ci.yml` that runs `scripts/check-version-sync.sh`. Place it after checkout, before the code-change gate. It must run unconditionally (no `if: steps.changes.outputs.code == 'true'` guard).
- **Deliverables**: Updated ci.yml
- **Dependencies**: Task 1

### Task 3: Add changelog-update warning to ci.yml
- **What**: Add a step to the `test` job that warns (via `::warning::`) when src/ or openapi.yaml changes are present without a CHANGELOG.md change. PR-only (gated on `github.event_name == 'pull_request'`).
- **Deliverables**: Updated ci.yml
- **Dependencies**: None (can parallel with Task 1-2)

### Task 4: Create PR template
- **What**: Create `.github/pull_request_template.md` with the minimal checklist (tests, API spec, changelog, version bump).
- **Deliverables**: `.github/pull_request_template.md`
- **Dependencies**: None

### Task 5: Bump package.json version to 1.0.0
- **What**: Update package.json `version` field from `0.1.0` to `1.0.0`. This is the source-of-truth version bump. openapi.yaml version bump (from 0.8.0 to 1.0.0) is handled by api-spec-minion.
- **Deliverables**: Updated package.json
- **Dependencies**: api-design-minion confirms version coupling decision (package.json == openapi.yaml)

### Task 6: Create annotated v1.0.0 tag
- **What**: After the version-bump PR merges, create annotated tag `v1.0.0` on main with message "Release v1.0.0 -- API stability commitment" and push to origin.
- **Deliverables**: Git tag `v1.0.0` on remote
- **Dependencies**: All other tasks merged. This is the final step.

### Task 7: WRL-API-Version header uses BUILD_VERSION
- **What**: The `WRL-API-Version` response header implementation (in src/index.js, near the existing header block at lines 614-619) must use the `BUILD_VERSION` define, not a hardcoded string. This means it needs the same `typeof BUILD_VERSION !== 'undefined'` guard pattern used by the health endpoint, with a fallback value (e.g., `'dev'`) for local development where defines are not injected.
- **Deliverables**: Implementation guidance for the executing agent. The actual code change is not iac-minion's deliverable, but the constraint must be documented: use the compile-time define, not a hardcoded version string.
- **Dependencies**: api-design-minion confirms the header name and value format.

## Risks and Concerns

### Risk 1: Version Divergence During Development

**Scenario**: A developer bumps openapi.yaml but forgets package.json (or vice versa). CI catches it on the PR, but the error message must be clear enough that the fix is obvious.

**Mitigation**: The check script's error message explicitly names both files and their values. The PR template checklist reminds developers to bump both.

### Risk 2: Tag-Version Mismatch

**Scenario**: Version is bumped to 1.1.0 in package.json/openapi.yaml, but the tag is created as `v1.0.1` (typo) or not created at all.

**Mitigation**: The tag creation step is manual and explicit. For the future, if tag creation becomes more frequent, a `scripts/release.sh` script can automate reading the version from package.json and creating the tag. Not needed for v1.0.0 (single event) but worth noting for the backlog.

### Risk 3: code-change Gate Skips Version Check

**Scenario**: A PR changes only openapi.yaml version. The current code-change gate checks `grep -qvE '\.md$|^docs/|^site/'` -- openapi.yaml changes would pass this filter (it is not a .md file, not in docs/ or site/), so the version check would run. But if someone adds openapi.yaml to the skip list, the version check would be skipped.

**Mitigation**: The version-sync step is placed before the code-change gate and runs unconditionally. It is explicitly not gated on `steps.changes.outputs.code == 'true'`.

### Risk 4: BUILD_VERSION Not Available in Local Dev

**Scenario**: The `WRL-API-Version` header reads `BUILD_VERSION`, but in local development (`wrangler dev`), compile-time defines may not be injected.

**Mitigation**: Use the same `typeof` guard pattern as the health endpoint. The header should use a fallback like `'dev'` when BUILD_VERSION is not defined. This also means in the test environment (vitest), the header value will be `'dev'` -- tests should assert header presence and valid format, not a specific version string.

### Risk 5: CHANGELOG Warning Fatigue

**Scenario**: The CI warning fires on every PR that touches src/, even for purely internal changes. Developers learn to ignore it.

**Mitigation**: The warning text is specific ("If this PR changes API behavior") to signal it is not always applicable. It is a warning, not a failure. The PR template checklist is the primary enforcement. If the warning proves too noisy, it can be removed without breaking any contract.

## Additional Agents Needed

None. The current team (api-design-minion, api-spec-minion, iac-minion, test-minion) covers all the required domains. The CI/CD changes are straightforward shell scripting and YAML, the version synchronization logic is simple, and the tag workflow is a manual process that needs documentation, not automation.
