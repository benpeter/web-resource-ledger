# Domain Plan Contribution: iac-minion

## Recommendations

### 1. Use Workers Static Assets, Not Cloudflare Pages

Cloudflare deprecated Pages in April 2025 and is investing exclusively in
Workers going forward. The recommended path for new static sites is
**Workers with Static Assets** -- a `[assets]` block in `wrangler.toml`
that serves files from a build output directory. This is the
forward-looking approach and avoids adopting a platform Cloudflare has
explicitly stopped developing.

Using Workers Static Assets also keeps the deployment model consistent with
the existing WRL Worker: both deploy via `wrangler deploy`, both use the
same `wrangler-action` in CI, and both share the same `CLOUDFLARE_API_TOKEN`
secret. No new infrastructure primitive is introduced.

**Configuration approach**: A separate `wrangler.toml` in the docs site
directory (e.g., `site/wrangler.toml`) that defines a new Worker named
`wrl-docs` with an `[assets]` block pointing at the build output directory.
The Worker itself needs no code -- static assets are served automatically
when no `main` entry point is specified, or a minimal one-liner can be used
as a fallback handler.

```toml
# site/wrangler.toml
name = "wrl-docs"
compatibility_date = "2026-03-13"

[assets]
directory = "./_output"
```

### 2. Deploy via `wrangler deploy`, Not Pages GitHub Integration

Use `wrangler deploy` via the existing `cloudflare/wrangler-action` (already
pinned to `v3.14.1` in the repo). This gives full control over the build
pipeline in GitHub Actions, avoids Cloudflare's own CI runner (which would
be a second build system), and reuses the existing deployment pattern.

The `wrangler pages deploy` command is also deprecated alongside Pages.
`wrangler deploy` with `[assets]` is the canonical command.

### 3. Custom Domain via Workers Custom Domain

Configure `docs.webresourceledger.com` as a **Workers Custom Domain** on
the `wrl-docs` Worker, not via a CNAME-to-Pages setup. This is done via
the Cloudflare dashboard (Workers & Pages > wrl-docs > Settings > Domains &
Routes) or via the `routes` field in `wrangler.toml`:

```toml
routes = [
  { pattern = "docs.webresourceledger.com", custom_domain = true }
]
```

This creates the required DNS record automatically in the
`webresourceledger.com` zone (zone ID `9b1b321a3921da4741063f25d6935a74`).
HTTPS is handled automatically by Cloudflare's Universal SSL -- no ACME
configuration, no certificate management.

**Coexistence with the existing WRL Worker**: No conflict. The existing WRL
Worker (`wrl`) runs on `wrl.benpeter.workers.dev` and does not have a custom
domain on `webresourceledger.com`. Each Worker owns its subdomain. If/when
`api.webresourceledger.com` is added for the main WRL Worker, that will be a
separate custom domain on the `wrl` Worker. Different subdomains, different
Workers, no routing overlap.

### 4. New Dedicated Workflow: `deploy-docs.yml`

Create a **separate workflow**, not integrated into the existing CI or
deploy-staging/deploy-production pipelines. Reasons:

1. **Different trigger scope**: The docs site should deploy when docs content
   or site build files change, not on every push. Use path filtering.
2. **No staging gate**: A static docs site does not need the
   staging -> smoke -> production pipeline that the Worker uses. A single
   build + deploy is sufficient.
3. **Independent failure**: Docs deployment failures should not block or
   delay Worker deployments, and vice versa.
4. **Clarity**: The existing pipeline is already a 3-workflow chain
   (ci.yml -> deploy-staging.yml -> deploy-production.yml). Adding docs
   deployment to any of these would conflate concerns.

### 5. CI Workflow Structure

```yaml
name: Deploy Docs

on:
  push:
    branches: [main]
    paths:
      - 'site/**'
      - 'openapi.yaml'
      - 'docs/**'
  workflow_dispatch:

permissions:
  contents: read
  deployments: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - name: Build docs site
        run: npm run build:docs
      - uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          workingDirectory: site
```

Key design decisions:
- **Path filtering**: Only triggers on changes to `site/`, `openapi.yaml`,
  or `docs/` directories. Avoids unnecessary deploys on Worker code changes.
