# Security Minion -- Plan Contribution: npm Publish Auth for CI

## Recommendations

### (a) Granular Token vs Classic Token: Moot -- Classic Tokens No Longer Exist

As of December 9, 2025, npm permanently revoked all classic tokens. The only options are:

1. **Granular access tokens** -- scoped to specific packages/orgs, max 90-day lifetime for write tokens, configurable 2FA bypass for CI
2. **OIDC Trusted Publishing** -- tokenless publishing via GitHub Actions OIDC federation, no secrets to manage at all

**Strong recommendation: Use OIDC Trusted Publishing.** Rationale follows.

### (b) npm Provenance / OIDC Trusted Publishing: Yes, use it

OIDC Trusted Publishing is the superior approach for this project. It eliminates the npm token entirely -- no secret to rotate, no secret to leak, no 90-day expiry to track. Instead, npm trusts a specific GitHub Actions workflow in a specific repository to publish a specific package.

**How it works:**

1. On npmjs.com, configure `@w-r-l/verify` to trust the workflow file `publish-verify.yml` in repo `benpeter/web-resource-ledger`
2. The GitHub Actions workflow requests an OIDC token (`id-token: write` permission)
3. `npm publish --provenance` sends the OIDC token to npm, which validates it against the trust configuration
4. npm publishes the package and attaches a cryptographic provenance attestation

**Security benefits over granular tokens:**

| Property | Granular Token | OIDC Trusted Publishing |
|----------|---------------|------------------------|
| Secret stored in GitHub | Yes (NPM_TOKEN) | No |
| Can be exfiltrated from logs | Yes (if misconfigured) | No (short-lived, audience-bound) |
| Rotation required | Every 90 days (max) | Never (no secret) |
| Scope limitation | Per-package or org | Per-package + per-repo + per-workflow |
| Provenance attestation | Optional (separate flag) | Automatic |
| Audit trail | Token ID in npm logs | Full OIDC claims (repo, workflow, commit SHA, actor) |

**Provenance attestation** is a significant supply chain security win. Users of `@w-r-l/verify` can cryptographically verify that a published version was built from this specific GitHub repository by this specific workflow. For a package whose purpose is *verifying cryptographic integrity of web archives*, publishing with provenance is table stakes -- practicing what you preach.

**Prerequisites:**

- npm CLI 11.5.1+ (Node 22 ships with npm 10.x; the workflow must run `npm install -g npm@latest` before publishing)
- `repository.url` in `packages/verify/package.json` must match the GitHub repo URL. Current value (`https://github.com/benpeter/web-resource-ledger.git`) is correct.
- The trusted publisher must be configured per-package on npmjs.com at `https://www.npmjs.com/package/@w-r-l/verify/access`

**Fallback position:** If OIDC Trusted Publishing proves problematic during implementation (e.g., npm configuration issues, environment constraints), fall back to a granular access token scoped to `@w-r-l` with `Read and write` permission and 2FA bypass enabled. This is the second-best option and still acceptable. But start with OIDC.

### (c) Token Storage: Environment-Scoped (if token is needed at all)

With OIDC Trusted Publishing, there is no npm token to store. This question becomes moot for the recommended approach.

**If falling back to a granular token**, use an environment-scoped secret, not a repo-level secret. Here is why:

1. **Existing pattern**: This repo already uses environment-scoped secrets for all sensitive credentials. `CLOUDFLARE_API_TOKEN` is stored in both the `staging` and `production` environments, not at repo level. `WRL_*_CAPTURE_API_KEY`, `WRL_*_SIGNING_KEY`, etc. are all environment-scoped. The only repo-level secret is `BADGE_PAT` (a low-sensitivity GitHub PAT for badge updates).

2. **Blast radius containment**: An environment-scoped secret can have protection rules (required reviewers, deployment branches). The `production` and `staging` environments currently have no protection rules, which is a separate finding (see Risks section), but the mechanism exists and should be used.

3. **Recommendation**: Create a new environment named `npm-publish` (or reuse no environment and scope the secret to the job). Since the publish workflow is distinct from Cloudflare deployments, a dedicated environment keeps the trust boundary clean.

**However**: Given that this repo has a single maintainer (Ben), and the existing environments already lack protection rules, the practical difference between repo-level and environment-scoped is minimal right now. The principle of least privilege still favors environment scoping for when collaborators are added.

**If a token is used, also store it in the 1Password WRL vault** as a field on the Production item (e.g., `NPM_PUBLISH_TOKEN`) for disaster recovery. Follow the existing pattern: generate value, store in 1Password, set as GitHub secret.

### (d) Permission Model Review

The publish workflow needs these permissions and no more:

```yaml
permissions:
  contents: read     # checkout the repository
  id-token: write    # request OIDC token for npm trusted publishing
```

**Analysis of each permission:**

- **`contents: read`** -- Required for `actions/checkout`. Already used by all existing workflows. No escalation.

