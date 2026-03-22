# Domain Plan Contribution: frontend-minion

## Recommendations

### 1. Use 11ty (Eleventy) as the static site generator -- not plain HTML

Plain HTML would mean duplicating layouts, nav, and footer across every page and hand-managing the build. 11ty gives us:

- **Nunjucks/Liquid templates** with layouts and partials (no JS shipped to browser)
- **Data files** for parsing `openapi.yaml` at build time via a `.11tydata.js` or global data file
- **Zero client-side JS by default** -- output is plain HTML + CSS
- **Markdown content** with frontmatter for all guide pages

This stays within the "no JS framework" constraint. 11ty is a build tool, not a runtime framework. The output is static HTML files.

Use 11ty v3.x (ESM-native, Node 18+). The project already requires Node >=20.

### 2. OpenAPI rendering at build time without Swagger UI

**Do not use Swagger UI, Redoc, or any client-side OpenAPI renderer.** These ship large JS bundles and violate the "no JS framework" constraint.

Instead, parse `openapi.yaml` at build time using the `yaml` package (already a devDependency) and generate HTML pages from it:

- **Global data file**: `docs-site/_data/api.js` reads and parses `openapi.yaml`, resolves `$ref` pointers, and returns a structured object with paths, schemas, security schemes, etc.
- **Nunjucks templates**: An `api-reference.njk` template iterates over the parsed API data and renders each endpoint as static HTML -- method badge, URL path, description, parameters table, request/response body schemas, example payloads, security requirements.
- **$ref resolution**: The OpenAPI spec uses `$ref` extensively (headers, schemas). The build-time data file must dereference these. Use a small custom resolver or `@apidevtools/swagger-parser` (just for bundling/dereferencing, not for UI rendering). The spec is ~30KB so in-memory resolution is trivial.

This approach makes `openapi.yaml` the single source of truth. When the spec changes, the docs site rebuilds automatically. No manual sync.

**API reference page structure** (one page or multiple):
- Single-page API reference works well for this spec size (~11 endpoints). A sidebar or in-page TOC with anchor links provides navigation.
- Group endpoints by tag (health, captures, verification, signing, admin) matching the OpenAPI `tags`.

### 3. Directory structure: `docs-site/` at repo root

Use `docs-site/` (not `site/` or `docs/`) to avoid collision with the existing `docs/` directory which contains evolution logs, backlog, and internal project documentation. The name makes the purpose unambiguous.

```
docs-site/
  .eleventy.js                    # 11ty config (ESM)
  package.json                    # separate from root; 11ty + yaml deps only
  _data/
    api.js                        # parses openapi.yaml at build time
    site.js                       # site metadata (title, baseUrl, nav structure)
  _includes/
    layouts/
      base.njk                    # HTML shell, head, nav, footer
      doc.njk                     # extends base; adds sidebar + content area
    partials/
      nav.njk                     # top navigation
      sidebar.njk                 # sidebar with section links
      endpoint.njk                # reusable endpoint rendering partial
      schema-table.njk            # renders a JSON schema as a table
      code-sample.njk             # styled code block with optional language label
  css/
    design-system.css             # symlink or copy of src/design-system.css
    docs.css                      # docs-specific styles (nav, sidebar, prose, code)
  content/
    index.md                      # Landing / hero page
    getting-started.md            # Getting Started guide
    authentication.md             # Auth guide (API keys, scopes, admin keys)
    verification.md               # Verification guide
    mcp.md                        # MCP integration guide (from docs/mcp.md)
    batch.md                      # Batch capture guide
    api-reference.njk             # Generated from openapi.yaml via _data/api.js
  assets/
    favicon.svg                   # from src/assets/
    logo-w-check.svg              # from src/assets/
  _site/                          # build output (gitignored)
```

**Why a separate `package.json`**: 11ty and its plugins are docs-only dependencies. They should not pollute the worker's dependency tree. The CI workflow installs and builds from `docs-site/` independently.

### 4. Design system reuse strategy

The design system CSS (`src/design-system.css`) provides tokens and base components. The docs site should consume it directly:

**Copy at build time, not symlink.** Add an 11ty `before` event or npm script that copies `../src/design-system.css` into `docs-site/css/` before build. This avoids symlink issues in CI/Cloudflare Pages build environment and keeps a clear dependency direction.

