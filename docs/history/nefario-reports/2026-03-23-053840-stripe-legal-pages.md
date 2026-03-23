---
task: "Stripe-required legal pages for business website verification"
date: 2026-03-23
source-issue: 131
mode: execution
task-count: 2
gate-count: 1
agents: frontend-minion
reviewers: security-minion, test-minion, ux-strategy-minion, lucy, margo
compaction-events: 1
---

## Summary

Added four static HTML legal pages (Privacy Policy, Refund & Dispute Policy, Terms of Service, Content Policy) to the landing site at webresourceledger.com. Updated the landing page and 404 page footers with two-column navigation (Product / Legal), operator identity, and contact details. Updated sitemap.xml. All pages match the existing design system (design-system.css, landing.css). These pages satisfy Stripe's business website verification requirements for account activation.

## Original Prompt

GitHub Issue #131: LEGAL: Stripe-required legal pages

Host Stripe-required legal and policy pages on webresourceledger.com so the site passes Stripe's business website verification. Pages: Privacy Policy (/privacy), Refund & Dispute Policy (/refund-policy), Terms of Service (/terms), Content Policy (/content-policy). Update footer with links and operator identity. Update sitemap.xml.

## Key Design Decisions

1. **Two specialists, not four** — Original meta-plan proposed security-minion, frontend-minion, ux-strategy-minion, and seo-minion. Lucy's gate review correctly identified ux-strategy and seo as unnecessary for static legal content pages. Re-ran Phase 1 with 2 specialists.

2. **Usage-based cancellation simplification** — Refund policy addresses Stripe's cancellation requirement with "There is nothing to cancel" — honest and accurate for a usage-based model with no subscriptions.

3. **Preserve existing effective dates** — Terms and Content Policy retain their original 2026-03-16 effective date since content is unchanged. New pages use 2026-03-23.

4. **Shared article CSS** — Single `.article` class handles prose layout for all legal pages rather than per-page styles.

## Phases

### Phase 1-2: Planning (2 specialists)
Meta-plan initially proposed 4 specialists. Lucy's gate review recommended removing ux-strategy-minion and seo-minion as over-scoping. Phase 1 re-ran with 2 specialists: security-minion (GDPR/privacy compliance) and frontend-minion (CSS layout, HTML structure).

- **security-minion**: Recommended GDPR-compliant privacy policy with controller identity, legal basis table, data retention, third-party processors, data subject rights. Flagged DPA verification as operational task.
- **frontend-minion**: Proposed shared article CSS layout, two-column footer structure, consistent header/footer across all pages. Recommended `.article` BEM-style class hierarchy.

### Phase 3: Synthesis
Two tasks produced:
1. CSS changes (article prose layout, footer restructuring) — frontend-minion, sonnet
2. HTML pages + footer updates + sitemap — frontend-minion, sonnet, with approval gate

### Phase 3.5: Architecture Review (5 mandatory reviewers)
No discretionary reviewers needed (no UI components beyond static HTML, no runtime code).

- security-minion: ADVISE — verify DPAs exist with processors listed in privacy policy (Ben action item)
- test-minion: APPROVE — no testable runtime behavior, static HTML verified by visual inspection
- ux-strategy-minion: APPROVE — clear layout, consistent navigation, good mobile responsive design
- lucy: ADVISE — URL routing depends on Cloudflare auto-trailing-slash (confirmed working via existing landing page)
- margo: APPROVE — right-sized, no over-engineering

### Phase 4: Execution (2 tasks, 1 gate)
Task 1 (CSS): Added ~80 lines of article/prose styles and footer restructuring to landing.css. Committed.

Task 2 (HTML pages): Created privacy.html, refund-policy.html, terms.html, content-policy.html. Updated index.html and 404.html footers. Updated sitemap.xml with 4 new URLs. Committed with 9 files.

### Phase 5-8: Post-Execution
- Code review: code-review-minion APPROVE, lucy ADVISE (fragment link fix — addressed), margo ADVISE (footer duplication acceptable). Fixed: added `id="abuse-reporting"` to content-policy.html and updated cross-link in terms.html.
- Tests: Skipped (no test infrastructure for static HTML pages).
- Documentation assessment: 0 actionable items. Legal pages are self-documenting.

## Agent Contributions

### Planning
| Agent | Key Recommendation |
|-------|-------------------|
| security-minion | GDPR-compliant privacy policy with technical accuracy (HMAC-SHA-256, session hashing, PKCE) |
| frontend-minion | Shared `.article` CSS class, two-column footer, consistent header/footer structure |

### Review
| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | Verify DPA existence with processors (operational task) |
| test-minion | APPROVE | — |
| ux-strategy-minion | APPROVE | — |
| lucy | ADVISE | Auto-trailing-slash dependency confirmed working |
| margo | APPROVE | — |
| code-review-minion | APPROVE | — |
| lucy (code review) | ADVISE | Fragment link missing on abuse-reporting cross-reference (fixed) |
| margo (code review) | ADVISE | Footer duplication across 6 files (acceptable, noted) |

## Execution

### Task 1: Article and Footer CSS
- **Agent**: frontend-minion (sonnet)
- **Files**: landing/public/css/landing.css (+80 lines)
- **Changes**: `.article` prose layout (headings, paragraphs, lists, tables, links), `.site-footer__links` two-column structure, `.site-footer__heading`, `.site-footer__operator` styles, responsive overrides

### Task 2: HTML Pages, Footer Updates, Sitemap
- **Agent**: frontend-minion (sonnet)
- **Files**: privacy.html (new, 315 lines), refund-policy.html (new, 128 lines), terms.html (new, 157 lines), content-policy.html (new, 133 lines), index.html (footer update), 404.html (header + footer update), sitemap.xml (4 new URLs)
- **Gate**: Approved — all 9 success criteria from issue met

## Verification

Verification: code review passed (1 finding fixed), tests skipped (static HTML). (Documentation: not applicable — pages are self-documenting.)

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — primary orchestration

</details>

<details>
<summary>Compaction</summary>

1 compaction event (post-Phase 3.5, before execution).

</details>

## Working Files

[Companion directory](2026-03-23-053840-stripe-legal-pages/)

Files: prompt.md, phase1-metaplan.md, phase1-metaplan-rerun.md, phase2-security-minion.md, phase2-frontend-minion.md, phase3-synthesis.md, phase3.5-*.md (5 reviewers), phase5-*.md (3 code reviewers), plus corresponding prompt files.
