# Lucy Review: SEO + GEO Optimization (Phase 4)

## Original Request Restatement

Implement SEO and GEO optimization across the WRL landing page and docs site: meta tags, structured data, sitemaps, robots.txt, llms.txt, FAQ section, and docs site SEO infrastructure.

## Verdict

**ADVISE**

The implementation is well-aligned with the plan and CLAUDE.md conventions. Two substantive deviations from the plan need acknowledgment, one of which should be addressed. No CLAUDE.md violations found.

---

## Findings

### 1. [ADVISE] `landing/public/index.html`:524-548 -- FAQ section has 4 questions instead of planned 8

**CHANGE**: The visible FAQ section contains 4 questions (screenshot/PDF diff, court admissibility, account-free verification, self-hosting). The plan specified 8 questions.

**Missing questions**:
- "What is Web Resource Ledger?"
- "What is a WACZ file?"
- "How does pricing work?"
- "Does WRL work with AI agents?"

**AGENT**: frontend-minion (Task 2)

**WHY this matters**: The FAQPage JSON-LD (lines 156-195) mirrors the visible 4 questions, so there is no content/structured-data mismatch (which would be a Google violation). However, the 4 omitted questions covered distinct keyword targets (WACZ definition, pricing, AI/MCP integration, product overview) that were part of the SEO strategy.

**Proportionality check**: The 4 retained questions are the strongest for legal/evidence keywords. The omitted "What is WRL?" and "How does pricing work?" are arguably redundant with the hero and pricing sections already on the page. "What is a WACZ file?" and "Does WRL work with AI agents?" add genuinely new keyword surface.

**FIX**: Accept the 4-question version if the validation agent confirmed it. If the full 8 are desired, add the missing 4 with matching FAQPage JSON-LD entries. Either way, document the decision in `decisions.md`.

---

### 2. [NIT] `landing/public/index.html`:532 -- FAQ uses `<dt>` without nested `<h3>` headings

**CHANGE**: Plan specified `<dt><h3>question</h3></dt>` structure. Implementation uses `<dt class="faq__question">question</dt>` (no `<h3>`).

**AGENT**: frontend-minion (Task 2)

**WHY this is acceptable**: The `<dt>` element already provides implicit heading semantics within a `<dl>`. Adding `<h3>` inside `<dt>` is debated -- some accessibility auditors flag nested headings inside definition terms. The CSS targets `.faq__question` directly, achieving the same visual weight. No heading hierarchy violation results (the FAQ section h2 is followed by the footer h2s, with no skipped levels).

**FIX**: None required. This is a reasonable implementation choice.

---

### 3. [NIT] `site/content/robots.njk` and `site/content/llms.njk` -- File extension differs from plan

**CHANGE**: Plan specified `site/content/robots.txt` and `site/content/llms.txt`. Implementation uses `.njk` extension.

**AGENT**: frontend-minion (Task 1)

**WHY this is correct**: Eleventy needs a recognized template extension to process frontmatter and `permalink:` directives. Using `.njk` is the right approach -- a `.txt` file would not be processed without explicit `templateFormats` config changes. The output files are correctly generated as `/robots.txt` and `/llms.txt` via the permalink frontmatter.

**FIX**: None required. The plan's file naming was imprecise; the implementation is correct.

---

### 4. [NIT] `landing/public/index.html`:7 -- Meta description length

**CHANGE**: Plan required trimming to 155 characters max. Current description: "Capture web pages with Ed25519 signatures and RFC 3161 timestamps. Signed WACZ bundles anyone can verify. Free tier, usage-based pricing." = ~139 characters.

**AGENT**: frontend-minion (Task 2)

**FIX**: None. Within limits and retains key terms.

---

## Traceability

| Plan Requirement | Status | Location |
|---|---|---|
| Fix site.js (docsUrl, description) | DONE | `site/_data/site.js` |
| base.njk meta tags (canonical, OG, Twitter, JSON-LD, robots/noindex) | DONE | `site/_includes/layouts/base.njk` |
| Docs sitemap.njk | DONE | `site/content/sitemap.njk` |
| Docs robots.txt | DONE | `site/content/robots.njk` (correct extension) |
| Docs llms.txt | DONE | `site/content/llms.njk` (correct extension) |
| Frontmatter descriptions on all docs pages | DONE | All 18 content files have descriptions |
| schedules.md noindex | DONE | `site/content/schedules.md` |
| Landing meta description trim | DONE | `landing/public/index.html`:7 |
| Twitter Card upgrade to summary_large_image | DONE | `landing/public/index.html`:19 |
| AggregateOffer JSON-LD | DONE | `landing/public/index.html`:80-116 |
| Organization description in JSON-LD | DONE | `landing/public/index.html`:39 |
| HowTo JSON-LD | DONE | `landing/public/index.html`:126-153 |
| FAQ section (8 questions) | PARTIAL (4/8) | `landing/public/index.html`:524-548 |
| FAQPage JSON-LD | DONE (matches visible 4) | `landing/public/index.html`:156-195 |
| FAQ nav link | DONE | `landing/public/index.html`:213 |
| OG/Twitter on secondary pages | DONE | All 5 secondary pages |
| 404 noindex | DONE | `landing/public/404.html`:7 |
| Sitemap: add /security, remove changefreq/priority | DONE | `landing/public/sitemap.xml` |
| Landing llms.txt | DONE | `landing/public/llms.txt` |
| FAQ CSS | DONE | `landing/public/css/landing.css`:873-907 |
| Footer h4 to h2 fix | DONE | All landing pages use `<h2>` |

## CLAUDE.md Compliance

| Directive | Status |
|---|---|
| YAGNI | PASS -- no speculative features added |
| KISS | PASS -- inline JSON-LD, no plugins, no partials |
| Vanilla-first | PASS -- no JS added for FAQ, plain CSS |
| No frameworks | PASS -- no new dependencies |
| Fail loudly | N/A -- no runtime code |
| No og:image/twitter:image | PASS -- correctly omitted |
| No Eleventy plugins | PASS |

## Scope Assessment

No scope creep detected. Every change traces to the plan. The docs llms.txt added 5 extra security sub-page links beyond the plan's 12 entries (whitepaper, DPA, subprocessors, incident response, data retention) -- this is a reasonable enrichment since those pages exist and belong in a machine-readable index.

## Summary

One substantive finding: the FAQ section has 4 questions instead of 8. The 4 retained questions are the strongest, and the structured data matches the visible content (no Google policy violation). The missing 4 should be a conscious decision, not an oversight. Everything else aligns with the plan, complies with CLAUDE.md, and follows project conventions.
