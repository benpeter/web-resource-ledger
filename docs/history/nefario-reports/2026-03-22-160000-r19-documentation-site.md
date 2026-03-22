---
task: "R19: Documentation site"
date: 2026-03-22
source-issue: 99
mode: execution
task-count: 6
gate-count: 1
agents: frontend-minion, user-docs-minion, iac-minion, accessibility-minion, api-spec-minion
reviewers: security-minion, test-minion, ux-strategy-minion, lucy, margo, accessibility-minion, user-docs-minion
compaction-events: 1
---

## Summary

Built a complete static documentation site for WRL using 11ty v3, deployed via Cloudflare Workers Static Assets at `docs.webresourceledger.com`. Six guide pages (Getting Started, Authentication, Verification, Batch Captures, MCP Server, API Reference) with the API reference generated from openapi.yaml at build time. Zero client-side JS except ~19 lines of progressive-enhancement copy-to-clipboard. WRL brand design system tokens consumed via CSS custom properties. Strict CSP, WCAG AA contrast overrides, mobile-responsive layout with CSS-only navigation. GitHub Actions CI/CD on push to main.

## Original Prompt

Build a static documentation site deployed on Cloudflare Pages at a custom docs subdomain, providing comprehensive guides for all WRL features. The site is generated from the repo's existing openapi.yaml and markdown content, styled with the WRL brand design system, and automatically deployed on push to main.

## Key Design Decisions

1. **11ty v3 over plain HTML or Redocly** -- Zero client-side JS output, first-class markdown/Nunjucks support, ESM-native. Plain HTML would mean too much duplication across 6 pages; Redocly ships ~250KB client-side JS via ReDoc.

2. **Build-time OpenAPI parsing over ReDoc** -- `@apidevtools/swagger-parser` for $ref resolution with custom Nunjucks templates. ReDoc's styled-components with generated class names make brand-consistent theming fragile. Full control over HTML/CSS output.

3. **Workers Static Assets over Cloudflare Pages** -- iac-minion discovered Pages was deprecated (April 2025). Workers Static Assets uses the same deployment tooling as the existing WRL Worker and is the forward-looking platform.

4. **Getting Started IS the homepage** -- ux-strategy-minion's JTBD analysis: a hub page is a zero-value interstitial for a 6-page site. Getting Started opens with a one-sentence product description; "What's next" at the bottom provides wayfinding.

5. **Strict CSP with external clipboard JS** -- `script-src 'self'; style-src 'self'` (no unsafe-inline). Copy-to-clipboard implemented as external file to comply. Lucy's gate review caught the initial permissive policy.

6. **Docs-local WCAG AA contrast overrides** -- `--color-text-muted-docs: #5a5650` and `--color-link-docs: #2f6a85` fix contrast failures without modifying the shared design system.

7. **API Reference last in sidebar** -- Follows Divio framework: tutorials and how-tos precede reference material. API Reference is a lookup resource, not a learning step.

8. **CSS-only mobile navigation** -- `<details>/<summary>` instead of JS hamburger toggle. Zero JS for navigation.

## Execution

### Task 1: Site Scaffold (frontend-minion) -- GATE

Created 11ty project structure in `site/`: eleventy.config.js (ESM, copies design-system.css from parent), base.njk layout with two-column grid and sticky sidebar, doc.njk content wrapper, docs.css with full component styles, favicon and logo SVGs.

Issue: agent wrote files to original repo root instead of worktree. Required manual copy and patch.

Gate approved: structure matches plan, design system integration correct.

### Task 2: Content Pages and API Pipeline (user-docs-minion)

Six content pages: index.md (Getting Started tutorial), authentication.md (three-persona guide), verification.md (progressive disclosure), batch.md (2-URL example), mcp.md (4 client setups), api-reference.njk (tag-grouped endpoints).

`_data/api.js` parses openapi.yaml with SwaggerParser.dereference(), organizes 14 operations by tag with schema flattening helpers. `_data/site.js` provides global nav data.

### Task 3: Deployment (iac-minion)

`site/wrangler.toml` with `[assets]` block and custom domain route. `.github/workflows/deploy-docs.yml` with path filter, Lighthouse CI step. Updated `ci.yml` docs-skip pattern.

### Task 4: README Cross-links (frontend-minion)

Three cross-links to `docs.webresourceledger.com` added to README.md (header, usage section, MCP section).

### Task 5: Accessibility (accessibility-minion)

WCAG AA contrast overrides in docs.css. Prism syntax highlight theme with accessible token colors. Copy-to-clipboard as external JS with aria-label feedback. CSP tightened from unsafe-inline to strict self.

### Task 6: OpenAPI Validation (api-spec-minion)

Verified build-time rendering produces correct endpoint grouping, method badges, and schema tables. Updated openapi.yaml server URLs from placeholders to real worker URLs.

## Verification

Verification: code review passed (1 BLOCK auto-fixed, 4 ADVISE addressed), all 755 tests pass (28 files). Doc assessment: 0 MUST items.

### Code Review Findings

- **BLOCK**: `card-grid` class used in index.md but undefined in CSS. Fixed: added grid layout to docs.css.
- **ADVISE**: Missing `.catch()` on clipboard Promise. Fixed.
- **ADVISE**: Unused `active` field in site.js nav data. Fixed.
- **ADVISE**: Global security inheritance not handled in API data pipeline. Accepted (all endpoints use same auth).
- **ADVISE**: JSON examples may double-escape. Accepted (default Nunjucks escaping is correct per security advisory).

### Test Results

28 test files, 755 tests passed, 0 failed. Vitest exclude updated to skip `site/**`.

## Agent Contributions

### Planning Phase

| Agent | Role | Key Contribution |
|-------|------|-----------------|
| frontend-minion | Site architecture | 11ty config, template structure, design system integration |
| iac-minion | Deployment | Discovered Pages deprecation, Workers Static Assets approach |
| api-spec-minion | OpenAPI rendering | Recommended Redocly (rejected); informed build-time approach |
| user-docs-minion | Content design | Six-page information architecture, tutorial structure |
| ux-strategy-minion | User journey | JTBD analysis, homepage decision, sidebar ordering |

### Review Phase

| Reviewer | Verdict | Key Finding |
|----------|---------|-------------|
| security-minion | ADVISE | Strict CSP, HSTS, avoid env var names in docs |
| test-minion | ADVISE | Build verification in CI, Lighthouse check |
| ux-strategy-minion | ADVISE | Journey coherence confirmed, minor nav label suggestions |
| lucy | ADVISE | Missing .sr-only CSS, strict CSP enforcement |
| margo | APPROVE | Approach is appropriately minimal |
| accessibility-minion | ADVISE | Three contrast failures, docs-local CSS overrides |
| user-docs-minion | ADVISE | Content structure recommendations |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- primary orchestration

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-22-160000-r19-documentation-site/`

Files:
- prompt.md -- original user prompt
- phase1-metaplan-prompt.md, phase1-metaplan.md
- phase2-{frontend,iac,api-spec,user-docs,ux-strategy}-minion-prompt.md and .md
- phase3-synthesis-prompt.md, phase3-synthesis.md
- phase3.5-{security,test,ux-strategy,lucy,margo,accessibility,user-docs}-minion-prompt.md and .md

Compaction events: 1

</details>
