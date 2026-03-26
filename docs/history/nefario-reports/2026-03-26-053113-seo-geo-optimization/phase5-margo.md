# Margo Review: SEO + GEO Optimization

## VERDICT: ADVISE

The implementation is proportional to the problem. No new dependencies were added. The docs site generates sitemap, robots.txt, and llms.txt from Eleventy templates (zero additional build tooling). The landing site uses hand-written HTML with inline JSON-LD. FAQ is semantic `<dl>` with minimal CSS. All good choices.

Three items worth watching, one nit.

## FINDINGS

- [ADVISE] `landing/public/index.html`:31-122 -- Four separate JSON-LD script blocks (Organization, SoftwareApplication, HowTo, FAQPage) totaling ~90 lines of structured data in the `<head>`. The SoftwareApplication block alone is 73 lines with a nested AggregateOffer containing three sub-offers, a featureList of 15 items, and a priceSpecification with eligibleQuantity. This is a lot of structured data for a landing page that Google may not even surface as rich results (SoftwareApplication rich results are limited to specific verticals). The HowTo schema duplicates the visible "How It Works" section text verbatim.
  AGENT: implementing minion (SEO/GEO)
  FIX: Keep Organization and FAQPage (these have documented rich result support). Drop HowTo (Google deprecated HowTo rich results for non-recipe content in 2023). Simplify SoftwareApplication to just name/url/description/offers with the free tier -- or drop it entirely since Google does not render rich results for this @type in this context. If kept, flatten the nested offer structure. The featureList provides no rich result value; the visible HTML feature section already serves that purpose for both crawlers and LLMs.

- [ADVISE] `landing/public/sitemap.xml`:1-27 -- Static sitemap with hardcoded `<lastmod>` dates (all `2026-03-23`). These will drift from reality immediately. A stale `<lastmod>` is worse than no `<lastmod>` -- search engines deprioritize sitemaps with dates that don't match actual change times.
  AGENT: implementing minion (SEO/GEO)
  FIX: Either remove `<lastmod>` entirely (valid, and honest) or generate this file during CI from git commit dates. For a six-page static site, the simpler option is to just drop the `<lastmod>` tags. Google's John Mueller has said they ignore `<lastmod>` when it's unreliable.

- [ADVISE] `site/content/llms.njk` and `landing/public/llms.txt` -- Two separate llms.txt files, one per subdomain (docs and landing). The docs version lists 17 page links. The landing version is a product overview with links to docs. Both are manually maintained -- they will drift from the actual site content as pages are added or removed.
  AGENT: implementing minion (SEO/GEO)
  FIX: The docs llms.txt (`site/content/llms.njk`) should generate its link list from `collections.all` or `site.nav` rather than hardcoding URLs. The Eleventy template is already a `.njk` file -- it just doesn't use any template logic for the link list. One `for` loop over `site.nav` would keep it in sync automatically. The landing llms.txt is fine as static (it changes rarely).

- [NIT] `site/_includes/layouts/base.njk`:23-35 -- The WebSite JSON-LD block is identical on every docs page. This is fine (it's how schema.org WebSite works), but the `publisher.url` has a trailing slash while `url` does not have one in the `site.docsUrl` data. Inconsistent trailing slash handling in canonical URLs can cause crawl confusion. Verify `site.docsUrl` and all `<link rel="canonical">` values use the same trailing slash convention.
  AGENT: implementing minion (SEO/GEO)
  FIX: Check that `site.docsUrl` in `site/_data/site.js` either consistently includes or omits trailing slashes, and that the `<loc>` tags in the generated sitemap match.

## Summary

No new dependencies. No new build tools. No frameworks. The implementation uses Eleventy's existing template system and hand-written HTML -- exactly the right weight for the problem. The structured data is the only area where complexity crept beyond what's justified by measurable SEO value. The static sitemap and hardcoded llms.txt links are maintenance debt that will accumulate silently.

None of these are blocking -- the implementation ships correctly and the concerns are about long-term maintainability and avoiding structured data that search engines will ignore.
