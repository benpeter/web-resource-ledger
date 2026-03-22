## Delegation Plan

**Team name**: docs-site
**Description**: Build a static documentation site for WRL deployed on Cloudflare Workers Static Assets at docs.webresourceledger.com, generated from openapi.yaml and markdown content using 11ty, styled with the WRL brand design system.

### Conflict Resolutions

Before the task list, documenting the three conflicts raised in the meta-plan:

**Conflict 1: OpenAPI rendering approach**
- frontend-minion: 11ty build-time parsing with Nunjucks templates (custom $ref resolution, full visual control, zero client-side JS)
- api-spec-minion: redocly build-docs with Handlebars template (already a devDep, 2ms build, ReDoc sidebar)

**Resolution: 11ty build-time parsing.** Rationale: (1) ReDoc ships ~250 KiB of client-side JS which violates the "no JS framework" constraint and the project's performance philosophy; (2) ReDoc's internal styling uses styled-components with generated class names, making brand-consistent theming fragile; (3) 11ty templates produce plain HTML/CSS output with full control over markup, accessibility, and design system token usage; (4) the spec is small (14 operations) so custom rendering is feasible; (5) `@redocly/cli` is still used for its actual strength -- `redocly lint` and `redocly bundle` for $ref resolution as a build-time preprocessing step, not for HTML generation.

**Conflict 2: Sidebar order**
- ux-strategy: Getting Started > Auth > API Reference > Verification > Batch > MCP
- user-docs: Getting Started > Auth > Verification > Batch > MCP > API Reference

**Resolution: user-docs-minion's order** (Getting Started > Auth > Verification > Batch > MCP > API Reference). Rationale: API Reference is a lookup resource, not a learning step. Placing it last follows the Divio framework: tutorials and how-tos precede reference material. The verification guide is a natural progression from auth (you authenticated, now you can verify), and batch/MCP are workflow extensions. Putting API Reference between auth and verification breaks the learning journey.

**Conflict 3: Homepage**
- ux-strategy: Getting Started IS the homepage (no landing page)
- user-docs: Minimal landing/hub page as wayfinding

**Resolution: Getting Started as the homepage.** ux-strategy's JTBD analysis is correct -- a hub page is a zero-value interstitial for a 6-page site. The Getting Started page opens with a one-sentence product description and a "What's next" section at the bottom provides the wayfinding that a hub page would offer. This eliminates one unnecessary click for every first-time visitor.

---

### Task 1: Scaffold 11ty project and CSS layer
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This establishes the directory structure, build toolchain, and CSS foundation that every subsequent task depends on. Wrong decisions here cascade to all downstream work.
- **Gate rationale**:
    Chosen: 11ty v3 in `site/` with design-system.css copied at build time and docs-specific CSS extensions
    Over: (a) Plain HTML with no generator (too much duplication), (b) Redocly build-docs for the whole site (ships client-side JS, limited brand control)
    Why: 11ty produces zero client-side JS by default, has first-class markdown/Nunjucks support, and lets us use the design system tokens directly in CSS without fighting a third-party rendering engine
