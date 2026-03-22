## Delegation Plan

**Team name**: wrl-landing-page
**Description**: Static landing page for Web Resource Ledger at webresourceledger.com -- HTML/CSS, brand design system, Cloudflare Workers Static Assets deployment with CI.

### Conflict Resolutions

**1. Standalone HTML vs 11ty integration**

Chosen: Standalone `landing/` directory with Workers Static Assets.
Over: 11ty integration (ux-design-minion recommendation).
Why: The landing page is a single HTML file on a different domain (`webresourceledger.com` vs `docs.webresourceledger.com`). CLAUDE.md mandates KISS and "minimize code and dependencies actively." Coupling a zero-dependency HTML file to an 11ty build pipeline with npm, link checking, and Lighthouse CI adds operational complexity for zero benefit. The docs site has its own deploy cycle, dependencies, and failure modes -- the landing page should not be gated behind them. Both iac-minion and ux-design-minion acknowledged this argument; ux-design-minion's own risk #5 noted "if using 11ty" as conditional. Workers Static Assets follows the exact same deployment pattern as the docs site (`wrangler deploy` from a subdirectory) while keeping the landing page independent.

**2. Pricing structured data**

Chosen: Omit `offers` array from SoftwareApplication JSON-LD.
Over: Include placeholder prices ($0, $29) in structured data (seo-minion initial spec).
Why: product-marketing-minion recommends "Coming soon" badges, not specific prices. seo-minion explicitly warned that Google penalizes structured data that doesn't match visible content. Since pricing is placeholder, omit Offers from JSON-LD entirely. Add when billing ships.

**3. OG image generation**

Chosen: Defer OG image to follow-up (add to backlog).
Over: Create OG image in this phase.
Why: Generating a 1200x630 PNG requires either a design tool or a headless browser conversion step -- both add scope to what should be a minimal static page task. The landing page works without it (social shares just show text preview). This is a should-have, not a blocker. Record as backlog item.

**4. File paths**

Per standalone decision, all landing page files live under `landing/`:
- `landing/wrangler.toml` -- checked in
- `landing/_headers` -- checked in
- `landing/public/index.html` -- checked in (the page itself)
- `landing/public/css/landing.css` -- checked in (landing-specific styles)
- `landing/public/robots.txt` -- checked in
- `landing/public/sitemap.xml` -- checked in
- `landing/public/404.html` -- checked in
- `landing/public/css/design-system.css` -- NOT checked in (copied from `src/` at CI time)
- `landing/public/assets/logo-w-check.svg` -- NOT checked in (copied from `site/assets/` at CI time)
- `landing/public/assets/favicon.svg` -- NOT checked in (copied from `site/assets/` at CI time)

---

### Task 1: Landing page HTML and CSS
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This is the primary deliverable -- the entire landing page content, structure, SEO markup, and visual design. All other tasks depend on it. Hard to revise if the structure is wrong.
- **Gate rationale**: |
    Chosen: Single standalone HTML file with separate landing.css, consuming design-system.css tokens
    Over: 11ty template integration; React/framework approach
    Why: KISS principle -- zero dependencies, zero build step, one HTML file, one CSS file
