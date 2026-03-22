## Domain Plan Contribution: api-spec-minion

### Recommendations

**Use `redocly build-docs` with a custom Handlebars template -- it is the right tool here.**

I verified this against the actual codebase:

1. **`@redocly/cli` v1.34.10 is already a devDependency** and `npm run lint:api` already runs `redocly lint openapi.yaml`. No new dependency needed.

2. **`redocly build-docs openapi.yaml` works today** and produces a self-contained 313 KiB HTML file from the 2,868-line spec in ~2ms. The output renders all 5 tag groups (health, captures, verification, signing, admin) with all 14 operations and their full request/response schemas and examples (76 `examples:` entries in the spec).

3. **ReDoc under the hood, not Swagger UI.** `redocly build-docs` uses the ReDoc rendering engine, producing a clean three-panel layout. This satisfies the "no Swagger UI" constraint while still being spec-driven.

4. **Theming maps directly to the WRL design system.** The `redocly.yaml` `theme.openapi.theme` object accepts colors, typography, and sidebar configuration. I verified CLI flag overrides work:
   - `--theme.openapi.theme.colors.primary.main="#2a3444"` (maps to `--color-primary`)
   - `--theme.openapi.theme.typography.fontFamily="-apple-system, ..."` (maps to `--font-sans`)
   - These can also be set in `redocly.yaml` for repeatability.

5. **Custom HTML template for full brand control.** `redocly build-docs` accepts `--template path/to/template.hbs` (Handlebars). The default template is 23 lines -- trivially replaceable. A custom template can inject the WRL design system CSS, site header/nav, and footer around the `{{{redocHead}}}` and `{{{redocHTML}}}` blocks. This is how to get the API reference page to share the same chrome as the rest of the docs site without a framework.

**Recommendation on page structure: single long page, not split by tag.**

- ReDoc already generates a left-sidebar table of contents organized by tag, with deep-link anchors for every operation. Navigation within the page is instant (no page loads).
- The 5 tags / 14 operations is a modest API surface -- splitting would create unnecessary navigation overhead.
- A single HTML file is simpler to build, deploy, and cache. No SSG needed.
- If the API grows significantly in the future (50+ endpoints), splitting can be revisited, but it would require moving to Redocly's full portal product or an SSG -- premature now.

**CI sync check: spec-to-HTML freshness gate.**

The simplest reliable approach:

1. The build script runs `redocly build-docs openapi.yaml -o site/api/index.html` during `npm run build:docs`.
2. CI runs the build step and checks for git-clean output (no diff between committed HTML and regenerated HTML). If the committed HTML is stale relative to `openapi.yaml`, CI fails.
3. Alternatively (and recommended): **do not commit the generated HTML at all.** Treat the build output as a CI artifact. The deploy workflow builds fresh HTML from `openapi.yaml` on every push to main and deploys it to Cloudflare Pages. This guarantees sync by construction -- there is nothing to drift.

Option 3 is strongly preferred. The only file to version-control is `openapi.yaml` (the source of truth) and the build configuration. Generated HTML in the repo invites drift.

**Spec quality assessment for doc generation:**

The current `openapi.yaml` is high quality for documentation rendering:
- All 14 operations have `operationId`, `summary`, `description`, and `tags` -- ReDoc will render clean navigation and documentation.
- 76 `examples:` entries across the spec -- ReDoc will show real request/response payloads, not empty schemas.
- Consistent RFC 9457 `ProblemDetail` error schema across all error responses -- error documentation will be uniform.
- Two security schemes (`bearerAuth`, `adminAuth`) with clear descriptions -- authentication section will be informative.
- `servers` block lists Production and Staging (uses `example.com` placeholders) -- these should be updated to real URLs before the docs site launches.

**One spec issue to fix before launch:**

The `servers` block currently uses placeholder URLs:
```yaml
servers:
  - url: https://wrl.example.com
  - url: https://wrl-staging.example.workers.dev
```

These should be updated to the real production/staging URLs (`https://wrl.benpeter.workers.dev`, etc.) so the rendered API reference shows correct base URLs. This is a spec authoring fix, not a docs build concern.

### Proposed Tasks

**Task 1: Configure Redocly theming in `redocly.yaml`**

- **What:** Extend `redocly.yaml` with `theme.openapi` configuration that maps WRL design system tokens to ReDoc's theming system. Set primary color (`#2a3444`), accent (`#3d7c9a`), typography (system font stack from `--font-sans`), sidebar colors, and code font (`--font-mono`).
- **Deliverable:** Updated `redocly.yaml` with full theme configuration.
- **Dependencies:** None (design system CSS tokens already defined in `src/design-system.css`).

**Task 2: Create custom Handlebars template for `build-docs`**