- **Prompt**: |
    You are building the foundation for WRL's documentation site. Create a complete 11ty v3 project in `site/` at the repo root.

    ## What to build

    **Directory: `site/`** (not `docs-site/` -- avoid collision with existing `docs/` while keeping it short)

    1. **`site/package.json`** -- Separate from root package.json. Dependencies:
       - `@11ty/eleventy` (v3.x, ESM)
       - `@11ty/eleventy-plugin-syntaxhighlight` (PrismJS at build time)
       - `yaml` (already a devDep in root, but needed here for the OpenAPI data pipeline)
       - `@apidevtools/swagger-parser` (for OpenAPI $ref dereferencing)
       Scripts: `"build": "eleventy"`, `"serve": "eleventy --serve"`

    2. **`site/eleventy.config.js`** (ESM) -- Configure:
       - Input: `site/content`, Output: `site/_output`
       - Nunjucks as template engine
       - Syntax highlighting plugin
       - Copy `../src/design-system.css` to `_output/css/design-system.css` via addPassthroughCopy or a `before` event
       - Copy `site/css/` to `_output/css/`
       - Copy `site/assets/` to `_output/assets/`

    3. **`site/_data/site.js`** -- Global data: site title ("WRL Documentation"), base URL, nav items array:
       ```
       [
         { title: "Getting Started", url: "/", active: true },
         { title: "Authentication", url: "/authentication/" },
         { title: "Verification", url: "/verification/" },
         { title: "Batch Captures", url: "/batch/" },
         { title: "MCP Server", url: "/mcp/" },
         { title: "API Reference", url: "/api-reference/" }
       ]
       ```

    4. **`site/_includes/layouts/base.njk`** -- HTML shell:
       - `<!DOCTYPE html>`, `<html lang="en">`
       - `<head>` with charset, viewport, title, description meta, CSS links (design-system.css, docs.css, prism-wrl.css)
       - Skip-to-content link as first focusable element (use `.sr-only` class, visible on `:focus`)
       - Two-column grid layout: sidebar + main content
       - Sidebar: `<nav aria-label="Documentation">` with links from `site.nav`, marking current page with `aria-current="page"`
       - Main: `<main id="content">` wrapping `{{ content | safe }}`
       - On mobile (<768px): sidebar uses `<details><summary>Menu</summary>...</details>` pattern (no JS)
       - `<footer>` with link to GitHub repo

    5. **`site/_includes/layouts/doc.njk`** -- Extends base. Wraps content in `<article class="docs-prose">`.

    6. **`site/css/docs.css`** -- Documentation-specific styles. ALL values must reference design system tokens (no hardcoded colors/sizes). Include:
       - `.docs-layout` -- CSS Grid: `grid-template-columns: 240px 1fr`, single column below 768px
       - `.docs-sidebar` -- sticky, full height, `--color-surface` bg, `--color-border` right edge, overflow-y auto
       - `.docs-sidebar a` -- block display, padding, left border indicator for active state using `--color-primary`
       - `.docs-prose` -- typography: h1/h2/h3 sizing, paragraph spacing, list styles, link colors, inline code styling
       - `.method-badge` -- inline-block badges for HTTP methods (GET=info, POST=success, DELETE=error, OPTIONS=muted)
       - `.docs-endpoint` -- card-like container for API reference entries
       - `.docs-content` -- `max-width: 42rem` for optimal line length, responsive padding
       - Mobile `<details>` styling for sidebar

    7. **`site/css/prism-wrl.css`** -- Syntax highlighting theme using design system tokens:
       - `.token.comment` -> `--color-text-muted`
       - `.token.keyword` -> `--color-accent`
       - `.token.string` -> `--color-success-text`
       - `.token.number` -> `--color-error`
       - `.token.property` -> `--color-primary`

    8. **`site/assets/`** -- Copy from `src/assets/`: `favicon.svg`, `logo-w-check.svg`

    9. **`site/content/index.md`** -- Minimal placeholder with frontmatter (`layout: layouts/doc.njk`, `title: Getting Started`). Content: "Getting Started content goes here." (user-docs-minion will write real content in a later task)

    10. **`site/_headers`** -- Cloudflare security headers:
        ```
        /*
          X-Content-Type-Options: nosniff
          X-Frame-Options: DENY
          Referrer-Policy: no-referrer
        ```

    11. **Root `.gitignore`** -- Add `site/_output/` entry

    12. **Root `package.json`** -- Add script: `"build:docs": "cd site && npm run build"`

    ## Accessibility requirements (baked into the HTML from the start)
    - Semantic HTML: `<nav>`, `<main>`, `<article>`, `<aside>`, `<header>`, `<footer>`
    - Skip-to-content link
    - `aria-label` on nav elements
    - Strict heading hierarchy (h1 > h2 > h3)
    - `<html lang="en">`
    - Focus-visible indicators (already in design system)
    - **Contrast fix**: The design system's `--color-text-muted` (#6e6a66) on `--color-bg` (#f7f6f5) is ~3.5:1, which fails WCAG AA for normal text. In `docs.css`, define `--color-text-muted-docs: #5a5650` and use this for any muted body text in the docs. Do NOT modify `design-system.css` -- this is a docs-local override.

    ## What NOT to do
    - Do NOT add any client-side JavaScript. The copy-to-clipboard and hamburger menu patterns use `<details>/<summary>` and are CSS-only.
    - Do NOT use Swagger UI, ReDoc, or any client-side API renderer.
    - Do NOT modify the root `package.json` beyond adding the `build:docs` script.
    - Do NOT touch any files in `src/` except reading `design-system.css` and copying assets.
    - Do NOT create content pages beyond the placeholder `index.md` -- content is a separate task.

    ## File context you will need
    - `src/design-system.css` -- the design system tokens and component classes
    - `package.json` -- root package.json (to add `build:docs` script)
    - `.gitignore` -- to add `site/_output/`

    ## Success criteria
    - `cd site && npm install && npm run build` produces a working `_output/` directory
    - The generated HTML has correct semantic structure, skip link, sidebar nav
    - All CSS values reference design system tokens
    - No client-side JavaScript in the output
    - The placeholder page renders correctly with sidebar navigation

- **Deliverables**: Complete `site/` directory scaffold with 11ty config, layouts, CSS, assets; updated root `.gitignore` and `package.json`
- **Success criteria**: `cd site && npm install && npm run build` succeeds and produces valid HTML with correct semantic structure and design system styling

