# Phase 2: iac-minion Domain Contribution

## Planning Question Answered

### (a) Trigger filter design: tags + path filtering

**Git tags are repo-global -- they have no path context.** A `push.tags` trigger cannot filter by path. The `paths:` filter on `push` events only applies to branch pushes, not tag pushes. This is a fundamental GitHub Actions constraint.

There are two viable approaches:

**Option A (Recommended): Scoped tag prefix convention**

Use a tag naming convention that encodes the package name: `verify/v0.2.0` instead of bare `v0.2.0`. The workflow trigger becomes:

```yaml
on:
  push:
    tags: ['verify/v*']
```

This is the standard monorepo convention (used by Go modules, Lerna, Changesets, and most mature monorepo tooling). It scales naturally if additional packages are added later. The version bump script would create tags like `verify/v0.2.0`.

**Option B: Bare `v*` tags with in-workflow path check**

Use `tags: ['v*']` and add an early job step that checks whether `packages/verify/` was actually modified between the previous tag and the current one. This adds complexity and is fragile -- if someone tags a docs-only commit, the workflow still fires and then skips, wasting runner time. It also requires `fetch-depth: 0` to compare tags.

**Recommendation: Option A (`verify/v*`)**. Only one package exists today (`packages/verify/`), but the convention costs nothing and prevents future tag namespace collisions. The version bump script naturally enforces the prefix.

### (b) Which tests to run

**Run only the package's own tests** (`cd packages/verify && npm ci && npm test`), not the root-level vitest tests.

Rationale:
- The root-level tests (`npm test` at root) run vitest for the Cloudflare Worker. These test a completely different codebase with different dependencies (`@cloudflare/vitest-pool-workers`, `wrangler`).
- The verify package has its own independent `package-lock.json`, its own test runner (`node --test`), and zero coupling to the root project's runtime.
- Running root tests would require installing wrangler and Cloudflare bindings in the publish workflow, adding ~45 seconds of install time for tests that cannot possibly be affected by verify package changes.
- The CI workflow (`ci.yml`) already runs root tests on every push/PR to main. By the time a tag is pushed, main has already passed CI. The publish workflow's job is to gate on the package's own correctness, build it, and publish.

### (c) npm publish with provenance and OIDC

There are two approaches, and the choice depends on whether the project wants to adopt npm trusted publishing (OIDC) or stick with a scoped automation token.

**Approach 1: Legacy automation token (NPM_TOKEN)**

Simpler setup. Store an npm automation token as a GitHub Actions secret. The workflow uses it via `NODE_AUTH_TOKEN`:

```yaml
permissions:
  contents: read
  id-token: write  # needed for --provenance even with legacy tokens

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@<sha>
        with:
          node-version-file: '.nvmrc'
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish --provenance --access public
        working-directory: packages/verify
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Key details:
- `--provenance` requires `id-token: write` permission even with legacy tokens, because provenance attestation uses OIDC regardless of auth method.
- `registry-url` in `actions/setup-node` is required for it to configure `.npmrc` with the auth token.
- `--access public` is needed for scoped packages on first publish (already published at v0.1.0, so npm remembers the access level, but including it is defensive).

**Approach 2: npm trusted publishing (OIDC, no token)**

npm >= 11.5.1 required. Node 22 ships npm 10.x, so the workflow must upgrade npm first:

```yaml
- run: npm install -g npm@latest
- run: npm publish --provenance --access public
```

Requires configuring a "trusted publisher" on npmjs.com for the `@w-r-l/verify` package, linking it to the `benpeter/web-resource-ledger` repository. No `NPM_TOKEN` secret needed.

**Recommendation: Approach 1 (automation token) for now.**

Reasons:
- Node 22 ships npm 10.x. Upgrading npm globally in CI is fragile -- it can break between npm major versions and adds a maintenance burden.
- The task's success criteria explicitly mention "npm publish uses a scoped automation token stored as a GitHub Actions secret." This aligns with Approach 1.
- Trusted publishing is newer (GA July 2025) and has documented edge cases around repository URL matching. The automation token approach is battle-tested.
- When the project moves to Node 24+ (which ships npm 11+), switching to trusted publishing is a one-line change (remove `NODE_AUTH_TOKEN`, add trusted publisher on npmjs.com).

**Provenance requirements (both approaches):**
- `permissions.id-token: write` on the job
- Runner must be GitHub-hosted (not self-hosted) -- provenance attestation is signed by GitHub's OIDC provider
- `--provenance` flag on `npm publish`

### (d) Handling "version already exists" on npm

When `npm publish` encounters an already-published version, it exits with code 1 and error code `EPUBLISHCONFLICT`. The workflow should catch this specific error and exit cleanly (success) rather than marking the workflow as failed.

Recommended pattern:

```yaml
- name: Publish to npm
  id: publish
  working-directory: packages/verify
  run: |
    npm publish --provenance --access public 2>&1 | tee /tmp/npm-publish.log
    exit_code=${PIPESTATUS[0]}
    if [ $exit_code -ne 0 ]; then
      if grep -q 'EPUBLISHCONFLICT\|cannot publish over' /tmp/npm-publish.log; then
        echo "Version already published -- skipping."
        echo "already_published=true" >> "$GITHUB_OUTPUT"
        exit 0
      fi
      exit $exit_code
    fi
    echo "already_published=false" >> "$GITHUB_OUTPUT"
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

