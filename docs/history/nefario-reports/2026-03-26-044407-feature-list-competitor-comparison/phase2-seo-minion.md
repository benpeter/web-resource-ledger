## Domain Plan Contribution: seo-minion

### Recommendations

#### 1. Update the SoftwareApplication structured data on the landing page

The existing `featureList` array (lines 59-68 of `landing/public/index.html`) should be updated to reflect the full feature set presented in the new comparison content. Specifically:

- **Expand `featureList`** to include every feature that appears in the comparison table. The current list has 8 items; the comparison will surface more capabilities. Each feature should be a concise, descriptive string (not marketing copy). Keep entries self-explanatory to someone reading raw structured data.
- **Add `offers` property** to the SoftwareApplication schema. The pricing section already exists on the page but is not reflected in structured data. Adding an `Offer` with `price: "0"` and `priceCurrency: "EUR"` for the free tier makes the product eligible for richer search result presentation. Use `AggregateOffer` if representing multiple tiers.
- **Add `applicationSubCategory`** with a value like `"Web Archiving"` or `"Digital Evidence"` to improve topical classification.
- **Do NOT add a separate comparison/table schema** (there is no schema.org type for feature comparison tables that produces rich results). The value is in keeping `featureList` comprehensive and accurate.

Example additions to `featureList`:
```json
"featureList": [
  "Ed25519 digital signatures",
  "RFC 3161 timestamps",
  "WACZ evidence bundles",
  "Public verification URLs",
  "REST API and MCP server",
  "Cookie consent dismissal",
  "eIDAS-qualified timestamps (optional)",
  "FRE 901/902 evidence authentication support",
  "Batch capture API",
  "Webhook notifications",
  "Screenshot and rendered HTML capture",
  "HTTP header recording",
  "Scheduled captures",
  "Usage-based pricing with free tier"
]
```

The exact list should be derived from whatever the feature comparison defines -- the above is illustrative. The key principle: `featureList` in structured data should mirror the feature list visible on the page (consistency between markup and visible content is a Google quality signal).

#### 2. Duplicate content: landing summary vs. docs full version

**No meaningful risk, but handle it correctly.**

- The landing page and docs site are on different subdomains (`webresourceledger.com` vs. `docs.webresourceledger.com`). Google treats subdomains as separate sites. Two versions of comparison content (summary vs. detailed) on separate sites with different depths of coverage is standard practice and will not trigger duplicate content signals.
- **The content must genuinely differ in substance, not just length.** A truncated copy of the docs version on the landing page would be a weak signal. The landing version should be a distinct editorial piece: feature highlights, condensed comparison with a clear CTA linking to the full version. The docs version should be the comprehensive reference with notes, caveats, and methodology.
- **Each page must have its own canonical tag pointing to itself.** The landing page already self-canonicalizes. The docs comparison page needs `<link rel="canonical" href="https://docs.webresourceledger.com/comparison/">` (or whatever the final URL path is).
- **Do NOT cross-canonical** (don't point the docs page's canonical to the landing page or vice versa). They are different content serving different intents.
- **Link between them explicitly.** The landing summary should link to the docs full version ("See the full comparison"). The docs version can link back to the landing page. These cross-links help Google understand the relationship without canonical confusion.

#### 3. Structured data for the docs comparison page

**Yes, but keep it minimal and purposeful.**

The docs site currently has zero structured data (confirmed: `site/_includes/layouts/base.njk` has no JSON-LD). This is an opportunity to add foundational structured data to the docs site, starting with the comparison page:

- **Article schema** for the comparison page. Use `@type: "TechArticle"` (a schema.org subtype of Article appropriate for technical documentation). Include `headline`, `description`, `datePublished`, `dateModified`, `author` (linking to the Organization entity on the landing page via `@id`), and `mainEntityOfPage`.
- **Do NOT try to encode the comparison table itself as structured data.** There is no schema.org type that maps to feature comparison tables in a way that produces rich results. The value of structured data here is in surfacing the page as a tech article, not in marking up individual table cells.
- **Consider adding a BreadcrumbList** to the docs site base template (`base.njk`). This is a low-effort, high-value addition that improves how all docs pages appear in search results (breadcrumb trail instead of raw URL). This is a site-wide improvement, not specific to the comparison page, but the comparison page work is a good trigger to add it.