### Task 2: Build OpenAPI data pipeline and API reference page
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are building the OpenAPI-to-HTML rendering pipeline for WRL's documentation site. The site scaffold exists in `site/` (from Task 1). Your job is to parse `openapi.yaml` at build time and generate a static API reference page.

    ## What to build

    1. **`site/_data/api.js`** -- Global 11ty data file that:
       - Reads `../../openapi.yaml` (the spec is at the repo root)
       - Uses `@apidevtools/swagger-parser` to dereference all `$ref` pointers (the spec uses them extensively for headers, schemas, responses)
       - Returns a structured object: `{ info, servers, tags, paths, securitySchemes }` where `paths` is organized by tag for template iteration
       - Each path entry includes: method, path, operationId, summary, description, parameters, requestBody (with schema and examples), responses (with schemas and examples), security requirements

    2. **`site/_includes/partials/endpoint.njk`** -- Renders a single API endpoint:
       - Method badge (`.method-badge--get`, `.method-badge--post`, etc.)
       - Path in monospace
       - Description paragraph
       - Auth requirement indicator (which security scheme, or "None" for health)
       - Parameters table (if any): name, location (path/query/header), required, type, description
       - Request body: schema as a property table, example JSON in a code block
       - Response codes: for each response status, description + schema table + example JSON
       - Use `<details>` for lengthy response schemas (progressive disclosure)

    3. **`site/_includes/partials/schema-table.njk`** -- Renders a JSON schema as an HTML table:
       - Columns: Property, Type, Required, Description
       - Handle nested objects by indenting property names
       - Handle `oneOf`/`anyOf` by listing alternatives
       - Handle arrays by showing `array of <itemType>`

    4. **`site/content/api-reference.njk`** -- The API reference page:
       - Frontmatter: `layout: layouts/doc.njk`, `title: API Reference`, `description: Complete endpoint reference for the WRL API`
       - Groups endpoints by tag (health, captures, verification, signing, admin) using `<h2>` per tag group
       - Uses `endpoint.njk` partial for each operation
       - Includes the `servers` information at the top (base URLs for production/staging)
       - Includes authentication overview (links to the Auth guide for details)

    ## Design system components to use
    - `.table` for parameter and schema tables
    - `.code-block` for JSON examples
    - `.method-badge` variants (defined in `site/css/docs.css`)
    - `.badge` for auth requirement indicators
    - `.disclosure` / `<details>` for collapsible sections
    - `.alert--info` for notes about specific endpoints

    ## What NOT to do
    - Do NOT use Swagger UI, ReDoc, or any client-side renderer
    - Do NOT commit generated HTML -- the API reference is built from `openapi.yaml` at build time
    - Do NOT modify `openapi.yaml` (the servers block fix is a separate task)
    - Do NOT write content for the other guide pages -- only the API reference

    ## File context you will need
    - `openapi.yaml` -- the OpenAPI 3.1 spec (2,868 lines, 14 operations, 5 tags)
    - `site/css/docs.css` -- available CSS classes
    - `site/_includes/layouts/doc.njk` -- the layout template
    - `src/design-system.css` -- design system token reference

    ## Success criteria
    - `npm run build` in `site/` produces an `api-reference/index.html` page
    - All 14 operations are rendered with correct method badges, paths, descriptions
    - All $ref pointers are resolved (no raw `$ref` strings in output)
    - Schema tables show property names, types, required flags, descriptions
    - Examples from the spec are rendered in code blocks
    - Endpoints are grouped by tag with correct heading hierarchy (h1 page title > h2 tag group > h3 endpoint)

- **Deliverables**: `site/_data/api.js`, `site/_includes/partials/endpoint.njk`, `site/_includes/partials/schema-table.njk`, `site/content/api-reference.njk`
- **Success criteria**: API reference page renders all 14 operations from openapi.yaml with resolved schemas and examples

### Task 3: Write documentation content (all guide pages)
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: Content quality and accuracy determine whether the docs site achieves its core goal (new user from API key to verified capture in 5 minutes). Content errors in auth or verification guides could cause real user confusion. 5 downstream tasks depend on this content being correct.
- **Gate rationale**:
    Chosen: Task-first content organized by user journey (Getting Started as homepage, three-persona auth, two-layer verification)
    Over: (a) Feature-first organization mirroring API structure, (b) Single comprehensive page covering all topics
    Why: User-docs-minion's Divio-framework approach ensures each page serves a specific information need; progressive disclosure keeps crypto depth accessible without alienating non-technical users
