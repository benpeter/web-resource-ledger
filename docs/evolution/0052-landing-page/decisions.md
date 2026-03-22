# Decisions: R23 Landing Page

## Deployment: Standalone `landing/` Directory vs 11ty Integration

**Chosen**: Standalone `landing/` directory with Cloudflare Workers Static Assets, no build step beyond file copying
**Over**: Integrating into the existing 11ty docs site (`site/`) as a `landing.njk` template
**Why**: The landing page targets a different domain (`webresourceledger.com`) than the docs site (`docs.webresourceledger.com`). Sharing the 11ty build would couple their deployment pipelines and require the landing page to pull all of 11ty's dependencies. Plain HTML needs no build system -- the only "build" is copying `src/design-system.css` into `landing/public/css/` during CI. Decoupled deployment means the landing can ship without touching docs infrastructure, and vice versa.

## CSS Architecture: Separate `landing.css` vs Extending `design-system.css`

**Chosen**: Separate `landing.css` with landing-specific tokens (`--text-hero`, `--space-16/20/24`, `btn--lg`, `btn--outline`, `btn--inverse`) declared under `:root`
**Over**: Adding landing-specific tokens directly to `src/design-system.css`
**Why**: The design system stays minimal and generic -- it defines the visual foundation shared across all WRL surfaces (web UI, docs site, landing). Landing-specific needs (oversized hero type, extra spacing scales, pricing card variants) don't belong in a shared system. A landing page is a surface, not a system component. The correct pattern is `design-system.css` imported first, `landing.css` extending it for the specific surface.

## Pricing Structured Data: Omit `Offers` Array from JSON-LD

**Chosen**: Omit `Offers` array from the `SoftwareApplication` JSON-LD block
**Over**: Including placeholder pricing (e.g., "$0/month") in structured data
**Why**: Pricing tiers in the HTML are illustrative placeholders -- real pricing does not exist until the billing system (R29) ships. Including placeholder values in `application/ld+json` structured data could mislead search engines and create a persistent maintenance obligation. When a search engine caches incorrect pricing data, correcting it takes weeks. The risk is asymmetric: omitting the field costs nothing; including wrong values costs credibility and requires cleanup. OG/Twitter metadata and the `SoftwareApplication` schema are included in full; only the `Offers` sub-type is deferred.

## JavaScript: Zero vs Minimal Progressive Enhancement

**Chosen**: No JavaScript whatsoever (JSON-LD is `type="application/ld+json"`, not executable; CSS `scroll-behavior: smooth` handles anchor navigation)
**Over**: Smooth scroll polyfill for Safari <15, intersection observer for scroll-in animations, JS hamburger for mobile nav
**Why**: CSS `scroll-behavior` is supported in all modern browsers and covers the use case. Nav items wrap gracefully at narrow widths without a hamburger -- the nav is simple enough that wrapping is acceptable. No animations were in scope. Zero JS enables `script-src 'none'` in CSP, eliminates any render-blocking, and removes a whole class of future maintenance burden. The docs site made an exception for copy-to-clipboard (developer-friction justified it); that exception does not apply here.

## OG Image: Deferred vs Placeholder

**Chosen**: Ship without `og:image` tags
**Over**: Generating or commissioning a placeholder OG image
**Why**: A generic placeholder OG image (e.g., the logo on a solid background) is strictly worse than no image -- social platforms will use their own default card rendering, which looks professional. A placeholder image signals low effort and gets cached aggressively, making future replacement slow to propagate. The correct path is to create an intentional OG image when the landing page's visual design is considered final. Tracked as follow-up.