The design system provides everything needed for the base layer:
- **Tokens**: colors, typography, spacing, radii (all `--color-*`, `--font-*`, `--text-*`, `--space-*`, `--radius-*`)
- **Components**: `.btn`, `.alert`, `.badge`, `.card`, `.code-block`, `.table`, `.disclosure`, `.data-grid`, `.input`, `.sr-only`

These are directly usable in docs pages. The `.alert` component maps perfectly to callout/admonition boxes. The `.table` component works for parameter tables. The `.code-block` component is the base for code samples.

### 5. Docs-specific CSS extensions

A `docs.css` file extends the design system for documentation-specific patterns. All values reference design system tokens -- no hardcoded hex. The additions:

**Layout (sidebar + content)**:
```css
.docs-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
}

@media (max-width: 768px) {
  .docs-layout {
    grid-template-columns: 1fr;
  }
}
```

**Top navigation**: Extend the existing `.app-nav` pattern from `ui-css.js` (the web UI already has a nav bar built on the same design system tokens). Reuse the pattern, don't duplicate:
```css
.docs-nav {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-4);
  display: flex;
  align-items: center;
  min-height: 52px;
}
```

**Sidebar navigation**:
```css
.docs-sidebar {
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: var(--space-4) 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.docs-sidebar a {
  display: block;
  padding: var(--space-2) var(--space-4);
  color: var(--color-text);
  text-decoration: none;
  font-size: var(--text-base);
  border-left: 2px solid transparent;
}

.docs-sidebar a[aria-current="page"] {
  color: var(--color-primary);
  border-left-color: var(--color-primary);
  background: var(--color-surface-muted);
  font-weight: var(--weight-medium);
}
```

**Prose typography** (markdown content area):
```css
.docs-prose h1 { font-size: var(--text-2xl); font-weight: var(--weight-bold); margin-bottom: var(--space-4); }
.docs-prose h2 { font-size: var(--text-xl); font-weight: var(--weight-bold); margin-top: var(--space-8); margin-bottom: var(--space-3); }
.docs-prose h3 { font-size: var(--text-lg); font-weight: var(--weight-medium); margin-top: var(--space-6); margin-bottom: var(--space-2); }
.docs-prose p { margin-bottom: var(--space-4); line-height: var(--leading-relaxed); }
.docs-prose ul, .docs-prose ol { margin-bottom: var(--space-4); padding-left: var(--space-6); }
.docs-prose li { margin-bottom: var(--space-2); }
.docs-prose a { color: var(--color-accent); text-decoration: underline; }
.docs-prose a:hover { color: var(--color-accent-hover); }
```

**Code highlighting**: Use a build-time syntax highlighter. 11ty has an official plugin (`@11ty/eleventy-plugin-syntaxhighlight`) that uses PrismJS at build time and injects HTML classes -- no client-side JS. Ship a small Prism CSS theme that uses design system tokens:
```css
/* Token colors derived from design system palette */
.token.comment { color: var(--color-text-muted); }
.token.keyword { color: var(--color-accent); }
.token.string { color: var(--color-success-text); }
.token.number { color: var(--color-error); }
.token.property { color: var(--color-primary); }
```

**HTTP method badges** (for API reference):
```css
.method-badge {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  text-transform: uppercase;
  border-radius: var(--radius-sm);
}
.method-badge--get { background: var(--color-info-bg); color: var(--color-info-text); }
.method-badge--post { background: var(--color-success-bg); color: var(--color-success-text); }
.method-badge--delete { background: var(--color-error-bg); color: var(--color-error-text); }
.method-badge--options { background: var(--color-surface-muted); color: var(--color-text-muted); }
```

**Admonitions/callouts** (reusing `.alert` from design system):
- `.alert--info` for "Note:" blocks
- `.alert--warning` for "Important:" blocks
- `.alert--success` for "Tip:" blocks

These already exist in the design system. Use markdown-it plugin or custom shortcode in 11ty to render them from markdown.

### 6. Accessibility approach for Lighthouse >= 90

The design system already has solid accessibility foundations (`.sr-only`, `focus-visible` outlines, WCAG AA contrast ratios). To hit >= 90:

- **Semantic HTML**: `<nav>`, `<main>`, `<article>`, `<aside>` for sidebar, `<header>`, `<footer>`
- **Skip-to-content link**: First element in body, visible on focus
- **Heading hierarchy**: Enforce strict h1 > h2 > h3 order in templates
- **ARIA landmarks**: `aria-label` on nav elements to distinguish site nav from sidebar nav
- **Link context**: All links have descriptive text (no "click here")
- **Image alt text**: Logo SVGs get `alt` text; decorative icons get `aria-hidden="true"`
- **Color contrast**: Already validated in style guide (all key pairs >= 4.5:1)
- **Focus indicators**: Already provided by design system (`:focus-visible` with `outline: 2px solid var(--color-primary)`)
- **Language attribute**: `<html lang="en">`
- **Responsive viewport**: `<meta name="viewport" content="width=device-width, initial-scale=1">`

