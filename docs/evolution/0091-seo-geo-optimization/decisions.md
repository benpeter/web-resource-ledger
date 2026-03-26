# Decisions: SEO + GEO Optimization (#215)

## 1. Team size: 2 specialists instead of 5

**Chosen**: seo-minion + frontend-minion (what/how separation)
**Over**: Original 5-agent team (+ ai-modeling, ux-strategy, software-docs minions)
**Why**: Lucy's review found the extra 3 agents added coordination overhead without unique value. seo-minion absorbs GEO strategy, frontend-minion absorbs template architecture. Phase 3.5 mandatory reviewers provide the safety net.

## 2. FAQ reduced from 8 to 4 questions

**Chosen**: 4 questions addressing gaps not covered by existing sections
**Over**: 8 questions as originally planned in synthesis
**Why**: ux-strategy-minion identified that 6 of 8 questions duplicated content from existing landing page sections (hero, use cases, features, pricing). Duplication signals weak core messaging. The 4 retained questions address distinct anxieties: screenshot vs WRL, court admissibility, account-free verification, self-hosting.

## 3. FAQ markup: plain dt instead of dt>h3

**Chosen**: `<dt class="faq__question">` styled to heading weight
**Over**: `<dt><h3>...</h3></dt>` as originally specified in synthesis
**Why**: accessibility-minion and ux-design-minion both flagged that h3 inside dt is invalid per the HTML living standard. Screen readers (NVDA + Firefox) drop the heading role, breaking heading navigation. CSS styling achieves the same visual result without the semantic conflict.

## 4. Keep SoftwareApplication, not Product schema type

**Chosen**: SoftwareApplication with AggregateOffer
**Over**: Product schema type
**Why**: SoftwareApplication is the more specific, correct schema type for an API/software product. Google treats it well. Product is for physical goods.

## 5. Add docsUrl field vs rename baseUrl

**Chosen**: New `docsUrl` field in site.js alongside existing `baseUrl`
**Over**: Renaming `baseUrl` to point to docs domain
**Why**: `baseUrl` may be used for cross-site links back to the landing page. Adding a separate field is safer.

## 6. HowTo JSON-LD retained despite Google deprecation

**Chosen**: Keep HowTo structured data
**Over**: Dropping it (Google retired HowTo rich results in 2024)
**Why**: gru confirmed the markup still has GEO value for AI retrieval pipelines that parse structured step content. Low cost to maintain, potential non-Google benefit.

## 7. Template-based sitemap over Eleventy plugin

**Chosen**: Nunjucks template (sitemap.njk) with permalink
**Over**: @11ty/eleventy-plugin-sitemap
**Why**: 17 pages doesn't justify a plugin dependency. Template is simpler, no npm install needed.

## 8. Footer headings changed from h4 to h2

**Chosen**: `<h2 class="site-footer__heading">` across all landing pages
**Over**: Keeping existing `<h4>` headings
**Why**: Validation audit found h2→h4 heading level skip on every page. Footer is a top-level document section, not nested under content — h2 is semantically correct.