- **Reuses existing secrets**: `CLOUDFLARE_API_TOKEN` is already configured
  in both staging and production GitHub environments. The docs Worker uses
  the same token (it's account-scoped).
- **Reuses existing action pins**: Same `actions/checkout`, `actions/setup-node`,
  and `cloudflare/wrangler-action` commit SHAs already in use. No new
  action supply chain risk.
- **Single job**: Build and deploy in one job. No artifact handoff needed --
  the output directory is local and ephemeral.
- **No environment protection**: This is a public docs site with no secrets
  beyond the deploy token. No approval gate needed.

### 6. Build Script Integration

The docs build (whatever tooling frontend-minion and api-spec-minion choose)
should be invoked via an npm script:

```json
"build:docs": "... build command that outputs to site/_output ..."
```

This keeps the CI workflow generic -- it does not need to know whether the
site is built with 11ty, Redocly, or a custom script. The contract is:
`npm run build:docs` produces a directory of static files at `site/_output`.

### 7. Existing CI Workflow Impact

The current `ci.yml` has a docs-skip optimization:

```yaml
if git diff --name-only "$BASE_REF"...HEAD | grep -qvE '\.md$|^docs/'; then
  echo "code=true" >> "$GITHUB_OUTPUT"
```

This skips tests for docs-only changes. The new `site/` directory should
be added to this exclusion pattern so that changes to docs site templates,
CSS, or configuration also skip Worker tests:

```bash
grep -qvE '\.md$|^docs/|^site/'
```

This is a minor edit to `ci.yml`, not a structural change.

---

## Proposed Tasks

### Task 1: Create docs Worker configuration

**What**: Create `site/wrangler.toml` with the `wrl-docs` Worker
configuration, including `[assets]` block pointing at the build output
directory and the custom domain route.

**Deliverables**:
- `site/wrangler.toml`
- `site/.assetsignore` (exclude `.DS_Store`, `node_modules`, `.git` if
  needed -- mirrors Pages' default behavior)

**Dependencies**: Final agreement on the build output directory name
(from frontend-minion's site architecture decision).

### Task 2: Create `deploy-docs.yml` workflow

**What**: Create `.github/workflows/deploy-docs.yml` with the structure
described above. Path-filtered trigger, single build + deploy job, reusing
existing action pins and secrets.

**Deliverables**:
- `.github/workflows/deploy-docs.yml`

**Dependencies**:
- Task 1 (needs the wrangler.toml to exist)
- Build script name from frontend-minion (the `npm run build:docs` command)

### Task 3: Update CI docs-skip pattern

**What**: Update the docs-skip `grep` pattern in `ci.yml` (both `test` and
`test-integration` jobs) to also exclude `site/` directory changes from
triggering Worker tests.

**Deliverables**:
- Updated `ci.yml` with `^site/` added to the exclusion regex.

**Dependencies**: Task 1 (needs the directory name to be finalized).

### Task 4: Configure custom domain in Cloudflare

**What**: After the first successful deploy of `wrl-docs`, add the custom
domain `docs.webresourceledger.com` via the Cloudflare dashboard (Workers &
Pages > wrl-docs > Settings > Domains & Routes > Add Custom Domain). This
is a one-time manual step. If the `routes` field in `wrangler.toml` works
for custom domain provisioning (it should with `custom_domain = true`),
this may be automatic on first deploy.

**Deliverables**:
- `docs.webresourceledger.com` resolving to the docs Worker with HTTPS.
- Verified that `wrl.benpeter.workers.dev` (main Worker) is unaffected.

**Dependencies**: Task 2 (first deploy must succeed to create the Worker).

### Task 5: Add `build:docs` npm script

**What**: Add the docs build command to `package.json` scripts. The
specific command depends on the tooling decision (11ty, Redocly build-docs,
custom script), but the contract is that it writes output to `site/_output`.

**Deliverables**:
- `package.json` updated with `build:docs` script.

**Dependencies**: Frontend-minion and api-spec-minion decisions on build
tooling.

---

## Risks and Concerns

### R1: Workers Static Assets Is Relatively New

Workers Static Assets (`[assets]` in wrangler.toml) became the recommended
replacement for Pages in mid-2025. It is stable and documented, but has a
shorter track record than Pages. The mitigation is that the use case here
is extremely simple (serve static HTML/CSS/JS) and the wrangler-action
already supports it.

### R2: Custom Domain Provisioning May Require Dashboard Intervention

The `routes` field with `custom_domain = true` should auto-create the DNS
record, but the wrangler CLI has historically lagged behind the dashboard
for domain management. If `wrangler deploy` does not provision the custom
domain automatically, it must be added manually via the dashboard. This is
a one-time operation, not a recurring risk.

### R3: CLOUDFLARE_API_TOKEN Scope

The existing `CLOUDFLARE_API_TOKEN` secret must have permission to deploy
Workers to the `webresourceledger.com` zone (not just the `benpeter.workers.dev`
subdomain). The token is already used for Worker deployments, so it likely
has account-level Workers permissions. Verify before the first deploy
attempt. If the token lacks permission for the new zone, it will need to be
updated or a new token scoped to include `webresourceledger.com` zone
permissions must be created.

### R4: Path Filter False Negatives

If the build depends on files outside `site/`, `openapi.yaml`, and `docs/`
(e.g., `package.json`, `package-lock.json`, `.nvmrc`), the path filter
could miss changes that affect the build. Mitigation: include
`workflow_dispatch` trigger for manual deploys. The path filter list can be
expanded if false negatives are observed.

### R5: First Deploy Bootstrapping

The `wrl-docs` Worker does not exist yet in Cloudflare. The first
`wrangler deploy` will create it. This should work automatically, but if
the account has any Worker name restrictions or plan limits, the first
deploy could fail. Verify the free/paid plan allows multiple Workers (the
paid Workers plan allows unlimited Workers).

---

## Additional Agents Needed

None. The current team (frontend-minion, api-spec-minion, iac-minion,
user-docs-minion, ux-strategy-minion) covers all the necessary domains for
this task. The infrastructure requirements are straightforward enough that
no edge-minion consultation is needed -- Workers Static Assets handles CDN
and caching automatically.

---

## Key Architectural Decision: Workers Static Assets vs. Cloudflare Pages

| Dimension | Workers Static Assets | Cloudflare Pages |
|-----------|----------------------|-----------------|
| Platform status | Active development | Deprecated (April 2025) |
| Deploy command | `wrangler deploy` | `wrangler pages deploy` (deprecated) |
| Consistency with WRL | Same tooling as main Worker | Different deployment primitive |
| Custom domains | `routes` with `custom_domain` | Dashboard-only |
| CI integration | `wrangler-action` (same as today) | `wrangler-action` (different command) |
| Future-proofing | Forward-looking | Risk of forced migration |

The recommendation is Workers Static Assets. It aligns with Cloudflare's
stated direction, keeps the deployment model consistent across the project,
and avoids adopting a deprecated platform.

Sources:
- [Cloudflare: Migrate from Pages to Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- [Cloudflare: Static Assets docs](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare: Direct Upload with CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Cloudflare: Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Cloudflare: Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [wrangler-action GitHub](https://github.com/cloudflare/wrangler-action)
- [Redocly CLI build-docs](https://redocly.com/docs/cli/commands/build-docs)
