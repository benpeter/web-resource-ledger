# Outcome: SEO + GEO Optimization (#215)

## What was built

Complete SEO and GEO optimization across both the landing page (webresourceledger.com) and docs site (docs.webresourceledger.com).

### Landing page changes
- **FAQ section**: 4-question visible FAQ with FAQPage JSON-LD (court admissibility, screenshot vs WRL, account-free verification, self-hosting)
- **HowTo JSON-LD**: 3-step structured data matching the "How It Works" section (kept for GEO despite Google deprecation)
- **AggregateOffer**: SoftwareApplication offers refined from single Offer to 3-tier AggregateOffer (free, usage-based, enterprise)
- **Organization description**: Added to existing Organization JSON-LD
- **Meta description**: Trimmed from 196 to 137 characters
- **Twitter Card**: Upgraded to summary_large_image on homepage
- **OG + Twitter tags**: Added to all 5 secondary pages (terms, privacy, refund, content-policy, security)
- **Sitemap**: Added /security URL, removed deprecated changefreq/priority
- **llms.txt**: New machine-readable product summary at site root
- **Heading hierarchy**: Fixed footer headings from h4 to h2 across all 7 pages

### Docs site changes
- **site.js**: Added `docsUrl` field and site-level `description`
- **base.njk**: Added canonical URLs, OG tags, Twitter cards, robots meta, WebSite + Organization JSON-LD, noindex conditional
- **Sitemap**: New template-generated sitemap.xml (17 pages, correct docs domain)
- **robots.txt**: New template-generated robots.txt with sitemap reference
- **llms.txt**: New template-generated llms.txt with all doc page links
- **Frontmatter**: Optimized descriptions on 11 content pages (keyword-targeted, 100-155 chars)
- **schedules.md**: Added noindex: true (orphan page not in nav)

## Files changed

- 4 files created, 22 files modified
- +290 / -29 lines across landing + docs

## What surprised us

1. **baseUrl bug**: site.js had `baseUrl: "https://webresourceledger.com"` which would have produced wrong canonical URLs for the docs subdomain. Fixed by adding separate `docsUrl` field.
2. **noindex template bug**: base.njk had hardcoded `<meta name="robots" content="index, follow">` that ignored page-level `noindex` frontmatter. Fixed with conditional.
3. **Footer heading hierarchy**: All 7 landing pages had h4 footer headings creating h2→h4 skip. Fixed across all pages.
4. **Eleventy template format**: robots.txt and llms.txt needed .njk extension (not .txt) because eleventy.config.js only processes njk, md, html formats.

## Backlog changes

- No items added to backlog
- No items removed from backlog
- HUMAN_ACTION_REQUIRED: Verify both sites in Google Search Console and submit sitemaps
- HUMAN_ACTION_REQUIRED: Create OG image asset for social share previews (currently no og:image on either site)

## Surface consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — no API endpoints changed |
| Docs site | Updated in this PR (meta tags, structured data, sitemap, robots.txt, llms.txt) |
| Landing page | Updated in this PR (FAQ, JSON-LD, OG/Twitter, sitemap, llms.txt) |
| MCP server | No update needed — no API changes |
| Legal pages | No update needed — only added OG/Twitter meta tags, no content changes |
