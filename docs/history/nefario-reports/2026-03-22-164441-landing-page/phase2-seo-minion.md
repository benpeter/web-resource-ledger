# Domain Plan Contribution: seo-minion

## Recommendations

### 1. Structured Data (JSON-LD)

The landing page should include **two** JSON-LD blocks in the `<head>`:

#### Block 1: Organization + WebSite

Establishes WRL as an entity and connects the root domain to its web presence. This is the foundation for Google's Knowledge Panel and sitelinks.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Web Resource Ledger",
  "alternateName": "WRL",
  "url": "https://webresourceledger.com",
  "logo": "https://webresourceledger.com/assets/logo-w-check.svg",
  "sameAs": [
    "https://github.com/benpeter/web-resource-ledger"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "url": "https://github.com/benpeter/web-resource-ledger/issues",
    "contactType": "technical support"
  }
}
```

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Web Resource Ledger",
  "alternateName": "WRL",
  "url": "https://webresourceledger.com"
}
```

#### Block 2: SoftwareApplication with Offers

This is the primary structured data for the product. `SoftwareApplication` is the correct schema.org type for a developer tool/API product. It is eligible for Google rich results (software app cards). Do **not** use `WebAPI` -- it is a schema.org type but not eligible for Google rich results.

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
  "screenshot": "https://webresourceledger.com/assets/og-image.png",
  "offers": [
    {
      "@type": "Offer",
      "name": "Free",
      "price": "0",
      "priceCurrency": "USD",
      "description": "50 captures per month"
    },
    {
      "@type": "Offer",
      "name": "Pro",
      "price": "29",
      "priceCurrency": "USD",
      "priceSpecification": {
        "@type": "UnitPriceSpecification",
        "price": "29",
        "priceCurrency": "USD",
        "billingDuration": "P1M"
      },
      "description": "2,000 captures per month with RFC 3161 timestamps"
    }
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

**Notes on the Offers schema**: The pricing tiers are explicitly placeholder per the project constraints. The JSON-LD `offers` array should be updated when real billing ships (backlog item). The structured data reflects whatever the visible page content shows -- do not include pricing in JSON-LD that is not visible on the page (Google penalizes mismatched structured data).

**Rejected alternatives**:
- `WebAPI` type: Valid schema.org type but no Google rich results. No reason to use it alongside `SoftwareApplication`.
- `Product` type: Intended for physical/purchasable goods. `SoftwareApplication` is more precise for a developer tool and has the same rich result eligibility.
- `Service` type: Too generic. Does not convey that this is a software product.

### 2. Meta Tags

#### Title Tag

```html
<title>Web Resource Ledger -- Cryptographic Evidence of Web Content</title>
```

- 60 characters. Within the 50-60 character target for desktop SERPs.
- Primary keyword phrase: "cryptographic evidence of web content."
- Brand name first (this is the homepage -- brand-first is correct for apex domain).
- The em dash is a standard separator that Google renders cleanly.

#### Meta Description

```html
<meta name="description" content="Capture web pages with Ed25519 signatures and RFC 3161 timestamps. Screenshots, rendered HTML, and signed WACZ bundles anyone can independently verify. Free tier available.">
```

- 159 characters. Within the 150-160 character target.
- Contains the key differentiators (Ed25519, RFC 3161, WACZ).
- Ends with "Free tier available" as a click-through incentive.
- Not a ranking factor, but directly impacts CTR from SERPs.

#### Canonical Tag

```html
<link rel="canonical" href="https://webresourceledger.com/">
```

- Self-canonicalization. Even though this is the only page, the canonical tag prevents Google from treating `https://webresourceledger.com` and `https://webresourceledger.com/` as separate URLs.
- Trailing slash is the canonical form (Cloudflare Workers Static Assets defaults to trailing-slash URLs).

#### Robots Meta Tag

```html
<meta name="robots" content="index, follow">
```

- Explicit index/follow. This is the default, but being explicit prevents ambiguity if a robots.txt is later added with conflicting directives.

### 3. Open Graph and Twitter Card Meta Tags

```html
<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="https://webresourceledger.com/">
<meta property="og:title" content="Web Resource Ledger -- Cryptographic Evidence of Web Content">
<meta property="og:description" content="Capture web pages with Ed25519 signatures and RFC 3161 timestamps. Screenshots, rendered HTML, and signed WACZ bundles anyone can independently verify.">
<meta property="og:image" content="https://webresourceledger.com/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Web Resource Ledger: cryptographic evidence of web content">
<meta property="og:site_name" content="Web Resource Ledger">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Web Resource Ledger -- Cryptographic Evidence of Web Content">
<meta name="twitter:description" content="Capture web pages with Ed25519 signatures and RFC 3161 timestamps. Proof anyone can verify.">
<meta name="twitter:image" content="https://webresourceledger.com/assets/og-image.png">
<meta name="twitter:image:alt" content="Web Resource Ledger: cryptographic evidence of web content">
```

**OG image requirement**: An OG image (`og-image.png`) must be created at 1200x630 pixels, under 5 MB. This is a hard requirement for social sharing appearance. Without it, links shared on LinkedIn, Twitter, Slack, etc. will show a generic text preview. The image should show the WRL logo and tagline against the brand background color (`#2a3444` or `#f7f6f5`). A simple text-on-background card is sufficient -- no need for a complex illustration.

**Note**: The Twitter description is shortened to 120 characters because Twitter truncates longer descriptions. The OG description can be longer (200+ characters) because Facebook renders more text.

### 4. Cross-Subdomain Relationship

The domain structure is:
- `webresourceledger.com` -- landing page (SEO anchor, root domain)
- `docs.webresourceledger.com` -- documentation site (11ty, already deployed)
- `api.webresourceledger.com` -- planned API subdomain (currently `wrl.benpeter.workers.dev`)

#### What to do on the landing page

1. **Link prominently to docs**: The landing page should have clear, crawlable `<a>` links to `docs.webresourceledger.com`. These pass link equity from the root domain to the docs subdomain. Place links in: the primary CTA ("Read the Docs"), the footer, and contextually within use case sections ("See the API Reference").

2. **No hreflang needed**: This is a single-language product (English). No international variants exist.

3. **No cross-subdomain canonical tags**: The landing page and docs site serve different content. They should NOT canonical to each other. Each has its own self-canonical.

4. **robots.txt for the root domain**: Create a minimal `robots.txt` at `https://webresourceledger.com/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://webresourceledger.com/sitemap.xml
```

5. **XML Sitemap for the root domain**: Since this is a single-page site, the sitemap is trivial but still valuable for Google discovery:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.w3.org/2000/svg/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
                            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  <url>
    <loc>https://webresourceledger.com/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

Note: The sitemap namespace above has a typo (SVG). The correct namespace is:
```
xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
```

6. **Do NOT include docs.webresourceledger.com URLs in the root domain sitemap**. Subdomains are treated as separate sites by Google. The docs site should have its own sitemap at `docs.webresourceledger.com/sitemap.xml` (an 11ty plugin can generate this -- but that is out of scope for the landing page task and belongs to the docs site).

### 5. Additional Technical SEO Considerations

#### Semantic HTML Structure

The page must use semantic HTML5 elements for SEO and accessibility:

```
<header>    -- logo, navigation (link to docs)
  <nav>     -- primary navigation
<main>
  <section> -- hero (contains the single <h1>)
  <section> -- how it works
  <section> -- use cases
  <section> -- pricing
<footer>    -- links, legal, copyright
```

**One h1 per page**. The h1 should be the hero headline. All section headings are h2. Sub-items within sections use h3. Do not skip heading levels.

**Heading keyword strategy for this page**:
- h1: Should contain "web resource ledger" or the core value prop (e.g., "Cryptographic evidence of web content")
- h2s: "How It Works", "Use Cases", "Pricing" -- descriptive and keyword-adjacent
- h3s (within use cases): "Legal Evidence", "Compliance Archiving", "AI Agent Grounding", "Journalism" -- these are the long-tail keyword targets

#### Performance as SEO Signal

The <1s on 3G constraint already satisfies Core Web Vitals requirements:
- **LCP < 2.5s**: Guaranteed if the page loads in <1s. The LCP element will be the hero heading or hero image (if any). Ensure the hero does not depend on a large image that delays LCP.
- **INP < 200ms**: Trivially satisfied with no JavaScript.
- **CLS < 0.1**: Ensured by specifying `width` and `height` attributes on all `<img>` elements (logo, OG image placeholder, any icons). Set explicit dimensions on the favicon SVG link.

The no-JS constraint is an SEO advantage: no client-side rendering means Google's crawler sees the full content on first crawl (no rendering queue delay). This is ideal.

#### Font Loading

The design system uses system fonts (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`). This is correct -- no web font loading means no FOIT/FOUT, no CLS from font swap, and no additional network requests. Do not add web fonts to the landing page.

#### Image Optimization

- Logo SVG: Already SVG, no optimization needed. Ensure the `<img>` for the logo has `width` and `height` attributes.
- OG image: Generate as PNG (1200x630). Also serve a WebP version for browsers that support it. The OG meta tag should point to the PNG (social platforms have better PNG support than WebP).
- Any decorative icons or illustrations: Use inline SVG, not image files. Inline SVG loads with the HTML, adds zero network requests, and contributes to LCP performance.

#### HTTP Headers (Cloudflare Workers Static Assets)

The `site/_headers` file in the docs site sets security and caching headers. The landing page deployment should include a similar `_headers` file:

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: public, max-age=3600, s-maxage=86400
```

The `Cache-Control` header is important for Core Web Vitals field data: returning visitors get instant loads, which improves CrUX metrics (Chrome User Experience Report, which Google uses for ranking).

#### Content Freshness Signals

A single static landing page has no natural freshness signal. This is fine -- Google does not penalize evergreen content. However, to avoid appearing abandoned:
- Include a copyright year in the footer: `2025-2026` (or just the current year)
- The `lastmod` in the sitemap should reflect actual deployment date, not a fixed date

#### What NOT to Add

- **No Google Analytics or tracking scripts**: Explicitly out of scope, and adding JS would violate the no-JS constraint.
- **No JSON-LD for FAQPage**: Only add this if the page actually has an FAQ section. If the use case sections are structured as Q&A, then FAQPage markup would be appropriate, but the current spec describes them as feature descriptions, not questions.
- **No BreadcrumbList**: Single-page site has no breadcrumb hierarchy.
- **No SearchAction**: No search functionality on the landing page.
- **No hreflang**: Single language, single region.

---

## Proposed Tasks

### Task 1: Create `<head>` meta tag block
**Priority**: Must-have (blocks page creation)
**Effort**: Small

Write the complete `<head>` section including:
- Title tag
- Meta description
- Canonical tag
- Robots meta tag
- Viewport meta tag (already in docs site pattern)
- Charset meta tag (already in docs site pattern)
- Favicon link (reuse existing `favicon.svg`)
- Open Graph meta tags (all 8 tags listed above)
- Twitter Card meta tags (all 5 tags listed above)

This should be implemented as part of the HTML file, not as a separate template. Since this is a single static HTML file with no build tool, all meta tags are hardcoded.

### Task 2: Create JSON-LD structured data blocks
**Priority**: Must-have (part of the HTML file)
**Effort**: Small

Write three `<script type="application/ld+json">` blocks:
1. Organization schema
2. WebSite schema
3. SoftwareApplication schema with Offers

Place all three in `<head>`, after the meta tags.

The Offers array in the SoftwareApplication schema must match the visible pricing on the page exactly. If pricing copy changes, the JSON-LD must be updated in the same commit.

### Task 3: Create OG image
**Priority**: Should-have (improves social sharing, not a blocker)
**Effort**: Small

Create a 1200x630 PNG image for Open Graph / Twitter Card sharing. Content:
- WRL logo (the W-check SVG)
- Product name: "Web Resource Ledger"
- Tagline: the chosen hero tagline
- Background: brand color (`#2a3444` or `#f7f6f5`)

This can be generated programmatically (e.g., using a simple HTML-to-PNG conversion, or even an SVG-to-PNG conversion of a designed SVG). It does not need to be a photograph or complex illustration.

Save as `assets/og-image.png`.

### Task 4: Create robots.txt and sitemap.xml
**Priority**: Must-have (foundational crawlability)
**Effort**: Tiny

Create two static files deployed alongside the landing page:
- `robots.txt` (5 lines, as specified above)
- `sitemap.xml` (single URL entry, as specified above)

Both are static files that ship with the HTML.

### Task 5: Ensure semantic HTML heading hierarchy
**Priority**: Must-have (verified during implementation)
**Effort**: Zero (guidance for implementer, not a separate task)

This is a constraint on the HTML implementation, not a separate task. The implementer must ensure:
- Exactly one `<h1>` (hero headline)
- All section titles are `<h2>`
- Sub-items are `<h3>`
- No skipped levels
- Semantic elements: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`

### Task 6: Validate structured data post-implementation
**Priority**: Should-have (part of post-implementation review)
**Effort**: Tiny

After the page is deployed, validate structured data using:
1. [Schema Markup Validator](https://validator.schema.org/) -- checks syntax
2. [Google Rich Results Test](https://search.google.com/test/rich-results) -- checks Google eligibility

This should be a manual check during the Phase 3.5 architecture review or Phase 6 post-execution, not an automated CI step (the validators are online tools).

---

## Risks and Concerns

### Risk 1: Pricing structured data mismatch
**Severity**: Medium
**Mitigation**: The pricing tiers are placeholder. When the JSON-LD `Offer` schema includes specific prices ($0, $29), those prices MUST match the visible page content exactly. Google's quality guidelines penalize structured data that does not match visible content. If the pricing section uses language like "coming soon" or "contact us" instead of specific prices, the Offers should be omitted from the JSON-LD entirely and added when real pricing ships.

**Recommendation**: If the product-marketing-minion recommends vague pricing language (e.g., "starting at..." without specific numbers), omit the `offers` array from the SoftwareApplication JSON-LD. Add it back when billing ships and prices are concrete.

### Risk 2: Missing OG image degrades social sharing
**Severity**: Low (does not affect SEO ranking, only social preview appearance)
**Mitigation**: Prioritize OG image creation. Even a simple text-on-background card is dramatically better than no image. Every social platform (LinkedIn, Twitter, Slack, Discord) shows a larger, more prominent card when an OG image is present.

### Risk 3: docs.webresourceledger.com has no sitemap
**Severity**: Low (the docs site is already deployed and presumably indexed)
**Mitigation**: Out of scope for the landing page task. Note it as a follow-up: the docs site (11ty) should generate its own `sitemap.xml`. This is an 11ty plugin addition, not a landing page concern.

### Risk 4: Root domain not yet indexed by Google
**Severity**: Low (new domains take days to weeks for initial indexing)
**Mitigation**: After deployment, submit the sitemap URL (`https://webresourceledger.com/sitemap.xml`) via Google Search Console. Also submit the root URL via the URL Inspection tool for priority crawling. This is a post-deployment step, not a build-time concern.

### Risk 5: No `<html lang="en">` in existing docs template
**Severity**: Low but easy to avoid
**Mitigation**: The existing docs site base template already has `<html lang="en">`. The landing page must also include this. The `lang` attribute helps search engines determine content language without relying on heuristics.

---

## Additional Agents Needed

None. The five-consultation plan in the metaplan covers all landing page needs. SEO implementation is straightforward HTML markup that the implementer can build from these specifications without additional agent consultation.

One **follow-up item** for a future phase (not this landing page task): the docs site at `docs.webresourceledger.com` should add its own `sitemap.xml` and `robots.txt`. This would complete the cross-subdomain SEO picture. It is not a dependency for the landing page.