### 7. No client-side JavaScript

The entire site should work with JS disabled. Zero JavaScript in the output. This means:

- No hamburger menus with JS toggles -- use `<details>/<summary>` for mobile sidebar if needed
- No client-side search (or add it as progressive enhancement later if needed)
- No copy-to-clipboard buttons (nice-to-have, could add as minimal progressive enhancement)
- Code highlighting done entirely at build time via PrismJS plugin

This maximizes Lighthouse performance scores (no JS parse/execute time) and accessibility.

### 8. Cloudflare Pages deployment

Cloudflare Pages is the right deployment target (project is already Cloudflare-native). Configuration:

- **Build command**: `cd docs-site && npm ci && npm run build`
- **Output directory**: `docs-site/_site`
- **Framework preset**: None (custom build)
- **Node version**: Match `.nvmrc` from project root

The Cloudflare Pages project should be configured via `wrangler pages` or the dashboard. It is separate from the Workers deployment (different Cloudflare project).

A `_headers` file in `docs-site/_site/` can set security headers:
```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
```

And a `_redirects` file for any URL normalization.

## Proposed Tasks

### Task 1: Scaffold 11ty project in `docs-site/`
**What**: Create `docs-site/` directory with `package.json`, `.eleventy.js` config, layout templates (`base.njk`, `doc.njk`), partials (`nav.njk`, `sidebar.njk`), and `_data/site.js` with nav structure.

**Deliverables**:
- `docs-site/package.json` with `@11ty/eleventy`, `@11ty/eleventy-plugin-syntaxhighlight`, `yaml` dependencies
- `.eleventy.js` ESM config with input/output dirs, Nunjucks, syntax highlighting plugin, build-time copy of `design-system.css`
- Base layout with proper HTML document structure, meta tags, nav, sidebar, footer
- `npm run build` produces working `_site/` output
- `.gitignore` entry for `docs-site/_site/`

**Dependencies**: None. This is the foundation.

### Task 2: Build CSS layer (design-system.css + docs.css + Prism theme)
**What**: Create `docs-site/css/docs.css` with all documentation-specific styles: layout grid, sidebar, prose typography, method badges, code theme. Configure 11ty to copy `src/design-system.css` as part of the build. Create a Prism theme CSS file using design system tokens.

**Deliverables**:
- `docs-site/css/docs.css` -- complete docs layout and typography styles
- `docs-site/css/prism-wrl.css` -- syntax highlighting theme using design system tokens
- Build script copies `../src/design-system.css` into CSS pipeline
- All styles use design system tokens exclusively

**Dependencies**: Task 1 (scaffold).

### Task 3: Build OpenAPI data pipeline
**What**: Create `docs-site/_data/api.js` that reads `../../openapi.yaml`, parses it, resolves all `$ref` pointers, and exposes a structured API object to templates. Create `_includes/partials/endpoint.njk` and `schema-table.njk` for rendering endpoints and schemas.

**Deliverables**:
- `docs-site/_data/api.js` -- OpenAPI parser with $ref resolution
- `docs-site/_includes/partials/endpoint.njk` -- renders one endpoint (method badge, path, description, params, request/response)
- `docs-site/_includes/partials/schema-table.njk` -- renders JSON schema as property table
- `docs-site/content/api-reference.njk` -- API reference page that iterates over parsed data

**Dependencies**: Task 1 (scaffold), Task 2 (CSS).

### Task 4: Author content pages (markdown)
**What**: Write the guide content in markdown with frontmatter. Adapt existing content from `docs/mcp.md` and `README.md` usage sections. Each page targets a specific user task.

**Deliverables**:
- `content/index.md` -- Landing page with value proposition, quick links
- `content/getting-started.md` -- First capture in 5 minutes
- `content/authentication.md` -- API keys, scopes, admin key management
- `content/verification.md` -- How verification works, sharing verify URLs
- `content/mcp.md` -- MCP server setup for Claude Code, Cursor, Windsurf
- `content/batch.md` -- Batch capture endpoint usage
- Each page has correct frontmatter (title, description, nav order)