- **Prompt**: |
    You are writing the content for WRL's documentation site. The 11ty scaffold exists in `site/` with layout templates, sidebar navigation, and CSS styling already in place. Your job is writing the markdown content for all 6 guide pages.

    ## Pages to write

    All pages use frontmatter: `layout: layouts/doc.njk`, `title`, `description`.

    ### 1. `site/content/index.md` -- Getting Started (THIS IS THE HOMEPAGE)

    This page serves as both homepage and getting started tutorial. It is the most important page.

    Structure:
    - **One-sentence opener**: "WRL captures web pages with cryptographic proof of authenticity -- Ed25519 signatures and RFC 3161 timestamps that anyone can independently verify."
    - **Prerequisites**: API key (link to Auth guide), curl or HTTP client, Node.js 20+ (for verification step only), a URL to capture
    - **Step 1: Capture a page** -- `POST /v1/captures` with curl example, show the 202 response JSON with `id` and `statusUrl`
    - **Step 2: Check the result** -- `GET /v1/captures/{id}` with curl example, show the completed response with artifact links. Collapse the polling lifecycle into "wait a few seconds and check the status URL". The polling pattern details belong in the API Reference, not here.
    - **Step 3: Verify the evidence** -- `npx @w-r-l/verify <capture-url>` with example output showing all checks passing. End with: "You just captured a web page with cryptographic proof. The Ed25519 signature and RFC 3161 timestamp prove this content existed at this moment -- and anyone can verify it."
    - **What's next**: Cards/links to Auth (manage keys), Verification (understand the trust model), MCP (use with AI agents), API Reference (full endpoint details)

    Time budget: under 1 minute of hands-on time, well within the 5-minute ceiling.

    Use `https://wrl.example.com` as the placeholder host in all curl examples. Use `YOUR_API_KEY` for the placeholder key.

    ### 2. `site/content/authentication.md` -- Authentication

    Three-persona structure:

    **Section 1: "Using Your API Key"** (most users)
    - Set as `Authorization: Bearer YOUR_API_KEY`
    - Scopes table: `capture` (implies `read`), `read`, `admin`
    - Endpoint-to-scope matrix showing which endpoints need which scope

    **Section 2: "Managing API Keys (Operators)"**
    - Admin key concept (ADMIN_KEY secret, set via wrangler)
    - Create keys: `POST /v1/admin/keys` with curl example + response
    - List keys: `GET /v1/admin/keys` with curl example
    - Revoke keys: `DELETE /v1/admin/keys/{keyHash}` with curl example
    - Key rotation pattern: create new, distribute, revoke old

    **Section 3: "Legacy Single-Key Mode"**
    - CAPTURE_API_KEY as static bearer token
    - When tenant keys are enabled, legacy mode is disabled
    - Brief migration guidance: "We recommend migrating to per-tenant keys."
    - Keep this section short and use a `<details>` element (collapsible)

    ### 3. `site/content/verification.md` -- Verification

    Two-layer progressive disclosure:

    **Primary layer: "How to verify"** (all users)
    - CLI: `npx @w-r-l/verify capture.wacz --origin https://your-wrl.example.com`
    - Online: `GET /v1/verify?url=<wacz-url>` (the web-based verification endpoint)
    - Checks table from verify package README: what each check means in plain language
    - What PASS means, what FAIL means

    **Secondary layer: "Under the hood"** (collapsible `<details>`)
    - Ed25519 signatures: what they prove (operator signed this), what they don't (operator trustworthiness). 2-3 paragraphs, no elliptic curve math.
    - RFC 3161 timestamps: what they prove (independent time confirmation), why they matter (no backdating), TSA identity (DigiCert). 2-3 paragraphs.
    - WACZ bundle structure: contents (datapackage.json, artifacts, signatures array), hash chain diagram. Simple ASCII or description.
    - Key rotation: old captures continue to verify. `/.well-known/signing-keys` endpoint. 1 paragraph.

    ### 4. `site/content/batch.md` -- Batch Captures

    Two patterns:

    **Pattern 1: Submit and poll**
    - `POST /v1/captures/batch` with urls array, curl example
    - Parse the 207 Multi-Status response: check each item's status
    - Poll each accepted capture individually
    - Complete end-to-end example: 2-URL batch, 207 response, polling follow-up

    **Pattern 2: Error handling**
    - Per-item failures (422 for private IPs, 429 for rate limits)
    - Whole-batch failures (401, 400, 503)
    - Rate limit behavior: tokens consumed per URL, not per request

    ### 5. `site/content/mcp.md` -- MCP Server

    Adapt the existing `docs/mcp.md` content. Do NOT copy-paste -- rewrite for the docs site audience and format.

    - Value proposition opener: "Any MCP-compatible agent can capture web pages and verify evidence without writing HTTP client code."
    - Setup by client: Claude Code, Cursor, Windsurf, generic MCP client
    - Available tools: `capture_page`, `get_capture`, `list_captures`, `verify_capture`, `batch_capture` -- with parameter tables
    - Tutorial walkthrough: capture-and-verify in 3 tool calls
    - Example agent workflows:
      - "Before deploying, capture the current production page for evidence"
      - "Verify a capture was not tampered with before citing it"
      - "Capture multiple pages for a compliance audit" (links to Batch guide)
    - Troubleshooting section (adapted from existing docs/mcp.md)

    ### 6. `site/content/api-reference.njk` -- SKIP THIS. Already built by the OpenAPI pipeline in Task 2.

    ## Content style guidelines
    - Use `https://wrl.example.com` as the example hostname (matches OpenAPI spec convention)
    - Use `YOUR_API_KEY` and `YOUR_ADMIN_KEY` as placeholder values
    - Use `CAPTURE_ID` for capture identifiers
    - Request/response examples: show the curl command, then the JSON response, both in fenced code blocks with language labels (`bash`, `json`)
    - Cross-link between pages: "For details, see [Authentication](/authentication/)" -- use relative paths
    - Write in second person ("you") and present tense
    - Be specific: name exact endpoints, exact fields, exact status codes
    - Use `.alert` callout syntax for important notes (use whatever 11ty shortcode or markdown extension is configured, or plain blockquotes with **Note:** prefix)

    ## File context you will need
    - `openapi.yaml` -- the source of truth for all endpoint details, request/response schemas, and examples
    - `docs/mcp.md` -- existing MCP documentation (adapt, don't copy)
    - `README.md` -- existing usage section (the Getting Started guide should be more detailed, not a copy)
    - `packages/verify/README.md` -- verify CLI documentation and checks table
    - `src/auth.js` -- authentication implementation details (scopes, key validation)
    - `src/admin.js` -- admin key management implementation

    ## What NOT to do
    - Do NOT write the API Reference page (it is auto-generated from openapi.yaml)
    - Do NOT modify any source code or configuration files
    - Do NOT create a separate landing page -- Getting Started IS the homepage (index.md)
    - Do NOT duplicate content that belongs in the API Reference -- link to it instead
    - Do NOT explain elliptic curve cryptography math in the verification guide

    ## Success criteria
    - Getting Started guide walks from API key to verified capture in 3 steps, under 5 minutes
    - All curl examples use correct endpoints, headers, and realistic (but placeholder) data
    - Auth guide covers all three modes with correct scope information
    - Verification guide explains the trust model without requiring crypto expertise
    - MCP guide covers setup for 3+ clients with tool parameter tables
    - Batch guide includes a complete 2-URL end-to-end example
    - Cross-links between pages are correct and bidirectional

- **Deliverables**: `site/content/index.md`, `site/content/authentication.md`, `site/content/verification.md`, `site/content/batch.md`, `site/content/mcp.md`
- **Success criteria**: All 5 content pages written with accurate, task-oriented content that cross-links correctly

### Task 4: Infrastructure -- Workers Static Assets, deploy workflow, CI updates
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are setting up the deployment infrastructure for WRL's documentation site. The site is built with 11ty in `site/` and outputs static HTML/CSS to `site/_output/`. Your job is to configure Cloudflare Workers Static Assets for deployment and create the CI workflow.

    ## What to build

    ### 1. `site/wrangler.toml` -- Docs Worker configuration

    ```toml
    name = "wrl-docs"
    compatibility_date = "2026-03-13"

    [assets]
    directory = "./_output"

    routes = [
      { pattern = "docs.webresourceledger.com", custom_domain = true }
    ]
    ```

    No `main` entry point -- Workers Static Assets serves files automatically when no Worker code is specified.

    ### 2. `.github/workflows/deploy-docs.yml` -- Deploy workflow

    Triggers:
    - Push to `main` with path filter: `site/**`, `openapi.yaml`, `src/design-system.css`
    - `workflow_dispatch` for manual deploys

    Single job: build + deploy
    - `actions/checkout` (same pin as existing workflows: `@11bd71901bbe5b1630ceea73d27597364c9af683`)
    - `actions/setup-node` (same pin: `@49933ea5288caeca8642d1e84afbd3f7d6820020`) with `node-version-file: '.nvmrc'`
    - `npm ci` (root, to get the `build:docs` script)
    - `cd site && npm ci` (site deps)
    - `npm run build:docs` (runs 11ty build)
    - `cloudflare/wrangler-action` (same pin: `@da0e0dfe58b7a431659754fdf3f186c529afbe65`) with:
      - `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`
      - `workingDirectory: site`
      - `command: deploy`

    Permissions: `contents: read`, `deployments: write`
    Timeout: 5 minutes

    Important: Use `environment: production` to access the `CLOUDFLARE_API_TOKEN` secret (check existing `deploy-production.yml` for the pattern).

    ### 3. Update CI docs-skip pattern in `ci.yml`

    Both the `test` and `test-integration` jobs have a grep pattern that skips tests for docs-only changes:
    ```bash
    grep -qvE '\.md$|^docs/'
    ```

    Update to also exclude the `site/` directory:
    ```bash
    grep -qvE '\.md$|^docs/|^site/'
    ```

    This ensures changes to docs site templates, CSS, or config don't trigger Worker tests.

    ### 4. Update `openapi.yaml` servers block

    Replace placeholder URLs with real ones:
    ```yaml
    servers:
      - url: https://wrl.benpeter.workers.dev
        description: Production
      - url: https://wrl-staging.benpeter.workers.dev
        description: Staging
    ```

    ## What NOT to do
    - Do NOT use Cloudflare Pages (deprecated April 2025) -- use Workers Static Assets
    - Do NOT use `wrangler pages deploy` -- use `wrangler deploy`
    - Do NOT integrate docs deployment into the existing staging/production pipeline
    - Do NOT modify the site build output or 11ty configuration
    - Do NOT create Terraform files -- the Worker is created automatically on first `wrangler deploy`

    ## File context you will need
    - `.github/workflows/ci.yml` -- existing CI workflow (to update docs-skip pattern)
    - `.github/workflows/deploy-staging.yml` -- reference for action pins and secret names
    - `.github/workflows/deploy-production.yml` -- reference for environment configuration
    - `package.json` -- root package.json (has `build:docs` script from Task 1)
    - `openapi.yaml` -- servers block to update
    - `wrangler.toml` -- existing Worker config (DO NOT modify -- the docs Worker has its own wrangler.toml in `site/`)

    ## Infrastructure notes
    - Cloudflare account ID: available in existing wrangler.toml
    - Zone: webresourceledger.com (zone ID: 9b1b321a3921da4741063f25d6935a74)
    - The custom domain route in wrangler.toml should auto-create the DNS record on first deploy
    - HTTPS is handled automatically by Cloudflare Universal SSL
    - The CLOUDFLARE_API_TOKEN secret already exists and should have account-level Workers permissions

    ## Success criteria
    - `site/wrangler.toml` is valid and configures `wrl-docs` Worker with static assets
    - `deploy-docs.yml` triggers only on docs-relevant file changes
    - `deploy-docs.yml` uses the same action pins and secret names as existing workflows
    - CI docs-skip pattern excludes `site/` changes from Worker tests
    - `openapi.yaml` servers block has real URLs

- **Deliverables**: `site/wrangler.toml`, `.github/workflows/deploy-docs.yml`, updated `ci.yml`, updated `openapi.yaml` servers block
- **Success criteria**: Deployment pipeline is configured and CI correctly skips Worker tests for docs-only changes

### Task 5: Accessibility audit and final polish
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2, Task 3
- **Approval gate**: no
- **Prompt**: |
    You are performing the final accessibility audit and polish on WRL's documentation site. All content pages, the API reference, and the CSS are in place. Your job is to verify the site meets Lighthouse accessibility >= 90 and fix any issues.

    ## What to audit and fix

    1. **Build the site**: `cd site && npm install && npm run build`

    2. **HTML validation** across all pages in `site/_output/`:
       - Heading hierarchy: h1 > h2 > h3 with no skipped levels
       - Landmark regions: `<nav>`, `<main>`, `<article>`, `<footer>` all present
       - Skip-to-content link is first focusable element
       - All images have `alt` attributes (logo SVGs get descriptive alt, decorative icons get `aria-hidden="true"`)
       - `<html lang="en">` is set
       - All links have descriptive text (no "click here")
       - `<nav aria-label="Documentation">` on sidebar

    3. **Color contrast**:
       - Verify that `--color-text-muted-docs` (should be ~#5a5650) achieves 4.5:1 contrast on `--color-bg` (#f7f6f5)
       - Verify all method badge color combinations pass WCAG AA
       - Verify link colors pass WCAG AA on both `--color-bg` and `--color-surface`

    4. **Keyboard navigation**:
       - Tab through all pages: skip link > sidebar links > content links > footer
       - Focus indicators visible on all interactive elements
       - `<details>` elements keyboard-accessible

    5. **Mobile responsive**:
       - Sidebar collapses correctly at <768px
       - Content is readable without horizontal scrolling (except code blocks)
       - Touch targets are at least 44x44px

    6. **Code block accessibility**:
       - `<pre><code>` semantic elements
       - Horizontal scroll for long lines (not wrapping)
       - Sufficient contrast for syntax highlighting tokens

    7. **Fix any issues found**. Common fixes:
       - Add missing ARIA attributes
       - Fix heading hierarchy violations
       - Adjust contrast values
       - Add skip link if missing
       - Fix focus order

    8. **Add a copy-to-clipboard button** as progressive enhancement:
       - Small JS snippet (~15 lines) in a `<script>` tag in the base layout
       - Adds "Copy" button to each `.code-block` element
       - Uses `navigator.clipboard.writeText()`
       - Only appears if Clipboard API is available (progressive enhancement)
       - Button has `aria-label="Copy code to clipboard"`
       - This is the ONLY client-side JavaScript on the site

    ## What NOT to do
    - Do NOT rewrite content -- only fix accessibility issues in the HTML structure
    - Do NOT add a JavaScript framework or library
    - Do NOT change the information architecture or navigation order
    - Do NOT modify `design-system.css`

    ## File context you will need
    - `site/_output/` -- the built site (all HTML files)
    - `site/css/docs.css` -- docs-specific CSS to fix contrast issues
    - `site/_includes/layouts/base.njk` -- base template to fix structural issues
    - `site/_includes/layouts/doc.njk` -- doc template
    - `site/_includes/partials/*.njk` -- partials for API reference

    ## Success criteria
    - All pages have correct heading hierarchy
    - All semantic landmarks present
    - Skip-to-content link works
    - All color combinations meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
    - Keyboard navigation works end-to-end
    - Copy-to-clipboard button works as progressive enhancement
    - No accessibility errors in axe-core/Lighthouse automated checks

- **Deliverables**: Fixed accessibility issues across all templates and CSS; copy-to-clipboard progressive enhancement
- **Success criteria**: Lighthouse accessibility score >= 90 on all pages

### Task 6: README cross-link update
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 3
- **Approval gate**: no
- **Prompt**: |
    You are adding documentation site cross-links to WRL's README. The docs site will be at https://docs.webresourceledger.com.

    ## What to do

    1. **Add a docs site link** after the project description (near the top of README.md):
       "For comprehensive guides on authentication, verification, batch captures, and MCP integration, see [docs.webresourceledger.com](https://docs.webresourceledger.com)."

    2. **Add a callout after the Usage section**: A brief note linking to the full Getting Started guide:
       "> **Detailed guides**: See [Getting Started](https://docs.webresourceledger.com) for a complete walkthrough, or browse the [API Reference](https://docs.webresourceledger.com/api-reference/) for the full endpoint catalog."

    3. **Update the MCP Server section**: Add the docs site link as the primary reference:
       "See the [MCP Server Guide](https://docs.webresourceledger.com/mcp/) for setup instructions and example workflows."
       Keep the existing `docs/mcp.md` link as a secondary reference.

    ## What NOT to do
    - Do NOT rewrite or restructure the README
    - Do NOT remove existing content -- only add links
    - Do NOT duplicate docs site content in the README

    ## File context
    - `README.md` -- the file to update

    ## Success criteria
    - Docs site link appears near the top of the README
    - Usage section links to Getting Started guide
    - MCP section links to the docs site MCP guide

- **Deliverables**: Updated `README.md` with docs site cross-links
- **Success criteria**: README links to docs site in 3 locations without restructuring existing content

---

### Cross-Cutting Coverage

- **Testing** (test-minion): Not included as a dedicated execution task. The site is static HTML/CSS with no runtime logic beyond a 15-line copy-to-clipboard script. Test coverage is handled by: (1) the build succeeding (`npm run build`), (2) Lighthouse accessibility audit in Task 5, (3) Phase 6 post-execution test validation. Including a test-minion task for a static site would be over-engineering.
- **Security** (security-minion): Not included as a dedicated execution task. The site serves static HTML with no user input, no authentication, no server-side logic. Security headers are configured in Task 1 (`_headers` file). Phase 3.5 architecture review includes security-minion to validate this assessment.
- **Usability -- Strategy** (ux-strategy-minion): Covered. ux-strategy-minion's planning contributions (sidebar-only nav, Getting Started as homepage, code example patterns, reading experience optimization) are incorporated into Task 1 (scaffold/CSS), Task 3 (content structure), and Task 5 (accessibility audit). Phase 3.5 includes ux-strategy-minion review.
- **Usability -- Design** (ux-design-minion, accessibility-minion): Task 5 covers accessibility audit. The CSS implementation in Task 1 follows ux-strategy's specifications. Phase 3.5 includes accessibility-minion review of the plan.
- **Documentation** (software-docs-minion, user-docs-minion): The entire plan IS documentation. user-docs-minion writes the content (Task 3, Task 6). No separate software-docs task needed -- the docs site itself is the deliverable.
- **Observability** (observability-minion): Not included. Static site with no runtime components, no APIs, no background processes. Cloudflare Workers analytics are built-in and require no configuration.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - accessibility-minion: Plan includes tasks producing web-facing HTML that end users interact with (Tasks 1-5 all produce HTML). WCAG compliance is an explicit success criterion (Lighthouse >= 90).
    Review focus: Verify the plan's accessibility approach (contrast fix, semantic HTML, keyboard nav) is sufficient to achieve Lighthouse >= 90 before implementation.
  - user-docs-minion: Plan's primary output is user-facing documentation that changes what users need to learn.
    Review focus: Verify content architecture decisions (sidebar order, homepage choice, progressive disclosure in verification/auth) serve the target personas.
- **Not selected**:
  - ux-design-minion: The site uses an existing design system with well-defined tokens. Task 1's CSS specifications are detailed enough (token references, component patterns, responsive breakpoints) that a separate design review adds minimal value. The visual implementation is constrained by the design system.
  - observability-minion: Static site with no runtime components. Cloudflare provides built-in analytics. No custom logging, metrics, or tracing to review.
  - sitespeed-minion: The site ships zero client-side JS (except a 15-line clipboard script). Static HTML/CSS served from Cloudflare's edge network. Performance concerns are minimal by construction. Lighthouse performance score will be near-perfect without optimization effort.

### Decisions

- **Directory name: `site/` vs `docs-site/`**
  Chosen: `site/` (shorter, clearer)
  Over: `docs-site/` (frontend-minion's recommendation) -- avoids collision with `docs/` but is verbose
  Why: `docs/` contains evolution logs and internal docs, so a different name is needed. `site/` is shorter, the directory purpose is obvious from its contents, and it matches iac-minion's recommendation.

- **OpenAPI rendering: 11ty templates vs Redocly build-docs**
  Chosen: 11ty build-time parsing with `@apidevtools/swagger-parser` for $ref resolution
  Over: `redocly build-docs` with Handlebars template (api-spec-minion's recommendation)
  Why: ReDoc ships ~250 KiB client-side JS which violates the project's performance philosophy. 11ty produces plain HTML with full design system control. The spec is small enough (14 operations) that custom templates are feasible. Redocly CLI is still used for linting (`redocly lint`) and could be used for bundling if needed.

- **Client-side JavaScript: zero vs minimal**
  Chosen: Copy-to-clipboard as the single progressive enhancement (~15 lines)
  Over: (a) Zero JS (frontend-minion), (b) Copy-to-clipboard + hamburger toggle (ux-strategy-minion)
  Why: Copy-to-clipboard is a must-have for developer docs (ux-strategy correctly identifies it as a friction point developers notice). Mobile sidebar uses CSS-only `<details>/<summary>` instead of JS hamburger, avoiding the need for ARIA state management.

- **Deployment platform: Workers Static Assets vs Cloudflare Pages**
  Chosen: Workers Static Assets with `[assets]` in wrangler.toml
  Over: Cloudflare Pages (frontend-minion's recommendation, deprecated April 2025)
  Why: iac-minion's research confirmed Pages is deprecated. Workers Static Assets uses the same deployment tooling as the existing WRL Worker, keeps the infrastructure consistent, and is forward-looking.

### Risks and Mitigations

1. **OpenAPI $ref resolution complexity** (HIGH) -- The spec uses extensive $ref for headers, schemas, and responses. A naive parser will produce broken output.
   *Mitigation*: Task 2 uses `@apidevtools/swagger-parser` which handles nested $ref chains reliably. The 11ty data file dereferences the entire spec before templates touch it.

2. **`--color-text-muted` contrast failure** (MEDIUM) -- Design system's muted text (#6e6a66 on #f7f6f5) is ~3.5:1, below WCAG AA's 4.5:1 requirement.
   *Mitigation*: Task 1 defines a docs-local override `--color-text-muted-docs: #5a5650` (~4.6:1). This scopes the fix to the docs site without modifying the shared design system.

3. **Workers Static Assets is relatively new** (LOW) -- Became the recommended replacement for Pages in mid-2025. The use case (serve static files) is simple enough to be low-risk.
   *Mitigation*: `workflow_dispatch` trigger allows manual deploys if automation has issues. The first deploy creates the Worker automatically.

4. **Custom domain provisioning** (LOW) -- The `routes` field with `custom_domain = true` should auto-create DNS, but wrangler CLI has historically lagged behind the dashboard for domain management.
   *Mitigation*: If automated provisioning fails, the domain can be added manually via the Cloudflare dashboard. One-time operation.

5. **CLOUDFLARE_API_TOKEN scope** (LOW) -- The existing token must have permission to deploy Workers to the webresourceledger.com zone.
   *Mitigation*: The token is already used for Worker deployments and likely has account-level permissions. Verify before first deploy.

6. **Content staleness over time** (MEDIUM) -- Guide pages (auth, verification) can drift from API behavior.
   *Mitigation*: The API Reference auto-regenerates from openapi.yaml, staying in sync by construction. CI triggers on openapi.yaml changes. For prose guides, the docs build triggering on spec changes provides a signal to review content.

### Execution Order

```
Batch 1 (parallel): Task 1 (scaffold + CSS)
                       |
         +-------------+-------------+
         |             |             |
Batch 2: Task 2       Task 3       Task 4
         (API ref)    (content)    (infra)
         |             |
         +-------------+
               |
Batch 3:    Task 5 (accessibility audit)
               |
Batch 4:    Task 6 (README links)

GATE after Task 1 (scaffold approval)
GATE after Task 3 (content approval)
```

Task 1 is the foundation -- everything depends on it.
Tasks 2, 3, and 4 can run in parallel after Task 1 is approved.
Task 5 requires Tasks 1+2+3 (needs complete site to audit).
Task 6 requires Task 3 (needs content finalized for accurate cross-links).
Task 4 is independent of Tasks 2/3 -- infrastructure can be set up while content is written.

### Verification Steps

After all tasks complete:

1. **Build verification**: `cd site && npm install && npm run build` succeeds without errors
2. **Content completeness**: All 6 pages present in `site/_output/` (index, authentication, verification, batch, mcp, api-reference)
3. **API reference accuracy**: All 14 operations from openapi.yaml rendered with correct methods, paths, schemas, and examples
4. **Cross-link integrity**: All internal links between pages resolve correctly
5. **Accessibility**: Lighthouse accessibility score >= 90 on all pages (run against built output using `npx lighthouse`)
6. **Design system compliance**: All CSS values reference design system tokens (no hardcoded hex values in docs.css)
7. **Deploy readiness**: `site/wrangler.toml` exists with valid configuration; `deploy-docs.yml` has correct triggers and action pins
8. **CI compatibility**: Changes to `site/` do not trigger Worker tests (verify via the updated grep pattern in ci.yml)
9. **README links**: docs.webresourceledger.com linked in 3 locations in README.md
