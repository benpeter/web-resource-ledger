# Process: Feature List and Competitor Comparison (#144)

## TL;DR

Five specialists planned, seven reviewers vetted, two execution agents built.
The result: a 10-feature capability section and 4-competitor summary table on
the landing page, plus a full 9-competitor × 7-column comparison page on the
docs site. Two post-execution fixes (aria-hidden removal, sync comment
accuracy). Three commits, one PR. The interesting tension was between marketing
density and UX simplicity — the table that product-marketing wanted (9
competitors on landing) was twice what UX would allow.

## Phase 1: Meta-Plan

Nefario identified five specialists: frontend-minion (implementation),
product-marketing-minion (messaging and positioning), seo-minion (structured
data and discoverability), software-docs-minion (docs page structure), and
ux-strategy-minion (information hierarchy and mobile UX). No external skills
discovered.

## Phase 2: Specialist Planning

Five agents ran in parallel. Key contributions and tensions:

**product-marketing-minion** pushed for maximum competitive coverage — all 9
competitors on the landing page, 6 comparison columns, and a "Why WRL Wins"
narrative framing. Proposed badge-based visual system (pass/fail/skip) which
survived intact to the final implementation.

**ux-strategy-minion** argued the opposite direction: 3-4 competitors max on
landing, 3-4 columns, no scroll. Their core argument was cognitive load — a
9×7 table on a marketing page is a spreadsheet, not a comparison. They
proposed the lightweight feature list (no cards, no borders) which was adopted.

**frontend-minion** landed in between: 5-column responsive grid for features,
mobile card-stack pattern using `data-label` + CSS `::before` pseudo-elements.
Their card-stack proposal was the technical breakthrough that made the
comparison table mobile-viable without JavaScript.

**software-docs-minion** made the critical format call: the docs comparison
page must be `.njk` (Nunjucks), not Markdown, because `data-label` attributes
on `<td>` elements are impossible in Markdown tables. Precedent: `api-reference.njk`.

**seo-minion** proposed extensive docs site template changes (canonical URLs,
OG tags, BreadcrumbList structured data). This was the largest scope risk.

## Phase 3: Synthesis

Nefario resolved the marketing-vs-UX density conflict by splitting: 4
competitors × 4 columns on landing (UX wins), full 9 × 7 on docs
(marketing wins). The 4 landing competitors were chosen to maximize category
coverage: Wayback Machine (institutional recognition), PageFreezer (enterprise
credibility), Webrecorder (technical respect), Manual + Notarization (common
practice).

The seo-minion's template-level changes were deferred to backlog — they affect
15+ docs pages and deserve their own review cycle.

Two execution tasks:
1. Landing page: feature list, summary table, nav link, JSON-LD, CSS
2. Docs site: full comparison page, docs CSS, nav entry

## Phase 3.5: Architecture Review

Seven reviewers, all APPROVE (some with ADVISE notes):

**lucy** caught two gaps against #144 success criteria: CLI verification tool
and webhooks were missing from the feature list. Both were explicitly required
by the issue. This expanded the feature count from 8 to 10. Lucy also caught
the background alternation problem — inserting Features (muted) before How It
Works (muted) would break the white/muted alternation pattern.

**margo** caught that Tasks 1 and 2 both writing to `index.html` would cause
merge conflicts. The JSON-LD update was moved from Task 2 into Task 1.

**accessibility-minion** recommended `aria-hidden="true"` on `<thead>` for the
mobile card-stack pattern, arguing that visually-hidden headers shouldn't be
announced. This was adopted in execution but reversed in code review (see
Phase 5).

**seo-minion** reiterated docs template SEO gaps. Deferred per synthesis
decision.

**test-minion** confirmed no automated tests needed for HTML/CSS-only changes.

**security-minion** and **ux-strategy-minion** approved without issues.

## Phase 4: Execution

Two tasks ran sequentially (Task 2 depended on Task 1's CSS patterns):

**Task 1** (frontend-minion): Landing page implementation. 4 files modified.
The feature grid uses CSS Grid with `auto-fill` columns for natural responsive
behavior. The summary comparison table uses the same badge system
(pass/fail/skip) as the full docs table but with fewer columns. JSON-LD
expanded from 8 to 15 feature items.

**Task 2** (frontend-minion): Docs site implementation. Created `compare.njk`
with 217 lines of structured HTML. Each competitor row includes `data-label`
on every `<td>` for the mobile card-stack. Per-competitor H3 notes sections
provide nuanced context (e.g., acknowledging Webrecorder created the WACZ-Auth
spec that WRL implements). Methodology section discloses verification date and
invites corrections.

## Phase 5: Code Review

Two reviewers (lucy, margo):

**lucy** identified the `aria-hidden="true"` on `<thead>` was incorrect. The
reasoning: `.sr-only` CSS already positions the header off-screen on mobile
(visually hidden but announced by screen readers). Adding `aria-hidden` removed
the headers from screen readers on *desktop* too, where they're visible and
needed. The accessibility-minion's Phase 3.5 recommendation was well-intentioned
but wrong — the `.sr-only` class is specifically designed to keep content
accessible to assistive technology while hiding it visually.

**margo** caught that the CSS sync comments ("equivalent pattern in...") were
misleading. The landing and docs implementations share the same *approach*
(card-stack via data-label) but differ in specifics (breakpoints, margins,
min-width). Updated to "contexts differ intentionally, do not merge."

Both fixes applied in a follow-up commit. Both reviewers approved after fixes.

## Autonomous Gate Decisions

All gates decided by Lucy agents (autonomous mode, no human operator):

- **Team approval (P1)**: Approved as proposed
- **Execution plan approval (P3)**: Approved with 3 ADVISE notes incorporated
- **Reviewer approval (P3.5)**: Approved with gru, lucy, margo included
- **Code review fixes (P5)**: Auto-fixed (aria-hidden removal, sync comments)

## Where to Read More

- Specialist contributions: `docs/history/nefario-reports/2026-03-26-044407-feature-list-competitor-comparison/phase2-*.md`
- Synthesis: `docs/history/nefario-reports/2026-03-26-044407-feature-list-competitor-comparison/phase3-synthesis.md`
- Review verdicts: `docs/history/nefario-reports/2026-03-26-044407-feature-list-competitor-comparison/phase3.5-*.md`
- Code review: `docs/history/nefario-reports/2026-03-26-044407-feature-list-competitor-comparison/phase5-*.md`
- Decisions: `docs/evolution/0090-feature-list-competitor-comparison/decisions.md`
- Outcome: `docs/evolution/0090-feature-list-competitor-comparison/outcome.md`
