## Domain Plan Contribution: seo-minion

### Recommendations

#### 1. Keyword Strategy: SWGDE Terminology and Search Landscape

After reviewing the SWGDE 21-F-001-1.1 document and researching the competitive landscape, here is the assessment of each SWGDE term's SEO value:

**High-value terms (established search intent, low competition for tool pages):**

- **"forensically sound"** -- This is the single most important term. It appears in academic papers (Springer, ScienceDirect), NIST guidance, SANS blog posts, and forensic training materials. Forensic examiners, attorneys, and investigators use this phrase when searching for defensible evidence collection methods. The competitive landscape is dominated by educational/academic content, not product pages. WRL can own the intersection of "forensically sound" + "web capture" or "web archiving." Only one competitor (PageFreezer/WebPreserver) uses this phrase in product marketing. This is a genuine competitive gap.

- **"digital evidence preservation"** / **"digital evidence collection"** -- High search intent from the target audience. NIST has a full publication on this (NIST IR 8387). These are informational queries where WRL's compliance page can rank as a practical "how this tool meets the standard" resource.

- **"SWGDE"** -- The acronym itself has search volume among forensic examiners specifically looking for standards compliance. No web capture tool currently has a SWGDE compliance mapping page. This is an uncontested keyword in the product/tool space.

**Medium-value terms (niche but precise audience match):**

- **"collection documentation"** (SWGDE Section 7.5) -- Examiners search for what to document during evidence acquisition. WRL's automated documentation (capture metadata, timestamps, hashing) directly addresses this. Low volume but high-intent.

- **"content volatility"** (SWGDE Section 4.2) -- A SWGDE-specific concept about prioritizing captures of ephemeral content. Relevant for WRL's scheduled captures and batch capture features. Very niche but signals domain expertise to anyone who finds it.

- **"tool validation"** (SWGDE Section 4.3) -- Forensic tool validation is a formal requirement (SWGDE document 18-Q-001 covers minimum requirements for testing forensic tools). WRL can address this by describing how its verification process, open source code, and deterministic pipeline satisfy validation requirements. This term connects to NIST's Computer Forensics Tool Testing (CFTT) program, which adds authority.

**Lower-value but worth including for topical completeness:**

- **"evidence contamination"** (SWGDE Section 3.4) -- Relevant to WRL's sandboxed browser rendering (no operator interaction during capture).
- **"supplemental preservation"** (SWGDE Section 3.3) -- Relevant to WRL's WACZ bundles as a preservation format.
- **"forensic image"** / **"forensically sound image"** (SWGDE Section 9) -- The SWGDE document explicitly names zip and gzip as acceptable archive formats alongside .Lx01 and .ad1. WACZ (which is a ZIP archive) maps directly.

#### 2. Keyword Cluster for the New swgde-compliance.md Page

**Primary keyword target:** "SWGDE compliant web capture"

**Supporting keyword cluster:**
- "SWGDE best practices online content"
- "SWGDE 21-F-001 compliance"
- "forensically sound web archiving"
- "forensically sound web capture tool"
- "digital evidence web page preservation"
- "SWGDE hashing requirements" (maps to Section 7.3)
- "SWGDE collection documentation requirements" (maps to Section 7.5)

**Title tag recommendation (50-60 chars):**
`SWGDE Compliance — WRL Documentation` (38 chars, leaves room for the site title suffix from the template which adds ` -- WRL Documentation`)

Actually, looking at the base.njk template pattern: `{{ title }} -- {{ site.title }}` where site.title is "WRL Documentation". So the title frontmatter should be the page-specific part.

**Recommended frontmatter:**
```yaml
title: SWGDE Compliance
description: How WRL meets SWGDE Best Practices for Acquiring Online Content (21-F-001) -- forensically sound web capture with SHA-256 hashing, automated collection documentation, and independent timestamps.
```

This yields:
- Title tag: "SWGDE Compliance -- WRL Documentation" (41 chars) -- good length
- Meta description: 188 chars -- slightly long, could trim to 155 by cutting "independent timestamps" but the current length is acceptable since Google sometimes shows longer descriptions for informational queries

**URL structure:** `/swgde-compliance/` (or `/compliance/swgde/` if a broader compliance section is planned). Given the current nav structure, I recommend `/swgde-compliance/` as a flat URL under the existing "Security & Compliance" nav section.

#### 3. Integration Strategy for Existing Pages

For the three pages being updated (legal-evidence.md, verification.md, architecture.md), SWGDE terms should be **woven into existing copy** rather than siloed into new sections. Here is why and how:

**Why inline integration, not new sections:**
- Adding standalone "SWGDE Compliance" sections to three existing pages creates redundancy with the dedicated compliance page.
- Google rewards topical depth on a single authoritative page over thin mentions spread across many pages. The compliance page should be the canonical authority for SWGDE; the other pages should reinforce it through natural cross-references.
- The existing pages already cover the substance that SWGDE addresses (hashing, documentation, preservation). Adding SWGDE vocabulary to existing descriptions is natural, not forced.

**Specific integration points:**

