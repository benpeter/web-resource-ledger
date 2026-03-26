# Process: SEO + GEO Optimization (#215)

## TL;DR

Two-specialist team (seo-minion + frontend-minion) implemented complete SEO and GEO optimization across both WRL sites in 3 tasks. 8 architectural reviewers caught 3 significant issues before execution: invalid HTML markup, FAQ content duplication, and deprecated Google rich results. Validation audit found and fixed 2 additional bugs (noindex template, heading hierarchy). Total: 26 files changed, 4 created.

## Phase 1: Team Formation

Nefario initially proposed 5 specialists: seo-minion, ai-modeling-minion, frontend-minion, ux-strategy-minion, software-docs-minion. Lucy's gate review cut this to 2, arguing that seo-minion absorbs GEO strategy and frontend-minion absorbs template architecture — clean what/how separation with 3x less coordination overhead.

The cut was aggressive but correct. The 3 removed agents' concerns were all adequately covered: GEO by seo-minion (who already owns structured data and LLM extractability), UX by the mandatory Phase 3.5 ux-strategy-minion reviewer, and docs frontmatter by frontend-minion (Eleventy expert).

## Phase 2: Specialist Planning

Both specialists independently identified the same critical bug: `site.js` had `baseUrl: "https://webresourceledger.com"` instead of the docs subdomain. This would have produced incorrect canonical URLs for every docs page.

**seo-minion** proposed 12 tasks spanning both sites with detailed structured data specs, keyword targets per page, and a complete llms.txt draft. **frontend-minion** proposed 7 tasks focused on template architecture, recommending template-based sitemap over plugins and inline OG tags in base.njk.

No conflicts between specialists — they naturally divided along what/how lines.

## Phase 3: Synthesis

Nefario consolidated 12+7 specialist proposals into 3 tasks with 1 approval gate:
- Task 1: Docs site (all infrastructure)
- Task 2: Landing page (all changes, gated for FAQ content review)
- Task 3: Validation audit (sequential after both)

Key synthesis decisions:
- Kept SoftwareApplication over Product schema (seo-minion's recommendation)
- Added docsUrl field rather than renaming baseUrl (frontend-minion's safer approach)
- Used summary Twitter Card for secondary pages (no images to show)

## Phase 3.5: Architecture Review — Where the Real Value Was

8 reviewers examined the plan. All ADVISE except margo (APPROVE). Three findings changed the execution:

1. **accessibility-minion + ux-design-minion convergence**: Both independently flagged that `<dt><h3>Question</h3></dt>` is invalid HTML per the living standard. NVDA + Firefox drops the heading role, breaking screen reader navigation. This was in the plan's specified markup. Fixed before execution to plain `<dt>` with CSS heading styling.

2. **ux-strategy-minion**: Identified that 6 of 8 planned FAQ questions duplicated content from existing landing page sections. "What is WRL?" restates the hero. "How does pricing work?" sits directly above the FAQ. Cut to 4 questions addressing genuine gaps: screenshot vs WRL, court admissibility, account-free verification, self-hosting.

3. **gru** (technology landscape): HowTo rich results were retired by Google in 2024. The plan assumed they'd generate rich results. gru recommended keeping the markup for GEO value (AI retrieval pipelines parse structured step content) but adjusting expectations. This prevented a future debugging session when Search Console shows zero HowTo impressions.

Other advisories: security-minion flagged JSON-LD interpolation safety (restrict to site.* values), test-minion recommended explicit FAQ item count assertion, ux-design-minion specified the muted background alternation pattern.

## Phase 4: Execution

Tasks 1 and 2 ran in parallel. Both completed without issues.

**Task 1** (docs site): Agent correctly used `.njk` extension for robots.txt and llms.txt templates — the plan had specified `.txt` but Eleventy's templateFormats config only processes njk, md, html. Smart adaptation.

**Task 2** (landing page): Implemented all 4 FAQ questions with the corrected dl/dt/dd markup. FAQPage JSON-LD correctly mirrors visible content (4 mainEntity items = 4 faq__item elements). Agent added FAQ nav link as planned.

**Task 3** (validation): All checks passed after finding and fixing 2 bugs:
- `base.njk` had hardcoded `<meta name="robots" content="index, follow">` that ignored the `noindex: true` frontmatter on schedules.md. Fixed with Nunjucks conditional.
- All 7 landing pages had `<h4>` footer headings creating h2→h4 heading level skip. Changed to `<h2>` (footer is a top-level section, not nested under content).

## Post-Execution Review

Code review (3 reviewers, 1 APPROVE + 2 ADVISE, 0 BLOCK): lucy confirmed the FAQ reduction is a documented decision. margo suggested dropping HowTo JSON-LD and using template loops for llms.txt — both reasonable optimization suggestions but not blocking. code-review-minion found no correctness issues.

Tests skipped: no worker code was modified in this change set.

## Human Interventions Required

- HUMAN_ACTION_REQUIRED: Verify both sites in Google Search Console and submit sitemaps
- HUMAN_ACTION_REQUIRED: Create OG image asset for social share previews

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/2026-03-26-053113-seo-geo-optimization/phase2-*.md`
- Reviewer verdicts: `docs/history/nefario-reports/2026-03-26-053113-seo-geo-optimization/phase3.5-*.md`
- Synthesis plan: `docs/history/nefario-reports/2026-03-26-053113-seo-geo-optimization/phase3-synthesis.md`
- Code review findings: `docs/history/nefario-reports/2026-03-26-053113-seo-geo-optimization/phase5-*.md`
