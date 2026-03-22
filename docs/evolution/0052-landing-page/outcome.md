# Outcome: R23 Landing Page

## What Was Produced

A complete static landing page for WRL at `webresourceledger.com`, built with
plain HTML/CSS (zero JavaScript, zero web fonts, zero third-party resources)
and deployed via Cloudflare Workers Static Assets.

### Page Structure

Single-page layout with five sections and a footer:

1. **Hero** -- tagline, one-sentence value proposition, primary CTA (Try it free),
   secondary CTA (Read the docs). Large type, centered, no background image.
2. **How it works** -- three-step visual flow: Capture, Sign, Verify. Each step
   has an icon, title, and two-sentence description.
3. **Use cases** -- four cards: legal evidence, compliance archiving, AI agent
   web grounding, journalism source preservation.
4. **Pricing** -- three tier cards: Free (1,000 captures/month), Pro ($49/month),
   Enterprise (custom). Labeled as illustrative pending R29 (billing).
5. **Footer** -- links to docs, web UI, GitHub, terms, privacy.

### Supporting Files

| File | Lines | Notes |
|------|-------|-------|
| `landing/public/index.html` | 253 | Complete landing page |
| `landing/public/css/landing.css` | 563 | Landing-specific styles extending design-system.css |
| `landing/public/404.html` | 72 | 404 page using same design system |
| `landing/public/robots.txt` | 4 | Crawlability directives |
| `landing/public/sitemap.xml` | 9 | Single-URL sitemap pointing to canonical URL |
| `landing/wrangler.toml` | -- | Workers Static Assets config, custom domain route |
| `.github/workflows/deploy-landing.yml` | -- | CI pipeline with design-system.css asset copy |

### Quality Properties

**SEO**: Two JSON-LD structured data blocks (`SoftwareApplication` +
`Organization`), Open Graph tags, Twitter Card tags, canonical URL,
`robots.txt` allowing all crawlers, single-URL sitemap. `Offers` array
omitted from JSON-LD pending real pricing (see decisions.md).

**Accessibility**: Skip-to-content link with focus reveal, correct heading
hierarchy (single `h1`, `h2` sections, `h3` cards), `aria-labelledby` on
landmark sections, sufficient focus indicators on dark backgrounds,
minimum 44px touch targets on all interactive elements. Targets WCAG AA.

**Performance**: No JavaScript, no web fonts, no third-party requests.
Single external CSS dependency (`design-system.css` copied at CI time).
No render-blocking resources. Target: Lighthouse performance >= 95.

**Responsive**: Mobile-first with breakpoints at 768px (tablet) and 1024px
(desktop). How-it-works and use-case grids collapse to single column on mobile.
Nav links wrap gracefully; no JS hamburger needed.

### Design System Integration

`landing.css` imports `design-system.css` token values via CSS custom property
inheritance. No modifications were made to `src/design-system.css`. Landing-specific
additions (`--text-hero`, `--space-16/20/24` spacing scale, `btn--lg`, `btn--outline`,
`btn--inverse`, `.pricing-card--featured`) are declared in `landing.css` under `:root`.

## What Deviated from the Plan

The original issue specified Cloudflare Pages as the deployment target. Cloudflare
Pages was deprecated in April 2025. Workers Static Assets was used instead --
consistent with the same decision made in Phase 0051 (docs site).

## Known Issues / Follow-up

- **OG image absent**: `og:image` and `twitter:image` tags are not present.
  Social share cards will use platform defaults. Tracked as follow-up (see
  Backlog Changes below).
- **`--color-text-muted` contrast**: The shared token `#6e6a66` achieves
  approximately 4.0:1 on white, which is borderline WCAG AA for normal text.
  The docs site (Phase 0051) resolved this with a docs-local CSS override
  (`--color-text-muted-docs: #5a5650`). The landing page does not yet apply
  an equivalent override. Tracked as follow-up.
- **DNS and custom domain verification**: `webresourceledger.com` custom domain
  routing on the Workers Static Assets service requires manual verification
  after first deploy. The `www.webresourceledger.com` redirect also needs
  verification in the Cloudflare dashboard.

## Issues Created

None during this phase.

## Backlog Changes

- **Marked done**: R23 Landing page (added to Done section; was tracked in
  GitHub Issue #100 but not previously listed in `backlog.md`)
- **Added to Parking Lot (Product Features)**:
  - `[consider] OG image for landing page` -- when visual design is considered final
  - `[consider] Verify --color-text-muted contrast on landing page` -- apply
    docs-style local override (`--color-text-muted-landing`) when a11y audit runs