Recommended structured data for the docs comparison page:

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "WRL Feature Comparison",
  "description": "Detailed feature comparison of web evidence and archiving tools.",
  "datePublished": "2026-03-26",
  "dateModified": "2026-03-26",
  "author": {
    "@type": "Organization",
    "name": "Web Resource Ledger",
    "url": "https://webresourceledger.com/"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Web Resource Ledger",
    "url": "https://webresourceledger.com/",
    "logo": {
      "@type": "ImageObject",
      "url": "https://webresourceledger.com/assets/logo-w-check.svg"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://docs.webresourceledger.com/comparison/"
  }
}
```

#### 4. SEO opportunities from comparison content

**Competitor name queries.** People search for "[competitor] alternative" and "[tool A] vs [tool B]". The comparison page on the docs site is the right place to target these queries. Specific opportunities:

- **Title tag pattern for docs comparison page**: "WRL vs [Competitor] -- Web Evidence Tool Comparison" or "Web Archiving Tools Compared: WRL, [Competitor A], [Competitor B]". The title should name the most-searched competitors. Keep under 60 characters.
- **Meta description**: Should mention the comparison angle and key differentiators (cryptographic signatures, independent verification, open source). This is the click-through hook.
- **Heading structure**: Use h2s for each competitor or comparison dimension (e.g., "Cryptographic Verification", "Timestamp Standards", "Output Format", "Pricing Model"). Each h2 targets a feature-term query cluster.
- **Feature terms as keywords**: Terms like "RFC 3161 timestamp", "WACZ archive", "Ed25519 signature", "eIDAS qualified timestamp", "web evidence", "web archiving API" are low-competition, high-intent terms. The comparison content naturally includes these. Ensure they appear in headings and early paragraph text, not just table cells (Google weights heading and paragraph text more than table content for ranking).
- **Landing page summary version**: Should NOT target competitor name queries (that is the docs page's job). The landing summary should reinforce WRL's own brand terms and feature terms. Keep it focused on "what WRL does" rather than "how WRL compares."
- **Internal linking**: The comparison page should link to relevant docs pages (verification, legal evidence, MCP, API reference) using descriptive anchor text. This distributes link equity from the comparison page (which will attract external links from "vs" searches) to the core docs pages.

**Do NOT over-optimize.** The comparison must be factually accurate and fair. Google's helpful content system penalizes pages that exist solely for SEO -- the comparison must serve a genuine user need (helping someone evaluate tools). Inaccurate claims about competitors will also create reputational risk.

### Proposed Tasks

1. **Update `featureList` in SoftwareApplication schema** on landing page to reflect the full feature set from the comparison content. Add `offers` property for the free tier. (Landing page, implementation task)

2. **Add self-referencing canonical tag** to the docs comparison page. Ensure the docs site base template supports canonical tags (it currently does not -- `base.njk` has no canonical link element). (Docs site, template-level fix)

3. **Add TechArticle structured data** to the docs comparison page. Include headline, description, dates, author, publisher. (Docs site, page-level)

4. **Add BreadcrumbList structured data** to docs site base template. This benefits all docs pages, not just the comparison. Low effort, high value. (Docs site, template-level)

5. **Add Open Graph and Twitter Card meta tags** to the docs site base template. The docs site currently has none (confirmed in `base.njk`). At minimum: `og:title`, `og:description`, `og:url`, `og:type`, `twitter:card`. (Docs site, template-level)

6. **Optimize title tag and meta description** for the docs comparison page to target "[competitor] alternative" and "vs" query patterns. (Docs site, page-level)

7. **Update landing page sitemap.xml** to include any new landing page URL if the comparison summary is a new page (currently the sitemap only lists `/`, `/terms`, `/privacy`, `/refund-policy`, `/content-policy`). If the comparison is a section within the existing index.html, no sitemap change needed.

8. **Cross-link between landing summary and docs full version.** Landing summary links to docs with "See the full comparison" anchor text. Docs version links back to landing page.

### Risks and Concerns

- **Competitor name accuracy**: Any claims in the comparison table about competitor features must be verifiable and current. Outdated or inaccurate competitor information damages credibility with users and can trigger manual review if competitors report it. Recommendation: include a "last verified" date on the docs comparison page and commit to periodic review.

- **Docs site has no canonical tags, no OG tags, no structured data at all.** The comparison page will expose these gaps. Tasks 2, 4, and 5 above are template-level fixes that should be done before or alongside the comparison page, not after. Shipping a comparison page without canonicals on the docs site means Google has to guess which URL variant to index.

- **Feature list drift.** If the `featureList` in structured data is updated to match the comparison content but never maintained afterward, it will drift from reality. Recommendation: treat `featureList` as a living property -- update it whenever features ship or are deprecated. Add a note in the evolution log or CLAUDE.md.

- **Two subdomains, one brand.** Google sees `webresourceledger.com` and `docs.webresourceledger.com` as related but separate sites. The Organization schema on the landing page should be the canonical entity. The docs site should reference it via `@id` rather than duplicating it. This establishes entity coherence across subdomains.

### Additional Agents Needed

- **frontend-minion**: To implement the structured data changes in both `landing/public/index.html` and `site/_includes/layouts/base.njk`. The SEO spec above defines *what* to add; frontend-minion implements *how* (Eleventy data cascade for dynamic structured data, canonical URL generation from page metadata, etc.).

- **content strategy / whoever is writing the comparison text**: SEO constraints to pass along -- the docs version needs proper heading hierarchy (h1 for page title, h2s for comparison dimensions), feature terms in headings not just tables, and a "last verified" date. The landing version should be editorially distinct (not a truncation of the docs version).