**legal-evidence.md:**
- In "What a WRL capture proves" (line 13): add the phrase "forensically sound" when describing the WACZ bundle properties. E.g., "A verified WRL capture produces a forensically sound evidence package that establishes three properties..."
- In "Evidence foundation checklist" (line 118): add a row for "Does the capture tool meet forensic standards?" pointing to SWGDE compliance.
- After the eIDAS section (around line 148): add a brief paragraph noting that WRL's process also aligns with SWGDE Best Practices for Acquiring Online Content, with a link to the compliance page. This is where examiners will look for standards beyond FRE/eIDAS.
- Add a cross-link in the existing sentence about "process documentation is available for review" (line 124) to point to both the architecture page and the new SWGDE compliance page.

**verification.md:**
- In "What each check confirms" table (line 106): use the phrase "NIST-approved secure hash algorithms" alongside "SHA-256" in the artifact hashes row. This mirrors SWGDE Section 7.3's exact language and is a high-value phrase for forensic examiners.
- In the trust model details section: mention that WRL's hashing approach satisfies SWGDE's requirement for calculating digests to "validate and uniquely identify the entire collection data set, as well as the individual content (files) acquired" (quoting SWGDE Section 7.3).
- Add a sentence linking to the SWGDE compliance page from the section about the legal report.

**architecture.md:**
- In the pipeline description: reference the concept of "evidence contamination" (SWGDE Section 3.4) to describe how the sandboxed, no-human-operator pipeline avoids contamination risks.
- In the capture pipeline section: note that the automated, API-driven approach aligns with SWGDE's preferred "Utilities" acquisition method (Section 8.1.1), which it ranks above browser extensions and screenshots.
- Brief mention that the deterministic pipeline supports "tool validation" requirements.

**Important:** Every inline mention of a SWGDE term should link to the SWGDE compliance page on first occurrence. This builds internal link equity toward the new page and creates a clear canonical reference.

#### 4. Structured Data for the New SWGDE Compliance Page

**Current state:** The base.njk template already includes a site-level `WebSite` JSON-LD block. The doc.njk layout wraps content in an `<article>` tag. No page-level structured data exists.

**Recommendation:** Add page-level JSON-LD to the SWGDE compliance page using the `Article` schema type. This is the correct type for a technical reference document that maps a standard to a product.

