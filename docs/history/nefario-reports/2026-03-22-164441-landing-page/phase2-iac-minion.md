## Domain Plan Contribution: iac-minion

### Recommendations

**Use Workers Static Assets (not Cloudflare Pages) for the landing page.**

The decision comes down to three options. Here is the evaluation:

#### Option A: Cloudflare Pages (separate project)

- Separate Cloudflare Pages project connected to the repo.
- Built-in CI/CD, preview deploys per PR.
- BUT: requires managing a separate deployment system (Pages) alongside the three Workers already in this repo (wrl, wrl-docs, wrl-staging). Cloudflare themselves are steering new projects toward Workers Static Assets, with Pages docs now carrying migration banners.
- Adds operational complexity: two different deployment paradigms (wrangler deploy for Workers, Pages build pipeline for landing page).

**Verdict: Rejected.** Introduces a second deployment paradigm for zero benefit on a single static page.

#### Option B: Integrate into docs site (site/wrangler.toml)

- Add the landing page into the 11ty build, serve it from the wrl-docs Worker at the apex domain.
- Technically possible: add a route for `webresourceledger.com` alongside `docs.webresourceledger.com`.
- BUT: couples the landing page's deploy cycle to the docs site. Any docs change triggers a landing page redeploy and vice versa. The docs site has its own 11ty build, npm dependencies, link checking, and Lighthouse CI -- the landing page is a single HTML file that should not be gated behind all of that.
- Muddies the domain routing: one Worker serving two distinct sites on two different hostnames creates confusion about what serves what.

**Verdict: Rejected.** Coupling a zero-dependency static page to a build pipeline with npm, 11ty, Lighthouse, and link checking is unnecessary complexity.

#### Option C: Separate Workers Static Assets project (RECOMMENDED)

- New `landing/wrangler.toml` with `[assets] directory = "./public"` and a custom_domain route for `webresourceledger.com`.
- No Worker code needed -- pure static asset serving (HTML + CSS + SVG).
- The `public/` directory contains pre-assembled files (no build step). The workflow just copies `src/design-system.css` and `site/assets/logo-w-check.svg` into `public/` before deploy.
- Follows the exact same deployment pattern as the docs site: `wrangler deploy` from a subdirectory, triggered by GitHub Actions on path changes.
- Each domain gets its own Worker with its own wrangler.toml -- clean separation of concerns, independent deploy cycles.

**Key configuration:**

```toml
# landing/wrangler.toml
name = "wrl-landing"
compatibility_date = "2026-03-13"

[assets]
directory = "./public"
not_found_handling = "404-page"

routes = [
  { pattern = "webresourceledger.com", custom_domain = true }
]
```

**File structure:**

```
landing/
  wrangler.toml
  _headers           # security headers (same pattern as site/_headers)
  public/
    index.html        # landing page
    css/
      design-system.css  # copied from src/ during CI
      landing.css        # landing-page-specific styles
    assets/
      logo-w-check.svg   # copied from site/assets/ during CI
    404.html           # optional custom 404
```

**Why `public/` is assembled at CI time (not checked in):**

The design-system.css and logo SVG are source-of-truth files in `src/` and `site/assets/` respectively. Checking copies into `landing/public/` creates drift risk. Instead, the GitHub Actions workflow copies them into place before `wrangler deploy`. This is a 2-line shell step, not a build tool.

**GitHub Actions workflow (`deploy-landing.yml`):**

```yaml
name: Deploy Landing Page

on:
  push:
    branches: [main]
    paths:
      - 'landing/**'
      - 'src/design-system.css'
      - 'site/assets/logo-w-check.svg'
  workflow_dispatch:

permissions:
  contents: read
  deployments: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    environment: production
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Assemble static assets
        run: |
          mkdir -p landing/public/css landing/public/assets
          cp src/design-system.css landing/public/css/design-system.css
          cp site/assets/logo-w-check.svg landing/public/assets/logo-w-check.svg

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - run: npm ci

      - uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          workingDirectory: landing
          command: deploy
```

Notes on this workflow:
- Pinned action SHAs match exactly what `deploy-docs.yml` and `deploy-production.yml` already use -- no new supply chain risk.
- Path triggers include the shared assets (`src/design-system.css`, `site/assets/logo-w-check.svg`) so the landing page redeploys if the design system or logo changes.
- No npm install in `landing/` -- wrangler is already available from the root `npm ci`.
- `timeout-minutes: 5` matches existing deploy workflows.
- Environment `production` gates this behind the same protection rules as other production deploys.