**Dependencies**: Task 1 (scaffold), Task 2 (CSS for prose styles).

### Task 5: Accessibility audit and Lighthouse validation
**What**: Run Lighthouse on the built site. Fix any accessibility issues. Validate keyboard navigation, heading hierarchy, landmark structure, focus management, color contrast.

**Deliverables**:
- Lighthouse accessibility score >= 90
- All pages pass axe-core automated checks
- Keyboard navigation works end-to-end (skip link, sidebar, content)
- `<details>/<summary>` mobile sidebar works without JS

**Dependencies**: Tasks 1-4 (complete site).

### Task 6: Cloudflare Pages CI/CD workflow
**What**: Create GitHub Actions workflow for deploying docs site to Cloudflare Pages on push to main. Add custom domain configuration.

**Deliverables**:
- `.github/workflows/deploy-docs.yml` -- builds and deploys `docs-site/` to Cloudflare Pages
- Only triggers on changes to `docs-site/`, `openapi.yaml`, or `src/design-system.css`
- `docs-site/_headers` with security headers
- Custom domain DNS configuration (coordinate with iac-minion)

**Dependencies**: Tasks 1-4 (built site), iac-minion for DNS/domain setup.

## Risks and Concerns

### 1. OpenAPI $ref resolution complexity
The spec uses `$ref` extensively for headers, schemas, and even response structures. A naive parser won't resolve nested `$ref` chains. Risk: the API reference page shows raw `$ref` strings instead of resolved content.

**Mitigation**: Use `@apidevtools/swagger-parser` (or `@redocly/openapi-core` since Redocly is already a devDependency) for reliable dereferencing before passing data to templates. Alternatively, use `redocly bundle` CLI to produce a dereferenced single-file spec as a build step.

### 2. Design system CSS is duplicated in two forms
The design system exists as both `src/design-system.css` (the source file) and `src/design-system.js` (a JS string export for the Worker). The docs site should consume the `.css` file directly. But if someone changes `.js` without updating `.css` (or vice versa), drift occurs.

**Mitigation**: This is a pre-existing problem (the style guide acknowledges it). The docs site should read from `design-system.css` as the canonical source. If the team later automates generation of the `.js` from the `.css`, the docs site benefits automatically.

### 3. Large OpenAPI spec may produce long API reference page
The spec is ~2800 lines with 11 path entries. Rendering all endpoints on a single page should be fine (this is smaller than most API docs). But if it grows significantly, a single-page approach could become unwieldy.

**Mitigation**: Start with single-page + in-page TOC. 11ty pagination could split it into per-endpoint pages later if needed, using the same data pipeline.

### 4. Cloudflare Pages build environment constraints
Cloudflare Pages has a specific build environment (Node version, available tools). The build must work in that environment, not just locally.

**Mitigation**: Pin Node version in `docs-site/package.json` engines field. Keep dependencies minimal (11ty + yaml + one syntax highlight plugin). Test the build in CI before deploying.

### 5. Mobile sidebar navigation without JavaScript
A sidebar that collapses on mobile typically requires JS for a hamburger toggle. Without JS, the options are `<details>/<summary>` (works but less polished) or showing the sidebar above content on mobile (stacks vertically).

**Mitigation**: Use `<details>/<summary>` wrapped in a `@media` query. On desktop, the sidebar is always visible. On mobile, it collapses into a toggleable `<details>` element. This is native HTML, no JS needed, and works everywhere.

### 6. Content staleness
Guide content (getting-started, auth, verification) can drift from the actual API behavior if not updated when the API changes.

**Mitigation**: The API reference is auto-generated from `openapi.yaml` so it stays current by definition. For prose guides, the CI workflow triggering on `openapi.yaml` changes provides a signal. Consider adding a comment in each guide noting which spec version it covers.

## Additional Agents Needed

**iac-minion** -- Already included per the prompt list. Needed for:
- Cloudflare Pages project creation and configuration
- Custom domain DNS records (CNAME for `docs.webresourceledger.com` or similar)
- Cloudflare API token with Pages deployment permissions for the CI workflow

**user-docs-minion** -- Already included. Critical for:
- Writing the actual content of the guide pages (getting-started, auth, verification, MCP, batch)
- Ensuring the content is accurate, task-oriented, and covers the right user journeys

None beyond what is already planned. The current specialist set (frontend, api-spec, iac, user-docs, ux-strategy) covers all aspects of this task.
