# Phase 0052: Landing Page -- Process

## TL;DR

Four planning specialists (iac, ux-design, product-marketing, seo) produced a comprehensive brief for a static landing page. The key architectural conflict -- standalone deployment vs 11ty integration -- resolved cleanly in favor of standalone per KISS. Seven Phase 3.5 reviewers generated 8 advisories, all incorporated before execution. Frontend-minion built the page in a single pass; code review caught one CI-breaking bug (missing `mkdir -p` before SVG copy) and two cosmetic issues, all auto-fixed. Total: 12 files, 1098 lines added, 4 commits, zero manual interventions.

## Planning: Who Was Consulted and Why

**iac-minion** was asked how to deploy a static site on Cloudflare Workers Static Assets with custom domain routing. They recommended a standalone `landing/` directory with its own `wrangler.toml` and a GitHub Actions workflow that copies shared assets (design-system.css, SVGs) into place before `wrangler deploy`. Key contribution: the `custom_domain = true` route pattern matching the existing docs site deployment.

**ux-design-minion** was asked to specify the visual design within the brand design system constraints. They produced a detailed spec: dark hero/footer bookends with alternating section backgrounds, fluid `clamp()` typography, mobile-first with 768px/1024px breakpoints, no decorative illustrations. They also recommended 11ty integration, which was ultimately rejected.

**product-marketing-minion** was asked to write all visible copy. They produced the tagline ("Web evidence you can prove"), value proposition, 3-step how-it-works descriptions, 4 use case card texts, pricing tier names and descriptions, and footer copy. The copy was used verbatim in the final HTML.

**seo-minion** was asked to specify SEO metadata. They produced two JSON-LD blocks (Organization and SoftwareApplication), Open Graph and Twitter Card tags, robots.txt, and sitemap.xml. Key decision: omit Offers array from SoftwareApplication since pricing is placeholder. They also specified trailing slashes on all URLs to match the canonical.

## The Deployment Architecture Conflict

The most significant planning disagreement was between iac-minion (standalone) and ux-design-minion (11ty integration):

**ux-design-minion argued for 11ty**: Shared layout templates with the docs site, consistent header/footer, familiar build pipeline, Nunjucks template reuse.

**iac-minion argued for standalone**: Different domain (webresourceledger.com vs docs.webresourceledger.com), zero build dependencies, decoupled deployment, simpler CI. A single HTML file doesn't need a static site generator.

**Synthesis resolution**: Standalone wins. The landing page is on a completely separate domain, has exactly one page (no template reuse benefit), and CLAUDE.md says KISS. Adding 11ty as a build dependency for one HTML file violates "minimize code and dependencies actively." The docs site uses 11ty because it has 6+ pages with shared layouts -- a different problem.

## Phase 3.5: Architecture Review

Seven reviewers examined the execution plan. All returned APPROVE or ADVISE (no BLOCKs):

- **accessibility-minion** produced the three most impactful advisories: skip link `:focus` reveal (the `.sr-only` class hides it permanently), focus indicator overrides on dark backgrounds (outline-color matches background), and nav/footer link touch target padding. All three were incorporated verbatim into the Task 1 prompt.

- **lucy** identified two content gaps: the footer was missing a Web UI link (required by the issue), and the execution plan needed `process.md` written at wrap-up. Both addressed.

- **seo-minion** refined the canonical URL convention (trailing slashes) and recommended `lastmod` in the sitemap.

- **security-minion** confirmed the CSP approach (`script-src 'none'` is achievable with zero JS) and documented desired security headers.

- **margo** confirmed the plan was proportional and not over-engineered.

- **ux-strategy-minion** and **test-minion** approved without material findings.

## Execution: One Gate, Three Tasks

Task 1 (frontend-minion) was gated because Tasks 2 and 3 depended on its output. The agent produced all 5 files in a single pass with all 8 advisories implemented. Notable implementation choices:

- CSS Grid for multi-column layouts (use cases 4-column, steps 3-column, pricing 3-column) rather than Flexbox, which produces uneven last rows
- `.btn--inverse` as a named CSS modifier rather than contextual `.hero .btn--ghost` override
- Inline SVG with hardcoded stroke colors (CSS custom properties can't be used in SVG attributes without JS)

Lucy's gate review was thorough -- she verified requirements traceability line by line, caught the `--color-text-muted` contrast risk (flagged by the docs site in phase 0051 but not yet addressed for the landing page), and confirmed all content matched the product-marketing copy.

Tasks 2 (iac-minion) and 3 (software-docs-minion) ran in parallel after the gate. Both completed without issues.

## Code Review Findings

Three reviewers (code-review-minion, lucy, margo) all returned ADVISE:

**One CI-breaking bug found**: The `deploy-landing.yml` workflow copies SVGs to `landing/public/assets/` but that directory doesn't exist in the repo (it's gitignored). The `cp` command would fail on the first deploy. Fixed by adding `mkdir -p` before the copy step. This is exactly the kind of bug that only manifests in CI on a clean checkout.

**Two cosmetic fixes**: duplicate `margin` declaration (dead code from copy-paste), and a `font-size: 0` trick for hiding a pseudo-element on mobile replaced with the clearer `display: none`.

**Informational findings not fixed**: hardcoded `rgba(248, 248, 250, ...)` values (CSS limitation -- no way to apply opacity to a custom property value without `color-mix()`), missing Lighthouse CI step, borderline `--color-text-muted` contrast.

## Human Interventions

None. This orchestration ran in fully autonomous mode with Lucy making all gate decisions. No manual changes were made to any deliverables.

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/2026-03-22-164441-landing-page/` (21 scratch files)
- Design decisions: `docs/evolution/0052-landing-page/decisions.md`
- Outcomes and known issues: `docs/evolution/0052-landing-page/outcome.md`
- Nefario execution report: `docs/history/nefario-reports/2026-03-22-164441-landing-page.md`