- **What:** Create a `docs-site/api-template.hbs` file that wraps `{{{redocHead}}}` and `{{{redocHTML}}}` with the shared site header, navigation, and footer used by the rest of the docs site. Include `--disableGoogleFont` since the design system uses system fonts. Add meta tags (description, OpenGraph) for the API reference page.
- **Deliverable:** `docs-site/api-template.hbs` (or whatever the docs directory is named).
- **Dependencies:** Site layout/chrome must be defined first (by frontend/docs-site tasks).

**Task 3: Add `build:api-docs` npm script**

- **What:** Add to `package.json`:
  ```json
  "build:api-docs": "redocly build-docs openapi.yaml -o site/api/index.html --template docs-site/api-template.hbs --disableGoogleFont"
  ```
  This script should be called as part of the overall `build:docs` pipeline.
- **Deliverable:** Updated `package.json` scripts section.
- **Dependencies:** Task 1 (redocly.yaml theming), Task 2 (template).

**Task 4: CI freshness check -- build-time generation, not committed HTML**

- **What:** In the Cloudflare Pages deploy workflow (or a new `deploy-docs.yml`), add a step that runs `npm run build:api-docs` before deployment. The generated `site/` directory is the deploy artifact. Add `site/` to `.gitignore` so generated HTML is never committed. Additionally, add a CI step in `ci.yml` that runs `redocly lint openapi.yaml` (already exists as `lint:api`) and `redocly build-docs` to catch any spec errors that would break the API docs page on merge to main.
- **Deliverable:** Updated CI workflow, `.gitignore` entry.
- **Dependencies:** Task 3.

**Task 5: Update `servers` block in `openapi.yaml`**

- **What:** Replace placeholder `example.com` URLs with real WRL URLs so the API reference shows correct base URLs.
- **Deliverable:** Updated `openapi.yaml` servers section.
- **Dependencies:** None, but should be done before the docs site launches.

### Risks and Concerns

1. **ReDoc theming has limits.** The `theme.openapi.theme` object controls colors, typography, and some layout aspects, but it does not give full CSS control over ReDoc's internal markup. If the WRL brand requires pixel-perfect matching with the rest of the docs site (e.g., exact button styles, exact heading sizes), the Handlebars template can inject a `<style>` block with CSS overrides targeting ReDoc's generated class names. However, ReDoc uses styled-components with generated class names, so deep CSS overrides are fragile across ReDoc version upgrades. Recommendation: keep theming at the token level (colors, fonts) and accept ReDoc's layout conventions for the API reference page.

2. **`disableGoogleFont` is essential.** By default, ReDoc loads Montserrat and Roboto from Google Fonts. The WRL design system uses system fonts. The build must always pass `--disableGoogleFont` to avoid loading external fonts that conflict with the brand.

3. **Spec `servers` URLs are placeholders.** The rendered API reference will show `wrl.example.com` as the base URL if not fixed. This is a user-facing issue that should be treated as a blocker for launch.

4. **Single-file HTML is ~313 KiB now.** This includes the ReDoc JS bundle inlined. For a 2,868-line spec this is fine, but if the spec grows significantly, the HTML file will grow proportionally. The ReDoc JS runtime itself is about 250 KiB gzipped. This is acceptable for a docs page but worth monitoring.

5. **`redocly.yaml` `extends: recommended` may conflict with custom rules.** Currently the file is minimal (3 lines). Adding theme configuration is additive and won't conflict, but if custom linting rules are added later, be aware that `recommended` is the starting ruleset.

6. **CI change-detection in `ci.yml` currently skips docs-only changes.** The existing CI workflow skips tests and lint when only `*.md` or `docs/` files change. If the docs site source lives under `docs/` or `docs-site/`, changes to the API template or docs build configuration would be skipped. The CI change-detection logic needs to be updated to also run `build:api-docs` when `openapi.yaml`, `redocly.yaml`, or docs template files change -- even if no "code" changed.

### Additional Agents Needed

**frontend-minion or static-site-minion:** The API reference (ReDoc output) is just one page of the docs site. The overall site structure -- header, navigation, footer, landing page, guide pages -- needs someone to define the static site build pipeline. If the team plans to use plain HTML/CSS (consistent with the "no JS framework" constraint), a frontend specialist should define the site shell and build process that the API reference page plugs into. The Handlebars template for `build-docs` needs to know what the site chrome looks like.

**devops-minion / infra-minion:** Cloudflare Pages deployment configuration, custom subdomain DNS setup (e.g., `docs.webresourceledger.com`), and the deploy workflow need infrastructure expertise. The API spec concerns (build-docs, theming, CI checks) are settled, but the deployment pipeline is a separate concern.