- **Prompt**: |
    ## Task: Build the WRL landing page (HTML + CSS)

    Create the static landing page for Web Resource Ledger at webresourceledger.com.
    This is a standalone HTML file with a separate CSS file, no JavaScript, no build tools, no frameworks.

    ### File structure

    Create these files:

    1. `landing/public/index.html` -- the complete landing page
    2. `landing/public/css/landing.css` -- all landing-page-specific styles
    3. `landing/public/404.html` -- simple 404 page using the same design system
    4. `landing/public/robots.txt` -- crawlability directives
    5. `landing/public/sitemap.xml` -- single-URL sitemap

    The HTML file loads two stylesheets:
    ```html
    <link rel="stylesheet" href="/css/design-system.css">
    <link rel="stylesheet" href="/css/landing.css">
    ```

    `design-system.css` is NOT in this directory at dev time -- it lives at `src/design-system.css` and is copied into place during CI. For local development, the developer copies it manually. Do NOT create a copy of design-system.css in the landing directory.

    ### Design system context

    Read `src/design-system.css` for available tokens and components. Key reusable elements:
    - All color tokens (neutrals, brand, semantic)
    - Typography tokens (font stacks, scale up to --text-2xl, weights, line heights)
    - Spacing scale (--space-1 through --space-12)
    - `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--ghost` button classes
    - `.card` base class (white surface + border + radius)
    - `.sr-only` screen reader utility

    What is MISSING from the design system that landing.css must define:
    - Larger type sizes for hero headline (use fluid clamp() values)
    - Larger spacing for section padding (--space-16, --space-20, --space-24)
    - `.btn--lg` variant (larger CTA buttons)
    - `.btn--inverse` variant (ghost button on dark backgrounds)
    - Container, header, hero, section, grid, and footer layout styles

    Define landing-specific custom properties in landing.css under `:root` with a comment block. Do NOT add tokens to design-system.css.

    ### HTML structure

    Semantic HTML5 with proper accessibility:

    ```
    <html lang="en">
    <head> -- full meta tags, JSON-LD, OG/Twitter, stylesheets
    <body>
      <a class="sr-only skip-link" href="#content">Skip to content</a>
      <header> -- sticky nav with logo + 4 anchor links (How It Works, Use Cases, Pricing, Docs)
      <main id="content">
        <section class="hero"> -- dark bg (--color-primary), h1, tagline, 2 CTAs
        <section id="how-it-works"> -- 3-step ordered list (Capture, Sign, Verify)
        <section id="use-cases"> -- 4-card grid (Legal, Compliance, AI Agents, Journalism)
        <section id="pricing"> -- 3-tier grid (Explore, Evidence, On-Premise)
      </main>
      <footer> -- dark bg matching hero, links, copyright
    </body>
    ```

    Accessibility requirements:
    - Single `<h1>` in the hero section
    - All section headings are `<h2>`, sub-items `<h3>` -- no skipped levels
    - `aria-labelledby` on each `<section>` tied to its heading
    - Skip link targeting `#content` (the `<main>`)
    - Logo image is decorative (`aria-hidden="true"`, empty `alt=""`)
    - Nav elements have distinct `aria-label` values ("Main" and "Footer")
    - Steps use `<ol>` (ordered list) since sequence matters
    - Step numbers are `aria-hidden="true"` (list order conveys sequence)
    - `scroll-margin-top` on sections to clear the sticky header (~5rem)
    - All interactive elements have minimum 44x44px touch targets (already met by `.btn`)

    ### Content (from product-marketing-minion)

    **Hero:**
    - h1: "Web evidence you can prove."
    - Value prop: "Capture any web page and get back a signed, timestamped bundle that anyone can independently verify -- no account, no trust required."
    - Primary CTA: "Read the docs" -> https://docs.webresourceledger.com
    - Secondary CTA: "See how it works" -> #how-it-works (ghost button, inverse for dark bg)

    **How It Works (3 steps):**
    1. **Capture** -- "Submit a URL. WRL renders the page in a headless browser, captures a screenshot, the rendered HTML, and HTTP headers -- recording what the page looked like at that moment."
    2. **Sign** -- "Every artifact is hashed, bundled into a WACZ archive, and signed with Ed25519. An independent RFC 3161 timestamp from a third-party authority anchors the capture to a specific point in time."
    3. **Verify** -- "Share the verification link with anyone. They can confirm the content has not been altered and the timestamp is authentic -- no account needed, no trust in you required."

    **Use Cases:**
    Section heading: "Built for teams who need proof, not promises."
    4 cards: Legal Evidence, Compliance Archiving, AI Agent Grounding, Journalism and Research.
    Use the copy from the product-marketing-minion contribution (read the full file at the scratch path for exact text).

    **Pricing:**
    3 tiers -- Explore (Free, "Coming soon" badge), Evidence (Pro, "Coming soon" badge), On-Premise (Enterprise, "Contact us").
    - Explore: "Get started with the API. Includes rate-limited captures and full verification access. No credit card required."
    - Evidence: "For teams that need reliable capture volume, priority processing, and extended retention. Usage-based pricing, billed monthly."
    - On-Premise: "Deploy WRL on your own infrastructure. Your keys, your storage, your evidence chain. Custom SLAs and volume pricing available."
    - Footer note below pricing grid: "Pricing is coming. The API is available now."

    **Footer:**
    - Dark bg (same --color-primary as hero)
    - Logo wordmark: "Web Resource Ledger"
    - Links: Docs | API Reference | GitHub | Terms | Content Policy
      - Docs -> https://docs.webresourceledger.com
      - API Reference -> https://docs.webresourceledger.com/api-reference/
      - GitHub -> https://github.com/benpeter/web-resource-ledger
      - Terms -> https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md
      - Content Policy -> https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md
    - One-liner: "Open source under Apache 2.0. Independently verifiable by design."
    - Copyright: "2026 Web Resource Ledger"

    ### SEO / Meta tags (from seo-minion)

    **Title:** `Web Resource Ledger -- Cryptographic Evidence of Web Content`

    **Meta description:** `Capture web pages with Ed25519 signatures and RFC 3161 timestamps. Screenshots, rendered HTML, and signed WACZ bundles anyone can independently verify. Free tier available.`

    **Canonical:** `https://webresourceledger.com/`

    **Robots:** `index, follow`

    **Open Graph tags:**
    ```html
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://webresourceledger.com/">
    <meta property="og:title" content="Web Resource Ledger -- Cryptographic Evidence of Web Content">
    <meta property="og:description" content="Capture web pages with Ed25519 signatures and RFC 3161 timestamps. Screenshots, rendered HTML, and signed WACZ bundles anyone can independently verify.">
    <meta property="og:site_name" content="Web Resource Ledger">
    ```
    Note: Omit og:image tags -- OG image deferred to follow-up.

    **Twitter Card tags:**
    ```html
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Web Resource Ledger -- Cryptographic Evidence of Web Content">
    <meta name="twitter:description" content="Capture web pages with Ed25519 signatures and RFC 3161 timestamps. Proof anyone can verify.">
    ```
    Note: Use `summary` (not `summary_large_image`) since there is no OG image.

    **JSON-LD (2 blocks in <head>):**

    Block 1 -- Organization + WebSite (can be combined or separate):
    ```json
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Web Resource Ledger",
      "alternateName": "WRL",
      "url": "https://webresourceledger.com",
      "logo": "https://webresourceledger.com/assets/logo-w-check.svg",
      "sameAs": ["https://github.com/benpeter/web-resource-ledger"],
      "contactPoint": {
        "@type": "ContactPoint",
        "url": "https://github.com/benpeter/web-resource-ledger/issues",
        "contactType": "technical support"
      }
    }
    ```

    Block 2 -- SoftwareApplication (NO offers array -- pricing is placeholder):
    ```json
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Web Resource Ledger",
      "alternateName": "WRL",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Web",
      "description": "Cryptographic evidence of web content. Capture what a page looked like, when, with proof anyone can verify.",
      "url": "https://webresourceledger.com",
      "featureList": [
        "Ed25519 digital signatures",
        "RFC 3161 timestamps",
        "WACZ evidence bundles",
        "Public verification URLs",
        "REST API and MCP server",
        "Cookie consent dismissal"
      ],
      "license": "https://github.com/benpeter/web-resource-ledger/blob/main/LICENSE",
      "isAccessibleForFree": true,
      "author": {
        "@type": "Organization",
        "name": "Web Resource Ledger",
        "url": "https://webresourceledger.com"
      }
    }
    ```

    **robots.txt:**
    ```
    User-agent: *
    Allow: /

    Sitemap: https://webresourceledger.com/sitemap.xml
    ```

    **sitemap.xml:**
    ```xml
    <?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://webresourceledger.com/</loc>
        <changefreq>monthly</changefreq>
        <priority>1.0</priority>
      </url>
    </urlset>
    ```

    ### Visual design (from ux-design-minion)

    **Color scheme:**
    - Hero and footer: dark bg using `--color-primary` (#2a3444) with `--color-primary-text` (#f8f8fa) -- ~11:1 contrast ratio
    - Content sections: alternating white (`--color-surface`) and muted (`--color-surface-muted`) backgrounds
    - This creates a dark-light-dark visual rhythm

    **Typography:**
    - System font stack (already in design system) -- no web fonts
    - Hero h1: fluid clamp(), approximately 2.5rem to 3.5rem
    - Section h2s: fluid clamp(), approximately 1.75rem to 2.25rem
    - Use `--weight-medium` (600) for body text in dark sections (thin weights appear lighter on dark backgrounds due to subpixel rendering)
    - Hero h1 constrained to `max-width: 20ch` to prevent line length blowout

    **Layout:**
    - Mobile-first, 3 breakpoints: 768px (tablet), 1024px (desktop)
    - Max-width container: 1120px, centered with `margin: 0 auto`
    - Sticky header with 4 nav links (no hamburger -- 4 links wrap gracefully)
    - Steps: 1-col mobile -> 3-col at 1024px
    - Use cases: 1-col mobile -> 2x2 at 768px -> 4-across at 1024px
    - Pricing: 1-col mobile -> 3-across at 768px
    - Featured pricing card: accent border + "Most Popular" badge via CSS pseudo-element

    **Smooth scrolling:**
    ```css
    @media (prefers-reduced-motion: no-preference) {
      html { scroll-behavior: smooth; }
    }
    ```

    **No decorative illustrations.** Visual interest comes from: dark/light rhythm, alternating section backgrounds, step number circles, featured pricing card accent border, typography.

    ### What NOT to do
    - Do NOT add JavaScript. Zero JS files, zero inline scripts (except JSON-LD which is not executable).
    - Do NOT add web fonts. System font stack only.
    - Do NOT modify `src/design-system.css`. Landing-specific tokens go in landing.css.
    - Do NOT create files outside the `landing/` directory (except the shared .gitignore update, which is a separate task).
    - Do NOT create an OG image -- that is deferred.
    - Do NOT promise specific prices in visible content or structured data.
    - Do NOT add analytics, tracking scripts, or third-party resources.
    - Do NOT use a hamburger menu or CSS-only nav toggle.
    - Do NOT import or reference any 11ty templates, Nunjucks files, or docs site resources.

    ### Reference files to read
    - `src/design-system.css` -- available tokens and components
    - `site/css/docs.css` -- example of a consuming stylesheet (for pattern reference only)
    - `site/_headers` -- security headers pattern reference
    - `site/assets/logo-w-check.svg` -- the logo SVG (reference only; will be copied at CI time)
    - `site/assets/favicon.svg` -- the favicon (reference only; will be copied at CI time)

    ### Performance targets
    - Lighthouse Performance >= 95
    - Lighthouse Accessibility >= 90
    - Total CSS size (design-system.css + landing.css) under 10 KB
    - Zero network requests beyond the HTML, 2 CSS files, and 2 SVG assets
    - Page must load in < 1s on a 3G connection

- **Deliverables**: `landing/public/index.html`, `landing/public/css/landing.css`, `landing/public/404.html`, `landing/public/robots.txt`, `landing/public/sitemap.xml`
- **Success criteria**: |
    - Valid HTML5 (no parsing errors)
    - Correct heading hierarchy: one h1, sequential h2/h3, no skipped levels
    - All sections have aria-labelledby
    - Skip link present and functional
    - All text/background color pairs meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
    - Responsive at 320px, 768px, 1024px, 1440px -- no horizontal overflow
    - All interactive elements >= 44x44px touch targets
    - Zero JavaScript
    - JSON-LD validates (no offers array)
    - robots.txt and sitemap.xml syntactically correct

### Task 2: Deployment infrastructure
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Create deployment infrastructure for the WRL landing page

    Set up Cloudflare Workers Static Assets deployment for the landing page at webresourceledger.com. This follows the same pattern as the existing docs site deployment.

    ### Files to create

    1. **`landing/wrangler.toml`**

    ```toml
    name = "wrl-landing"
    compatibility_date = "2026-03-13"

    [assets]
    directory = "./public"
    not_found_handling = "404-page"

    routes = [
      { pattern = "webresourceledger.com", custom_domain = true }
    ]
    ```

    Model this after `site/wrangler.toml` (the docs site). `not_found_handling = "404-page"` serves `404.html` for missing paths.

    2. **`landing/_headers`**

    ```
    /*
      X-Content-Type-Options: nosniff
      X-Frame-Options: DENY
      Referrer-Policy: no-referrer
      Content-Security-Policy: default-src 'self'; style-src 'self'; img-src 'self'; font-src 'none'; script-src 'none'
      Strict-Transport-Security: max-age=31536000; includeSubDomains
      Cache-Control: public, max-age=3600, s-maxage=86400
    ```

    CSP is tighter than the docs site: `script-src 'none'` (no JS on landing page), `font-src 'none'` (system fonts only). Added `Cache-Control` for returning visitor performance.

    3. **`.github/workflows/deploy-landing.yml`**

    GitHub Actions workflow to deploy on push to main. Follow the exact patterns from `deploy-docs.yml`:
    - Same pinned action SHAs (checkout, setup-node, wrangler-action)
    - Same `permissions`, `timeout-minutes: 5`, `environment: production`
    - Path triggers: `landing/**`, `src/design-system.css`, `site/assets/logo-w-check.svg`, `site/assets/favicon.svg`
    - Asset assembly step: copies `src/design-system.css` -> `landing/public/css/`, `site/assets/logo-w-check.svg` -> `landing/public/assets/`, `site/assets/favicon.svg` -> `landing/public/assets/`
    - No separate npm install for landing/ -- wrangler comes from root `npm ci`
    - `wrangler deploy` from the `landing/` working directory

    ```yaml
    name: Deploy Landing Page

    on:
      push:
        branches: [main]
        paths:
          - 'landing/**'
          - 'src/design-system.css'
          - 'site/assets/logo-w-check.svg'
          - 'site/assets/favicon.svg'
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
              cp site/assets/favicon.svg landing/public/assets/favicon.svg

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

    4. **Update `.gitignore`** -- Add entries for CI-assembled assets that should not be tracked:

    ```
    # Landing page CI-assembled assets
    landing/public/css/design-system.css
    landing/public/assets/
    ```

    ### Context
    - Read `site/wrangler.toml` for the pattern
    - Read `.github/workflows/deploy-docs.yml` for the CI pattern
    - Read `site/_headers` for the security headers pattern
    - Read `.gitignore` for the existing ignore patterns

    ### DNS notes
    The `custom_domain = true` route tells Cloudflare to auto-create the DNS record and SSL cert. The domain's DNS is already on Cloudflare (zone ID 9b1b321a3921da4741063f25d6935a74). No manual DNS setup needed.

    The first deploy must be done manually (`wrangler deploy` from `landing/`) to register the Worker and custom domain. Subsequent deploys are automated.

    ### What NOT to do
    - Do NOT create a Worker script -- this is pure static asset serving
    - Do NOT add preview deploy configuration (can be added later if needed)
    - Do NOT modify any existing workflows or wrangler configs
    - Do NOT set up www redirect (document it as a follow-up in the backlog)

- **Deliverables**: `landing/wrangler.toml`, `landing/_headers`, `.github/workflows/deploy-landing.yml`, updated `.gitignore`
- **Success criteria**: |
    - wrangler.toml valid TOML with correct custom_domain route
    - _headers file has all required security headers including tight CSP
    - Workflow triggers on correct paths, uses pinned action SHAs matching existing workflows
    - .gitignore prevents CI-assembled assets from being tracked

### Task 3: Evolution log
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Write evolution log entries for the landing page phase

    The evolution log directory `docs/evolution/0052-landing-page/` already exists with `prompt.md`. Write the remaining entries.

    ### Files to create

    1. **`docs/evolution/0052-landing-page/decisions.md`**

    Document these key decisions:
    - **Standalone vs 11ty integration**: Chose standalone `landing/` directory with Workers Static Assets over integrating into the 11ty docs site build. The landing page is on a different domain, has zero dependencies, and should not be gated behind the docs site's build pipeline (npm, 11ty, link checking, Lighthouse). KISS principle prevails.
    - **No OG image in this phase**: Deferred to follow-up. Generating a 1200x630 PNG adds scope; the page works without it (social shares show text preview).
    - **Pricing as placeholder**: "Coming soon" badges, no specific prices. Offers omitted from JSON-LD to avoid Google structured data mismatch penalties.
    - **No JavaScript**: Zero JS on the landing page. Smooth scrolling via CSS `scroll-behavior`, step numbers via HTML, "Most Popular" badge via CSS pseudo-element. CSP enforces `script-src 'none'`.
    - **System fonts only**: No web fonts. Zero FOIT/FOUT, zero font requests, best possible Lighthouse performance.

    2. **`docs/evolution/0052-landing-page/outcome.md`**

    Summarize what was produced:
    - 5 landing page files (index.html, landing.css, 404.html, robots.txt, sitemap.xml)
    - 4 infrastructure files (wrangler.toml, _headers, deploy-landing.yml, .gitignore update)
    - Deployed at webresourceledger.com via Workers Static Assets
    - SEO: JSON-LD (Organization, SoftwareApplication without Offers), OG/Twitter meta tags (without image), canonical, sitemap
    - Responsive: 3 breakpoints (768px, 1024px), max-width 1120px container
    - Accessibility: skip link, aria-labelledby, heading hierarchy, 44px touch targets

    Include a "Backlog changes" section noting:
    - Added: OG image creation for social sharing
    - Added: www.webresourceledger.com redirect rule
    - Added: docs.webresourceledger.com sitemap.xml generation

    3. **Update `docs/evolution/README.md`** -- Add the 0052-landing-page entry.

    4. **Update `docs/backlog.md`** -- Add the three follow-up items above under a suitable section.

    ### What NOT to do
    - Do NOT write process.md -- that is written after PR creation by the orchestrator session
    - Do NOT modify prompt.md -- it already exists

- **Deliverables**: `docs/evolution/0052-landing-page/decisions.md`, `docs/evolution/0052-landing-page/outcome.md`, updated `docs/evolution/README.md`, updated `docs/backlog.md`
- **Success criteria**: |
    - decisions.md captures all five key decisions with rationale and rejected alternatives
    - outcome.md summarizes deliverables and lists backlog changes
    - README.md includes the new entry in correct order
    - backlog.md includes the three follow-up items

---

### Cross-Cutting Coverage

- **Testing**: Covered by Phase 6 (post-execution). HTML validation, Lighthouse perf/a11y checks, heading hierarchy validation. No dedicated execution task needed -- the landing page is static HTML/CSS with no logic to unit test.
- **Security**: Covered within Task 2 (security headers, tight CSP with `script-src 'none'`). Also reviewed in Phase 3.5 by security-minion. No auth, no user input, no secrets in the landing page.
- **Usability -- Strategy**: Addressed in Task 1 prompt via product-marketing-minion's messaging hierarchy and ux-design-minion's visual design decisions. Reviewed in Phase 3.5 by ux-strategy-minion.
- **Usability -- Design**: Addressed in Task 1 prompt via ux-design-minion's complete CSS specifications (breakpoints, grids, contrast pairs, touch targets). Reviewed in Phase 3.5 by ux-design-minion.
- **Documentation**: Task 3 covers evolution log. Phase 8 handles any additional documentation needs.
- **Observability**: Not applicable -- this is a static HTML page with no server-side logic, no API endpoints, and no runtime components. Cloudflare provides built-in analytics for Workers Static Assets if needed later.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - accessibility-minion: The landing page is a web-facing HTML UI that end users interact with. WCAG compliance review is warranted before implementation.
    Review focus: Heading hierarchy, color contrast pairs, landmark structure, touch target sizes, skip link implementation, smooth scroll motion preferences.
  - seo-minion: The landing page is the SEO anchor for the entire domain. JSON-LD, meta tags, and heading strategy need validation.
    Review focus: JSON-LD schema correctness (especially the Offers omission), meta tag completeness, canonical URL, heading keyword strategy.
- **Not selected**:
  - ux-design-minion: The full CSS specification from planning is already embedded in Task 1's prompt. A separate review would duplicate planning output. The accessibility-minion covers the WCAG-critical aspects.
  - sitespeed-minion: The page is 2 CSS files + 1 HTML file + 2 SVGs with zero JS and zero web fonts. Lighthouse performance >= 95 is virtually guaranteed. No performance budget review needed for a page this minimal.
  - observability-minion: No runtime components. Static asset serving on Cloudflare with no server-side logic.
  - user-docs-minion: The landing page IS the user-facing documentation for the product's marketing. No separate user docs needed for a landing page.

### Decisions

- **Standalone deployment over 11ty integration**
  Chosen: Separate `landing/` directory with Workers Static Assets, independent deploy cycle
  Over: 11ty integration via `layouts/landing.njk` in the docs site (ux-design-minion)
  Why: Different domain, zero dependencies, CLAUDE.md mandates KISS. Coupling to 11ty build pipeline adds npm, link checking, and Lighthouse CI as failure modes for a single HTML file.

- **Omit pricing Offers from JSON-LD**
  Chosen: SoftwareApplication schema without `offers` array
  Over: Include placeholder prices in structured data (seo-minion initial spec)
  Why: product-marketing says "Coming soon" badges; seo-minion warns Google penalizes structured data / visible content mismatch. Add offers when billing ships.

- **Defer OG image**
  Chosen: Ship without OG image, add to backlog
  Over: Generate OG image in this phase (seo-minion recommendation)
  Why: Adds scope (design tool or headless browser conversion) to a minimal static page task. Social shares work with text-only preview. Ship the page, add the image in a follow-up.

- **Two tasks + docs instead of many small tasks**
  Chosen: One task for all HTML/CSS/SEO content, one for all infra, one for docs
  Over: Separate tasks per specialist domain (8 iac tasks, 7 ux-design tasks, 6 seo tasks, 6 marketing tasks)
  Why: This is a single HTML file and a single CSS file. Splitting into 27 tasks would create more coordination overhead than the work itself. One agent builds the page with all specialist guidance baked into the prompt.

### Risks and Mitigations

1. **DNS conflict on first deploy.** If an existing DNS record for `webresourceledger.com` (apex) exists, the `custom_domain` route may conflict. **Mitigation:** Check current DNS state before first manual deploy. Remove conflicting records if present.

2. **CLOUDFLARE_API_TOKEN scope.** The existing token may not have permissions for a new Worker (`wrl-landing`). **Mitigation:** Verify token scope before first CI deploy. Expand if needed.

3. **Design system CSS breaking changes.** Landing page depends on `src/design-system.css`. A breaking change could break the landing page. **Mitigation:** Path triggers in the workflow ensure the landing page redeploys when design-system.css changes. Landing.css uses only stable CSS custom properties, not internal class names.

4. **Mixed audience tension.** The page serves developers and non-technical audiences (legal, compliance). **Mitigation:** Copy uses accessible language with technical terms as credibility anchors. Visual design avoids both "developer tool" terminal aesthetic and generic SaaS marketing.

5. **Pre-1.0 honesty.** The product is pre-1.0 with placeholder pricing. **Mitigation:** "Coming soon" badges on pricing tiers, "Pricing is coming. The API is available now." footer note. No specific prices in structured data.

### Execution Order

```
Batch 1 (parallel: nothing blocked):
  Task 1: Landing page HTML and CSS [APPROVAL GATE]

Batch 2 (blocked by Task 1):
  Task 2: Deployment infrastructure

Batch 3 (blocked by Task 1 + Task 2):
  Task 3: Evolution log

Post-execution:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (Lighthouse perf >= 95, a11y >= 90)
  Phase 8: Documentation assessment
```

### Verification Steps

After all tasks complete and post-execution phases pass:

1. **Local preview**: Open `landing/public/index.html` in a browser with `design-system.css` copied into place. Verify all sections render correctly.
2. **Responsive check**: Test at 320px, 768px, 1024px, 1440px viewport widths.
3. **Lighthouse audit**: Run Lighthouse on the local file. Performance >= 95, Accessibility >= 90.
4. **HTML validation**: Run through the W3C HTML validator. Zero errors.
5. **JSON-LD validation**: Paste the page source into schema.org validator. All blocks valid, no offers present.
6. **Deploy**: First manual deploy via `wrangler deploy` from `landing/`. Verify https://webresourceledger.com loads correctly with SSL.
7. **Headers check**: `curl -I https://webresourceledger.com` -- verify all security headers present including `script-src 'none'` in CSP.
8. **404 page**: Visit https://webresourceledger.com/nonexistent -- verify 404.html renders.
9. **CI test**: Push a trivial change to `landing/` on main. Verify deploy-landing.yml triggers and succeeds.