**Proposed JSON-LD:**

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "SWGDE Compliance -- How WRL Meets Best Practices for Acquiring Online Content",
  "description": "Compliance mapping between WRL's web capture capabilities and SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024).",
  "datePublished": "2026-03-XX",
  "dateModified": "2026-03-XX",
  "author": {
    "@type": "Organization",
    "name": "Web Resource Ledger",
    "url": "https://webresourceledger.com"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Web Resource Ledger",
    "url": "https://webresourceledger.com"
  },
  "about": {
    "@type": "Thing",
    "name": "SWGDE Best Practices for Acquiring Online Content",
    "url": "https://www.swgde.org/documents/published-complete-listing/21-f-001-best-practices-for-acquiring-online-content/"
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://docs.webresourceledger.com/swgde-compliance/"
  }
}
```

**Why `TechArticle`:** This is the most semantically precise schema.org type for a technical compliance mapping document. It is a subtype of `Article` and inherits all Article properties. Google processes it as an Article for rich results purposes.

**What NOT to use:**
- `FAQPage` -- the compliance mapping is not Q&A format.
- `HowTo` -- it is not a step-by-step guide.
- `WebPage` -- too generic; does not communicate the article nature to search engines.
- `GovernmentService` or `LegislationObject` -- SWGDE is not legislation; it is a professional standards body.

**Rich results eligibility:** `TechArticle` can produce article rich results (headline, date, author) in search. These are modest but valuable for credibility in the forensics space. The key win is not a flashy rich result but correct semantic signals that help Google understand the page's topic and authority.

**Implementation note:** The JSON-LD should be added either through:
1. A conditional block in base.njk that checks for a `structuredData` frontmatter field and renders it, or
2. A separate include partial that the SWGDE compliance page pulls in.

Option 1 is more reusable for future pages that need custom structured data. The frontmatter could include `structuredDataType: TechArticle` and the template renders the appropriate JSON-LD.

**Consider for legal-evidence.md too:** The legal evidence page is also a strong candidate for `TechArticle` structured data (it is a detailed technical mapping of FRE rules to product capabilities). This could be a follow-up task.

#### 5. Additional SEO Considerations

**Sitemap:** The new page will be automatically included via the existing sitemap.njk template (it iterates `collections.all` and excludes `noindex` pages). No sitemap changes needed.

**Canonical tag:** Self-referencing canonical is already handled by base.njk: `<link rel="canonical" href="{{ site.docsUrl }}{{ page.url }}">`. No changes needed.

**Internal linking from high-authority pages:** The new SWGDE compliance page should be linked from:
1. The Security & Compliance overview page (`/security/`) -- add a new section for SWGDE alongside the existing whitepaper, DPA, subprocessors, etc.
2. The Legal Evidence page (`/legal-evidence/`) -- cross-reference as described above.
3. The Compare page (`/compare/`) -- if a "standards compliance" row exists or is added, note SWGDE alignment.

**Navigation:** Add the page to the "Security & Compliance" nav section in `site/_data/site.js`. Place it after "Data Retention" or, better, after "Overview" if SWGDE compliance is considered a primary selling point for the forensics audience.

**llms.txt:** Add the new page to `site/content/llms.njk` so AI agents and LLM-powered search tools can discover it.

**robots.txt / robots meta:** No changes needed. The page should be indexed.

**Open Graph:** Already handled by base.njk template using frontmatter title and description. The existing template covers og:type, og:url, og:title, og:description, og:site_name, and Twitter card. No changes needed.

### Proposed Tasks

1. **Define frontmatter for swgde-compliance.md** -- title, description, and structured data fields as specified above. This is a dependency for the implementation agent.

2. **Add SWGDE compliance page to site navigation** -- update `site/_data/site.js` to include the new page in the "Security & Compliance" section.

3. **Add SWGDE compliance page to llms.txt** -- update `site/content/llms.njk` with a line for the new page.

4. **Integrate SWGDE terminology into legal-evidence.md** -- inline edits at the specific locations identified above. Add "forensically sound" phrasing, SWGDE cross-references, and a new evidence foundation checklist row.

5. **Integrate SWGDE terminology into verification.md** -- add "NIST-approved secure hash algorithms" language and SWGDE cross-reference.

6. **Integrate SWGDE terminology into architecture.md** -- add evidence contamination and tool validation references.

7. **Add TechArticle JSON-LD to swgde-compliance.md** -- either as a page-specific script block or through a template mechanism. Coordinate with frontend-minion on implementation approach.

8. **Add SWGDE section to Security & Compliance overview** -- add a paragraph and link on `/security/` following the existing pattern (whitepaper, DPA, subprocessors, incident response, data retention).

### Risks and Concerns

1. **SWGDE redistribution policy compliance.** The SWGDE document's cover page (which I read in full) states three redistribution conditions: (a) retain the disclaimer, (b) do not use SWGDE's name to endorse products, (c) any reference must include version number and creation date. The compliance mapping page MUST include the version number (1.1) and date (March 2024) in every reference to the SWGDE document. The page must NOT claim SWGDE endorses WRL. The page should say "WRL's capabilities align with" not "WRL is SWGDE-certified" (SWGDE does not certify tools). This is both a legal risk and an SEO risk -- if SWGDE issues a takedown or complaint, the page loses authority.

2. **Keyword stuffing risk.** The terms "forensically sound," "collection documentation," "tool validation," and "content volatility" are niche and specific. If forced into existing copy where they do not fit naturally, the text will read as keyword-stuffed. The user-docs-minion writing the actual copy should use these terms only where the substance supports them. One natural occurrence per page on the updated pages is sufficient. The compliance page itself should use them freely since they are the subject matter.

3. **Thin content risk on the compliance page.** A page that is just a mapping table (SWGDE requirement -> WRL feature) with no explanatory prose will be seen as thin content by Google. The page needs substantive paragraphs explaining how each requirement is met, not just a checklist. Aim for 1500-2500 words. The SWGDE document itself is only 10 substantive pages, so there is plenty to map against without padding.

4. **"Forensically sound" is a term of art with no universal definition.** The Springer/McKemmish paper "When is Digital Evidence Forensically Sound?" (widely cited in the forensics community) explicitly notes that the term lacks a consensus definition. WRL should use the phrase in the sense the SWGDE document uses it -- describing a methodology that produces auditable, repeatable, hash-verified evidence packages -- rather than claiming a formal certification that does not exist. Over-claiming here would undermine credibility with the exact audience being targeted.

5. **Structured data validation.** The `TechArticle` JSON-LD must be validated against both the Schema Markup Validator (syntax) and the Google Rich Results Test (eligibility) after implementation. If the `about` property referencing the SWGDE document URL causes issues (it should not, but external URLs in `about` are sometimes flagged), it can be simplified to just the `name` property without the URL.

6. **No search volume data available.** I was unable to obtain actual search volume numbers for these terms (this would require access to Google Keyword Planner, Ahrefs, or SEMrush with paid accounts). The assessment above is based on competitive landscape analysis: what ranks, what exists, and where the gaps are. The core signal is that NO web capture tool currently has a SWGDE compliance mapping page, making this uncontested territory regardless of absolute volume.

### Additional Agents Needed

- **user-docs-minion** -- to write the actual compliance page copy and the inline edits to existing pages. The SEO recommendations above define WHAT terms to use and WHERE to place them, but the actual prose must be written by someone focused on audience-appropriate technical writing. The forensic examiner audience will spot inauthentic use of terminology immediately.

- **frontend-minion** -- to implement the `TechArticle` JSON-LD, either as a one-off script block or as a reusable template mechanism in base.njk. Also to handle the nav update in site.js and the llms.txt update.

- **software-docs-minion** -- to review the compliance mapping table for technical accuracy. Every claim about how WRL meets a SWGDE requirement must be verifiable against the actual codebase. The SEO strategy is worthless if the claims are inaccurate and a forensic examiner finds a discrepancy.