- **`id-token: write`** -- Required for OIDC token generation. This is the most sensitive permission in the workflow. It allows the job to request a JWT from GitHub's OIDC provider. The risk is mitigated by:
  - The OIDC token is audience-bound (npm validates it was issued for npm, not another service)
  - The token is short-lived (minutes, not days)
  - The trust relationship on npmjs.com restricts which workflow file can publish
  - No other workflow in this repo uses `id-token: write`, so adding it to the publish workflow does not expand the attack surface of existing workflows

- **`packages: write`** -- NOT needed. This permission is for GitHub Packages (GHPR), not npmjs.com. Do not include it.

- **`deployments: write`** -- NOT needed. The publish workflow is not a deployment in the Cloudflare sense. Existing deploy workflows use this for GitHub deployment status tracking; the npm publish workflow should not.

**Workflow-level vs job-level permissions**: Set permissions at the **job level**, not the workflow level. This is the pattern used by `deploy-production.yml` (workflow-level). However, since the publish workflow has only one job, the practical difference is negligible. For consistency with existing workflows (which use workflow-level), either approach is acceptable.

### Additional Security Recommendations

**1. Pin the npm version explicitly, not `npm@latest`**

The workflow must upgrade npm to 11.5.1+ for trusted publishing to work (Node 22 ships npm 10.x). However, `npm install -g npm@latest` in CI is a supply chain risk -- you are trusting whatever npm publishes as "latest" at build time.

**Recommendation**: Pin to a specific npm version:
```yaml
- run: npm install -g npm@11.5.1
```

Update this version deliberately (not automatically) when newer npm versions are needed. This prevents a compromised npm CLI from being silently pulled into the publish pipeline.

**2. Do not set `NODE_AUTH_TOKEN` when using OIDC**

A common pitfall: setting `NODE_AUTH_TOKEN` (even to an empty string) causes npm to attempt token-based auth instead of OIDC. The workflow must NOT set this environment variable. The `actions/setup-node` action has a `registry-url` input that automatically configures `NODE_AUTH_TOKEN` -- do not use `registry-url` when doing OIDC trusted publishing.

**3. Restrict the trigger to specific tag patterns**

The devx-minion recommends tags like `verify/v0.2.0`. The workflow trigger should match only this pattern:

```yaml
on:
  push:
    tags:
      - 'verify/v*'
```

This prevents unrelated tags from triggering the publish workflow. A broader pattern like `v*` would match tags from other packages if added later, and could also match arbitrary tags pushed by contributors.

**4. Verify version consistency before publishing**

The workflow should verify that the version in `packages/verify/package.json` matches the git tag. If someone pushes a tag `verify/v0.3.0` but the package.json says `0.2.0`, the publish should fail, not silently publish 0.2.0 under a mismatched tag.

```yaml
- name: Verify version matches tag
  run: |
    TAG_VERSION="${GITHUB_REF_NAME#verify/v}"
    PKG_VERSION=$(node -p "require('./packages/verify/package.json').version")
    if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
      echo "::error::Tag version ($TAG_VERSION) does not match package.json version ($PKG_VERSION)"
      exit 1
    fi
```

**5. Handle duplicate version publish gracefully**

If the version already exists on npm (e.g., re-pushing a tag after a failed workflow run), `npm publish` exits with a non-zero code. The workflow should detect this specific error and exit cleanly rather than marking the workflow as failed:

```yaml
- name: Publish
  run: |
    npm publish --provenance --access public 2>&1 | tee /tmp/npm-publish.log
    EXIT_CODE=${PIPESTATUS[0]}
    if [ $EXIT_CODE -ne 0 ]; then
      if grep -q "EPUBLISHCONFLICT\|cannot publish over the previously published" /tmp/npm-publish.log; then
        echo "::warning::Version already published -- skipping"
        exit 0
      fi
      exit $EXIT_CODE
    fi
  working-directory: packages/verify
```

## Proposed Tasks

### Task S1: Configure npm Trusted Publisher for @w-r-l/verify

**Deliverable**: Trusted publisher configured on npmjs.com linking `@w-r-l/verify` to `benpeter/web-resource-ledger` repo and `publish-verify.yml` workflow

**Dependencies**: Workflow filename must be decided first (coordinate with iac-minion)

**Effort**: Small (manual configuration on npmjs.com, ~5 minutes)

**Details**:
- Navigate to `https://www.npmjs.com/package/@w-r-l/verify/access`
- Add trusted publisher: repository `benpeter/web-resource-ledger`, workflow `publish-verify.yml` (or whatever filename iac-minion chooses)
- If an environment name is used in the workflow, it must match exactly in the trusted publisher config
- This is a manual step that cannot be automated via CI -- it must be done by someone with publish access to the @w-r-l org

### Task S2: Verify package.json repository URL matches GitHub repo

**Deliverable**: Confirmed (or fixed) `repository.url` in `packages/verify/package.json`

**Dependencies**: None

**Effort**: Trivial (verification only)