This approach:
- Captures the full output for debugging
- Distinguishes "version exists" (benign) from actual failures (auth errors, network issues, malformed package)
- Sets an output variable so downstream steps can report whether a publish actually happened
- Preserves the real exit code for genuine failures

---

## Recommendations

### 1. Workflow file: `.github/workflows/publish-verify.yml`

Single workflow file with a clear name. Structure:

```
Trigger: push tags 'verify/v*'
  |
  Job: publish
    permissions: contents: read, id-token: write
    environment: npm-publish (optional, for approval gate)
    steps:
      1. Checkout (SHA-pinned actions/checkout)
      2. Setup Node (SHA-pinned actions/setup-node, node-version-file: .nvmrc, registry-url)
      3. Install dependencies (cd packages/verify && npm ci)
      4. Run tests (cd packages/verify && npm test)
      5. Verify version matches tag (extract version from tag, compare to package.json)
      6. Publish with provenance (npm publish --provenance --access public, handle EPUBLISHCONFLICT)
```

### 2. Version-tag consistency check

The workflow must verify that the git tag matches `package.json` version before publishing. If someone tags `verify/v0.3.0` but `package.json` says `0.2.0`, the publish should fail loudly. This prevents publishing a version that doesn't match its tag.

```yaml
- name: Verify version matches tag
  working-directory: packages/verify
  run: |
    TAG_VERSION="${GITHUB_REF_NAME#verify/v}"
    PKG_VERSION=$(node -p "require('./package.json').version")
    if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
      echo "::error::Tag version ($TAG_VERSION) does not match package.json version ($PKG_VERSION)"
      exit 1
    fi
```

### 3. Version bump script

A shell script at `packages/verify/scripts/bump-version.sh` (or a root-level `scripts/bump-verify.sh`) that:

1. Takes a version argument (e.g., `0.2.0` or `patch`/`minor`/`major`)
2. Updates `packages/verify/package.json` version field
3. Commits the change
4. Creates a signed git tag `verify/v<version>`
5. Prints the `git push` command to run (does NOT auto-push -- that's the human's decision)

This is intentionally simple. No need for a dependency like `standard-version` or `release-please` for a single package. The script should be < 50 lines of bash.

### 4. Action pinning

Follow the existing project convention: all actions pinned to full commit SHA with version comment. The workflow currently uses:
- `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2`
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0`

The publish workflow must use the same pinned SHAs.

### 5. npm token provisioning

Create a scoped npm automation token (not granular, not publish -- automation tokens bypass 2FA enforcement which is required for CI). The token should be:
- Scoped to the `@w-r-l` organization
- Stored as a GitHub Actions repository secret named `NPM_TOKEN`
- Optionally protected by a GitHub environment (`npm-publish`) with required reviewers for an approval gate before publish

### 6. No `contents: write` permission

The publish workflow needs `contents: read` (checkout) and `id-token: write` (provenance). It does NOT need `contents: write`. The version bump script creates tags locally; the human pushes them. The workflow only reacts to the pushed tag.

---

## Proposed Tasks

### Task 1: Create `.github/workflows/publish-verify.yml`
**Deliverable**: GitHub Actions workflow file
**Dependencies**: NPM_TOKEN secret must be provisioned (Task 3)
**Details**:
- Trigger on `push.tags: ['verify/v*']`
- Single `publish` job with `permissions: { contents: read, id-token: write }`
- SHA-pinned actions matching existing conventions
- Steps: checkout, setup-node (with registry-url), npm ci, npm test, version-tag match check, npm publish with EPUBLISHCONFLICT handling
- `timeout-minutes: 10`
- `working-directory: packages/verify` for install/test/publish steps

### Task 2: Create version bump script
**Deliverable**: `scripts/bump-verify.sh` (executable shell script)
**Dependencies**: None
**Details**:
- Accepts version type (`patch`, `minor`, `major`) or explicit version number
- Updates `packages/verify/package.json` version
- Creates commit with message `chore(verify): release v<version>`
- Creates annotated git tag `verify/v<version>`
- Prints instructions to push: `git push origin main verify/v<version>`
- Does NOT auto-push
- Validates that working directory is clean before starting

### Task 3: Provision npm automation token
**Deliverable**: `NPM_TOKEN` secret in GitHub Actions
**Dependencies**: npm account with publish access to `@w-r-l` org
**Details**:
- Generate automation token on npmjs.com (Settings > Access Tokens > Generate New Token > Automation)
- Scope to `@w-r-l` organization if granular tokens are used
- Add as repository secret `NPM_TOKEN` in GitHub repo settings
- Store token in 1Password WRL vault as well (per project conventions)
- This is a manual step -- cannot be automated in CI

### Task 4: CHANGELOG generation
**Deliverable**: Lightweight changelog generation integrated into bump script
**Dependencies**: Task 2
**Details**:
- Use `git log --oneline verify/v<previous>..HEAD -- packages/verify/` to extract commits since last tag
- Prepend new section to `packages/verify/CHANGELOG.md`
- Format: `## v<version> (YYYY-MM-DD)` header, followed by commit messages as bullet points
- Include in the same commit as the version bump
- No external dependencies (no conventional-changelog, no semantic-release) -- pure git log + shell

