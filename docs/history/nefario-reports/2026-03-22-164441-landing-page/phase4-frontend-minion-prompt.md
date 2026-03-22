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

### ADVISORY: Accessibility fixes (from Phase 3.5 review)

**CRITICAL -- these must be implemented:**

1. **Skip link :focus reveal**: The `.sr-only` class hides the skip link permanently. Add a `:focus` style that makes it visible:
```css
.skip-link:focus {
  position: fixed;
  top: var(--space-2);
  left: var(--space-2);
  z-index: 9999;
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary);
  color: var(--color-primary-text);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  text-decoration: none;
  clip: auto;
  width: auto;
  height: auto;
  overflow: visible;
  white-space: nowrap;
}
```

2. **Focus indicators on dark backgrounds**: The design system's `.btn:focus-visible` uses `--color-primary` (#2a3444) as outline color. In the hero and footer (which use --color-primary as background), this outline is invisible. Override for buttons/links in dark sections:
```css
.hero .btn:focus-visible,
.site-footer a:focus-visible {
  outline-color: var(--color-primary-text);
}
```

3. **Nav and footer link touch targets**: Plain `<a>` elements in the nav and footer need explicit padding for 24x24px minimum target size:
```css
.site-header nav a {
  padding: var(--space-2) var(--space-3);
}
.site-footer nav a {
  padding: var(--space-2) var(--space-3);
}
```

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
4 cards:

- **Legal Evidence**: "Web pages change. Screenshots get challenged. When opposing counsel asks 'how do you know this page said that on that date?' -- you need more than a PNG. WRL captures produce cryptographically signed bundles with independent timestamps. The verification link works for anyone, including the court."

- **Compliance Archiving**: "Regulatory audits require evidence that your web-facing content met requirements on specific dates. WRL provides timestamped, tamper-evident records of any public web page. Each capture is independently verifiable -- your auditor can check it without trusting your internal systems."

- **AI Agent Grounding**: "When an AI agent reports what a web page contains, the claim is only as good as the source. WRL's MCP server and REST API let agents capture pages and produce signed evidence of what they observed. Ground agent outputs in verifiable snapshots, not ephemeral browser sessions."

- **Journalism and Research**: "Sources go offline. Pages get edited. WRL preserves the original with cryptographic proof of when it was captured. Share the verification link with editors, fact-checkers, or readers -- the evidence speaks for itself."

**Pricing:**
3 tiers -- Explore (Free, "Coming soon" badge), Evidence (Pro, "Coming soon" badge), On-Premise (Enterprise, "Contact us").
- Explore: "Get started with the API. Includes rate-limited captures and full verification access. No credit card required."
- Evidence: "For teams that need reliable capture volume, priority processing, and extended retention. Usage-based pricing, billed monthly."
- On-Premise: "Deploy WRL on your own infrastructure. Your keys, your storage, your evidence chain. Custom SLAs and volume pricing available."
- Footer note below pricing grid: "Pricing is coming. The API is available now."

**Footer:**
- Dark bg (same --color-primary as hero)
- Logo wordmark: "Web Resource Ledger"
- Links: Docs | Web UI | API Reference | GitHub | Terms | Content Policy
  - Docs -> https://docs.webresourceledger.com
  - Web UI -> https://wrl.benpeter.workers.dev/ui (ADVISORY: lucy identified missing web UI link)
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

**JSON-LD (2 blocks in <head>):**

Block 1 -- Organization:
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Web Resource Ledger",
  "alternateName": "WRL",
  "url": "https://webresourceledger.com/",
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
  "url": "https://webresourceledger.com/",
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
    "url": "https://webresourceledger.com/"
  }
}
```
ADVISORY: seo-minion noted URLs must use trailing slash to match canonical. All URLs above now include trailing slash.

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
    <lastmod>2026-03-22</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```
ADVISORY: seo-minion noted sitemap should include lastmod. Added with today's date.

### Visual design (from ux-design-minion)

**Color scheme:**
- Hero and footer: dark bg using `--color-primary` (#2a3444) with `--color-primary-text` (#f8f8fa) -- ~11:1 contrast ratio
- Content sections: alternating white (`--color-surface`) and muted (`--color-surface-muted`) backgrounds
- This creates a dark-light-dark visual rhythm

**Typography:**
- System font stack (already in design system) -- no web fonts
- Hero h1: fluid clamp(), approximately 2.5rem to 3.5rem
- Section h2s: fluid clamp(), approximately 1.75rem to 2.25rem
- Use `--weight-medium` (600) for body text in dark sections
- Hero h1 constrained to `max-width: 20ch`

**Layout:**
- Mobile-first, 3 breakpoints: 768px (tablet), 1024px (desktop)
- Max-width container: 1120px, centered with `margin: 0 auto`
- Sticky header with 4 nav links (no hamburger -- 4 links wrap gracefully)
- Steps: 1-col mobile -> 3-col at 1024px
- Use cases: 1-col mobile -> 2x2 at 768px -> 4-across at 1024px
- Pricing: 1-col mobile -> 3-across at 768px
- Featured pricing card (Evidence tier): accent border + badge via CSS pseudo-element

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
- Do NOT create files outside the `landing/` directory.
- Do NOT create an OG image -- that is deferred.
- Do NOT promise specific prices in visible content or structured data.
- Do NOT add analytics, tracking scripts, or third-party resources.
- Do NOT use a hamburger menu or CSS-only nav toggle.

### Reference files to read
- `src/design-system.css` -- available tokens and components
- `site/css/docs.css` -- example of a consuming stylesheet (pattern reference only)
- `site/assets/logo-w-check.svg` -- the logo SVG (reference for dimensions/viewBox)
- `site/assets/favicon.svg` -- the favicon SVG (reference)
- Full product-marketing copy at: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase2-product-marketing-minion.md
- Full UX design specs at: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase2-ux-design-minion.md

### Performance targets
- Lighthouse Performance >= 95
- Lighthouse Accessibility >= 90
- Total CSS size (design-system.css + landing.css) under 10 KB
- Zero network requests beyond the HTML, 2 CSS files, and 2 SVG assets
- Page must load in < 1s on a 3G connection