**Details**:
- Current value: `https://github.com/benpeter/web-resource-ledger.git`
- npm's trusted publisher validation checks this field. Case sensitivity matters.
- Verify it matches exactly. The current value looks correct.

### Task S3: Security review of the final workflow file

**Deliverable**: Sign-off on the publish workflow's permission model, secret handling, and trigger constraints

**Dependencies**: iac-minion delivers the workflow file

**Effort**: Small (review task)

**Details**:
- Verify `permissions` block contains only `contents: read` and `id-token: write`
- Verify no `NODE_AUTH_TOKEN` is set
- Verify tag pattern is restrictive (`verify/v*`, not `v*`)
- Verify version-tag consistency check is present
- Verify duplicate publish is handled gracefully
- Verify npm version is pinned (not `npm@latest`)
- Verify actions are SHA-pinned (existing convention: `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`)

## Risks and Concerns

### Risk 1 (HIGH): Node 22 ships npm 10.x -- OIDC trusted publishing requires npm 11.5.1+

The `.nvmrc` specifies Node 22. The `actions/setup-node` action will install Node 22 with its bundled npm 10.x. Trusted publishing will silently fail or produce confusing errors if npm is not upgraded.

**Mitigation**: The workflow MUST include an explicit npm upgrade step before `npm publish`. Pin to a specific version (`npm@11.5.1`), not `npm@latest`.

**Risk if missed**: The publish step will attempt token-based auth, find no token, and fail with a misleading error. The workflow will appear broken rather than misconfigured.

### Risk 2 (MEDIUM): Existing environments lack protection rules

Both `production` and `staging` environments have no protection rules (no required reviewers, no branch restrictions). This is an existing gap, not introduced by this change, but it is worth noting:

- Any workflow running in the `production` environment can access `CLOUDFLARE_API_TOKEN` and all `WRL_PROD_*` secrets
- There is no approval gate before production deployments

**Recommendation (out of scope for this task, but flagged)**: Add branch protection rules to at least the `production` environment (restrict to `main` branch, optionally require reviewer approval). This protects against a compromised PR or workflow file accessing production secrets.

### Risk 3 (MEDIUM): npm account compromise

The npm account that owns `@w-r-l` is the single point of trust for the package. If this account is compromised, an attacker could:
- Reconfigure trusted publishers to point to a different repository
- Publish malicious versions directly (if the account has a granular token)
- Remove the package entirely

**Mitigation**: Ensure the npm account has:
- A strong, unique password (not shared with any other service)
- 2FA enabled (TOTP or security key, not SMS)
- Recovery codes stored securely (1Password WRL vault)

### Risk 4 (LOW): Tag-based trigger can be abused by collaborators

Anyone with push access to the repository can create tags. If a collaborator pushes a tag matching `verify/v*`, the publish workflow will trigger. With OIDC trusted publishing, this will actually publish to npm.

**Mitigation for now**: The repository has a single maintainer. This is not a current risk. When collaborators are added:
- Use branch protection rules to restrict tag creation
- Or add an environment with required reviewers to gate the publish step
- Or use tag protection rules (GitHub supports these)

### Risk 5 (LOW): Provenance attestation reveals build details

Provenance attestations include: repository URL, workflow file path, commit SHA, runner environment, and the actor who triggered the workflow. This is public information for a public package and is the intended behavior. But it is worth noting -- do not use a workflow that processes secrets visible in the build environment, as the attestation links back to the exact workflow run.

**Mitigation**: The publish workflow should be minimal (checkout, test, publish). It should NOT access Cloudflare secrets, WRL signing keys, or other infrastructure credentials. Keep it isolated from deploy workflows.

### Risk 6 (INFO): `.npmrc` file must not contain auth tokens

The devx-minion proposes creating `packages/verify/.npmrc` with `tag-version-prefix = verify/v`. Ensure this file never contains `//registry.npmjs.org/:_authToken=...` or any credentials. The `.npmrc` will be committed to git and published to npm (unless excluded by `.npmignore` or `files`).

**Mitigation**: The `files` field in `packages/verify/package.json` explicitly lists what gets published (`bin/`, `lib/`, `certs/`, `README.md`, `LICENSE`). `.npmrc` is not in this list and will not be published. However, it will be in the git repo. Verify no credentials end up in it.

## Additional Agents Needed

**None.** The three-agent consultation (iac-minion, devx-minion, security-minion) covers the complete scope:

- iac-minion owns the workflow YAML and trigger design
- devx-minion owns the version bump tooling and developer ergonomics
- security-minion (this contribution) owns the auth model, permission scoping, and supply chain security

One coordination point: the iac-minion must know that the recommended auth approach is OIDC Trusted Publishing (not a granular token), as this changes the workflow structure (no `NPM_TOKEN` secret, `id-token: write` permission, pinned npm version upgrade step, no `NODE_AUTH_TOKEN` env var, no `registry-url` in setup-node).
