---
title: "SEO + GEO Optimization"
source-issue: 215
timestamp: 2026-03-26T05:31:13
branch: worktree-giggly-jingling-stallman
slug: seo-geo-optimization
status: complete
task-count: 3
gate-count: 1
---

# Nefario Execution Report: SEO + GEO Optimization (#215)

## Original Prompt

SEO + GEO optimization for the WRL landing page and docs site. Combines traditional search engine optimization (#136) and generative engine optimization (#137) into a single pass, since both touch the same files (landing page HTML, meta tags, structured data, docs site).

SEO scope: unique title tags and meta descriptions, JSON-LD structured data (Organization, SoftwareApplication, FAQ, HowTo), OG/Twitter cards, sitemap, robots.txt, semantic HTML, heading hierarchy, canonical URLs, Lighthouse SEO 95+ target.

GEO scope: LLM-extractable content structure, comprehensive Schema.org coverage, llms.txt at site root, citation-friendly copy with specific numbers and use cases.

## Team

### Phase 2 Specialists (2)
- **seo-minion**: SEO/GEO strategy — structured data architecture, keyword optimization, sitemap strategy, llms.txt content, meta tag audit, FAQ content recommendations, cross-site coordination spec
- **frontend-minion**: Implementation architecture — Eleventy template modifications, static HTML approach, file ownership mapping, sitemap generation strategy, validation approach

### Phase 3.5 Reviewers (8)
- **security-minion** (ADVISE): JSON-LD interpolation safety in Nunjucks script blocks — recommended restricting to site.* values only
- **test-minion** (ADVISE): FAQ item count assertion missing from validation, npm test skip documentation needed
- **ux-strategy-minion** (ADVISE): Cut FAQ from 8 to 4 questions — 6 of 8 duplicated existing sections
- **lucy** (ADVISE): llms.txt URL verification needed, evolution log reminder
- **margo** (APPROVE): Zero new dependencies, proportional implementation
- **ux-design-minion** (ADVISE): FAQ needs muted background, dt>h3 nesting problematic, nav link width concern
- **accessibility-minion** (ADVISE): dt>h3 is invalid HTML per living standard — recommend plain dt styled to heading weight
- **gru** (ADVISE): HowTo rich results retired by Google 2024 — keep for GEO value, adjust expectations

### Phase 5 Code Reviewers (3)
- **lucy** (ADVISE): FAQ reduction from 8→4 is documented advisory decision, file extension changes acceptable
- **margo** (ADVISE): HowTo JSON-LD could be dropped (kept per gru guidance for GEO), llms.txt could use template loop
- **code-review-minion** (APPROVE): All correctness checks passed, no security issues

## Execution Summary

3 tasks executed in 2 batches (Tasks 1+2 parallel, Task 3 sequential):

1. **Task 1** (frontend-minion): Docs site SEO infrastructure — site.js fix, base.njk meta tags/canonical/OG/Twitter/JSON-LD, sitemap.njk, robots.njk, llms.njk, frontmatter optimization across 11 pages. 14 files modified/created.

2. **Task 2** (frontend-minion, GATED): Landing page SEO — FAQ section with 4 questions, FAQPage + HowTo JSON-LD, AggregateOffer pricing, meta description trim, OG/Twitter on 5 secondary pages, sitemap fix, llms.txt, FAQ CSS. 10 files modified/created.

3. **Task 3** (seo-minion): Validation audit — all checks passed after 2 fixes (noindex template conditional, footer heading hierarchy h4→h2).

## Key Decisions

1. **Team reduced from 5 to 2** — seo-minion + frontend-minion (what/how separation). Lucy trimmed ai-modeling, ux-strategy, software-docs minions.
2. **FAQ cut from 8 to 4 questions** — ux-strategy-minion identified 6 of 8 duplicated existing sections
3. **Plain dt instead of dt>h3** — accessibility-minion: h3 inside dt is invalid HTML per living standard
4. **Keep SoftwareApplication, not Product** — seo-minion: correct schema type for API/software product
5. **Add docsUrl field, keep baseUrl** — safer than renaming existing field
6. **HowTo JSON-LD retained** — gru: Google deprecated but still valuable for GEO/AI pipelines
7. **Template sitemap over plugin** — frontend-minion: 17 pages doesn't justify a dependency
8. **Footer h4→h2 fix** — validation found heading level skip across all 7 landing pages

## Post-Execution Fixes

1. **noindex template bug** (base.njk): Hardcoded `<meta name="robots" content="index, follow">` ignored page-level `noindex` frontmatter. Fixed with conditional.
2. **Footer heading hierarchy** (all 7 landing pages): h4 footer headings created h2→h4 skip. Changed to h2.

## Verification

Verification: code review passed (1 APPROVE, 2 ADVISE). (Tests: skipped — no worker code modified. Docs: 0 items.)

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-26-053113-seo-geo-optimization/`

Files: prompt.md, phase1-metaplan-prompt.md, phase1-metaplan.md, phase1-metaplan-rerun-prompt.md, phase1-metaplan-rerun.md, phase2-seo-minion-prompt.md, phase2-seo-minion.md, phase2-frontend-minion-prompt.md, phase2-frontend-minion.md, phase3-synthesis-prompt.md, phase3-synthesis.md, phase3.5-*.md (8 reviewer outputs), phase4-*-prompt.md (2 task prompts), phase5-*.md (3 code reviews)

## Session Resources

### Skills Invoked
- /nefario (this orchestration)

### Compaction Events
0 compaction events during this session.

Resolves #215