**Security headers (`landing/_headers`):**

Reuse the same pattern as `site/_headers`:
```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'self'; style-src 'self'; img-src 'self'; font-src 'none'; script-src 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
```

The CSP is tighter than the docs site: `script-src 'none'` because the landing page has no JavaScript. `font-src 'none'` unless custom fonts are added.

**DNS prerequisite:** The `custom_domain = true` route in wrangler.toml tells Cloudflare to automatically create the DNS record and SSL certificate for `webresourceledger.com`. This requires that the domain's DNS is managed by Cloudflare (which it is -- zone ID 9b1b321a3921da4741063f25d6935a74). No manual DNS record creation needed. Cloudflare handles the CNAME flattening for the apex domain automatically.

### Proposed Tasks

1. **Create `landing/wrangler.toml`** -- Workers Static Assets config with custom_domain route for webresourceledger.com. No Worker script, pure static serving.

2. **Create `landing/_headers`** -- Security headers file. Tighter CSP than docs site (no script-src, no font-src).

3. **Create `landing/public/` directory structure** -- `index.html`, `css/landing.css`, `404.html`. The `css/design-system.css` and `assets/logo-w-check.svg` are NOT checked in here; they are copied during CI.

4. **Add `landing/public/` to `.gitignore`** -- Only `landing/public/index.html`, `landing/public/css/landing.css`, and `landing/public/404.html` should be tracked. The copied assets (`design-system.css`, `logo-w-check.svg`) should be git-ignored to prevent drift. Alternative: gitignore the entire `landing/public/css/design-system.css` and `landing/public/assets/` paths specifically.

5. **Create `.github/workflows/deploy-landing.yml`** -- GitHub Actions workflow as detailed above. Deploy on push to main when landing files, design-system.css, or logo change.

6. **Initial manual deploy** -- First deploy must be done with `wrangler deploy` from the `landing/` directory to create the Worker and register the custom domain. Subsequent deploys are automated via CI.

7. **Verify DNS and SSL** -- After first deploy, confirm that `webresourceledger.com` resolves correctly and the SSL certificate is provisioned. Cloudflare auto-provisions via the custom_domain route, but verify.

8. **Add `www.webresourceledger.com` redirect** -- Optional but recommended. Either add a second route in wrangler.toml or a Cloudflare redirect rule to send `www.webresourceledger.com` -> `webresourceledger.com`. A bulk redirect rule in Cloudflare dashboard is the simplest approach (no code).

### Risks and Concerns

1. **Custom domain conflict with existing DNS records.** If there is already a DNS A/AAAA/CNAME record for `webresourceledger.com` (the apex), the `custom_domain = true` route may conflict. Need to check current DNS state before first deploy. If a record exists (e.g., pointing to the main wrl Worker), it must be removed or the Worker's routes must be updated to avoid collision.

2. **CLOUDFLARE_API_TOKEN permissions.** The existing token (used by deploy-docs and deploy-production) needs Workers Scripts:Edit and Workers Routes:Edit permissions for the new `wrl-landing` Worker. If the token is scoped to specific Workers, it needs to be updated. Verify token scope before first CI deploy.

3. **Design system CSS coupling.** The landing page depends on `src/design-system.css`. If the design system changes in a breaking way, the landing page could break. The path trigger in the workflow ensures a redeploy happens, but there is no automated visual regression test. Mitigation: the landing page should use only stable design tokens (CSS custom properties), not internal class names. This is a design concern, not an infra concern.

4. **No preview deploys.** Unlike Cloudflare Pages, Workers Static Assets deployed via `wrangler deploy` do not get automatic preview URLs per PR. This is acceptable for a single static page -- changes can be reviewed by opening the HTML file locally. If preview deploys are desired later, add a `wrangler deploy --name wrl-landing-preview` step on pull_request events (creates a separate preview Worker).

5. **`_headers` file support.** Workers Static Assets supports `_headers` files the same way Pages does, but verify this works after first deploy. The docs site already uses this pattern successfully in `site/_headers`, so confidence is high.

6. **www redirect not automatic.** Unlike some hosting platforms, Cloudflare Workers do not automatically redirect www to apex. This needs to be set up explicitly (Cloudflare redirect rule or a second route with redirect logic). Low priority but should not be forgotten.

### Additional Agents Needed

None. The landing page HTML/CSS content is a frontend-minion concern (already involved in this planning phase). The deployment architecture, CI/CD, and domain routing are fully within iac-minion scope. No edge-minion involvement needed since Workers Static Assets handles edge distribution natively.
