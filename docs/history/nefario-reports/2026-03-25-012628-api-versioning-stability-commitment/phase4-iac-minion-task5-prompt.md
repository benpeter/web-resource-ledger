Task 5: CI enforcement -- version sync, changelog warning, PR template

You are adding CI enforcement for version synchronization and a PR template to the WRL project.

## Context

WRL uses GitHub Actions for CI. The main CI workflow is `.github/workflows/ci.yml`. It has a `test` job that runs on ubuntu-latest with a code-change gate (skips tests for docs-only PRs). The project also has `test-integration` as a separate job.

The deploy pipelines already read `package.json` version via `jq -r .version package.json` and inject it as `BUILD_VERSION`.

There is a `scripts/` directory with existing shell scripts. No PR template exists yet.

Current ci.yml structure (test job):
1. actions/checkout (fetch-depth: 0)
2. Check for code changes (id: changes) — gates subsequent steps
3. setup-node (gated)
4. npm ci (gated)
5. npm test (gated)
6. npm run lint:api (gated)
7. echo docs-only message (when code=false)

## What to do

### Step 1: Create version-sync check script

Create `scripts/check-version-sync.sh`:

```bash
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

Make it executable (`chmod +x`). Run shellcheck on it.

### Step 2: Add version-sync step to ci.yml

Add a step to the `test` job BEFORE the code-change gate. This check must run unconditionally on every PR, even docs-only changes, because version files are metadata that must always be consistent.

Place it immediately after the checkout step and BEFORE the "Check for code changes" step:

```yaml
    - name: Check version sync
      run: ./scripts/check-version-sync.sh
```

This runs before the code-change gate so it is NOT gated on `steps.changes.outputs.code == 'true'`.

### Step 3: Add changelog-update warning to ci.yml

Add a step that warns when API-affecting files change without a CHANGELOG.md update. This is a WARNING, not a failure. Place it after the version-sync step and before the code-change gate:

```yaml
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

### Step 4: Create PR template

Create `.github/pull_request_template.md`:

```markdown
## Changes

<!-- Brief description of what this PR does -->

## Checklist

- [ ] Tests pass (`npm test`)
- [ ] API spec updated if endpoints changed (`openapi.yaml`)
- [ ] CHANGELOG.md updated if API behavior changed
- [ ] Version bumped in package.json and openapi.yaml if releasing
```

Keep it minimal.

### Step 5: Verify CI locally

Run the version-sync script locally to verify it passes with both package.json and openapi.yaml at 1.0.0.

## Files to create
- `scripts/check-version-sync.sh` -- version sync check (executable)
- `.github/pull_request_template.md` -- PR template

## Files to modify
- `.github/workflows/ci.yml` -- add version-sync step and changelog warning step

## What NOT to do
- Do NOT create a separate CI job for the version check (it runs in <1 second)
- Do NOT make the changelog check a hard failure (warning only)
- Do NOT add pre-commit hooks
- Do NOT modify deploy pipelines
- Do NOT add tag-version enforcement (tags are created manually after merge)
- Do NOT gate the version-sync check on the code-change condition
- Do NOT modify any source code files

## Acceptance criteria
- `scripts/check-version-sync.sh` passes shellcheck and correctly detects version mismatches
- Version-sync step runs unconditionally in CI (before the code-change gate)
- Changelog warning fires only on PRs, only when src/ or openapi.yaml changes without CHANGELOG.md changes
- Changelog check uses `::warning::` (not `::error::`) -- it is non-blocking
- PR template exists with the 4-item checklist
- Running `./scripts/check-version-sync.sh` locally succeeds when versions match