### Task 5: Verify workflow with dry-run
**Deliverable**: Successful test of the complete flow
**Dependencies**: Tasks 1, 2, 3
**Details**:
- Bump to v0.1.1 (patch) using the script
- Push tag to trigger workflow
- Verify: tests pass, version check passes, publish succeeds, provenance attestation appears on npmjs.com
- Verify: re-pushing the same tag (or a tag for an existing version) degrades gracefully

---

## Risks and Concerns

### Risk 1: npm token scope and 2FA
**Severity**: Medium
**Details**: If the npm org `@w-r-l` has mandatory 2FA enabled for publishing, only an *automation* token (not a classic auth token) will work from CI. Granular tokens with specific package scope are preferred but require npm to support them for the org. Verify the org's 2FA settings before generating the token.
**Mitigation**: Use an automation token explicitly. Test the token with `npm whoami --registry https://registry.npmjs.org` in CI before the first real publish.

### Risk 2: Tag-version mismatch
**Severity**: High
**Details**: If someone pushes a tag `verify/v0.3.0` but forgets to bump `package.json`, the publish would either fail (if the version check is in place) or publish the wrong version (if it isn't). Without the version-tag consistency check, npm would happily publish whatever version is in `package.json`, creating a confusing state.
**Mitigation**: The version-tag match step (Recommendation 2) is mandatory, not optional. The bump script (Task 2) eliminates manual version editing, reducing the chance of mismatch.

### Risk 3: Provenance failure on forked repos
**Severity**: Low
**Details**: If someone forks the repo and pushes a tag, `--provenance` will fail because the OIDC identity won't match the npm package's expected publisher. This is actually desired behavior (prevents unauthorized publishes), but the error message may be confusing.
**Mitigation**: Document in the workflow file with a comment that provenance requires the canonical repository.

### Risk 4: `package-lock.json` drift
**Severity**: Low
**Details**: The verify package has its own `package-lock.json` independent of the root. If dependencies are updated in development but `package-lock.json` isn't committed, `npm ci` in CI will fail. This is actually good -- it catches uncommitted dependency changes. But it could surprise someone pushing a tag from a branch where they forgot to commit the lockfile.
**Mitigation**: The bump script should check for uncommitted changes (including in `package-lock.json`) before proceeding.

### Risk 5: Stale CI on tag push
**Severity**: Low
**Details**: The tag-triggered workflow runs against the tagged commit. If someone tags an old commit, the workflow runs old code and old tests. This is generally fine (you're publishing what you tagged), but could be surprising if tests have been fixed on main but not backported.
**Mitigation**: The convention of tagging from main (enforced socially, not technically) and using the bump script reduces this risk.

---

## Additional Agents Needed

**security-minion** -- Should review the npm token provisioning approach (automation token vs. granular token, scope, rotation policy) and the OIDC/provenance configuration. The security-minion should also validate that the workflow permissions are minimally scoped and that the token cannot be exfiltrated via workflow logs. (If security-minion is already involved in this planning phase, this is covered.)

No other additional specialists are needed. The workflow is straightforward CI/CD infrastructure. The verify package's tests and build are self-contained Node.js -- no container, no cloud deployment, no edge runtime involved.
