---
title: "Feature List and Competitor Comparison Table"
source-issue: 144
timestamp: 2026-03-26T04:44:07
branch: worktree-cuddly-sparking-badger
slug: feature-list-competitor-comparison
status: complete
---

# Nefario Execution Report: Feature List and Competitor Comparison (#144)

## Original Prompt

Add a feature list section and competitor comparison table to the landing page
and docs site. The feature list covers WRL's core capabilities with a
developer/technical benefits subsection. The comparison table covers 9+
competitors across integrity, signing, timestamps, verification, API, format,
and eIDAS columns. Summary version on landing page, full version on docs site.

## Team

### Phase 2 Specialists (5)
- **frontend-minion**: Landing page HTML/CSS implementation, responsive grid, mobile card-stack
- **product-marketing-minion**: Feature messaging, competitor positioning, badge system
- **seo-minion**: Structured data expansion, cross-linking strategy, docs SEO audit
- **software-docs-minion**: Docs comparison page structure, Nunjucks template, methodology section
- **ux-strategy-minion**: Information hierarchy, mobile UX, card fatigue avoidance

### Phase 3.5 Reviewers (7)
- **lucy**: Success criteria validation, missing features catch (CLI verify + webhooks)
- **margo**: Complexity review, parallel write conflict detection, sync comment accuracy
- **accessibility-minion**: Screen reader table semantics, aria-hidden recommendation (later reversed)
- **security-minion**: No sensitive data exposure in comparison content
- **seo-minion**: Docs template SEO gaps (deferred to backlog)
- **test-minion**: No code tests needed for HTML/CSS-only changes
- **ux-strategy-minion**: Mobile card-stack validation, badge contrast review

### Phase 5 Code Reviewers (2)
- **lucy**: Caught incorrect aria-hidden on thead, approved after fix
- **margo**: Caught misleading sync comments, approved after fix

## Execution Summary

2 tasks executed sequentially (Task 2 depended on Task 1's CSS):

1. **Task 1** (frontend-minion): Landing page — feature list section, summary comparison table, nav link, JSON-LD expansion, CSS for both sections including mobile card-stack. 4 files modified.

2. **Task 2** (frontend-minion): Docs site — full comparison page (compare.njk), docs CSS with card-stack pattern, nav entry. 3 files modified/created.

## Key Decisions

1. Lightweight list over cards for features (avoid card fatigue)
2. 4 competitors × 4 columns on landing (density limit); 9 × 7 on docs
3. Nunjucks (.njk) for docs page (data-label attributes impossible in Markdown)
4. Single /compare/ page (no separate /features/)
5. "Features" in nav, "Compare" excluded (5 links = scannable limit)
6. Docs SEO infrastructure deferred to backlog
7. Public sources only, methodology disclosure, "Not documented" over "No"

## Post-Execution Fixes

- Removed `aria-hidden="true"` from `<thead>` (incorrectly added per a11y review; `.sr-only` CSS already handles mobile hiding)
- Updated CSS sync comments from "equivalent pattern" to "contexts differ intentionally, do not merge"

## Artifacts

- 5 files modified, 1 file created
- 2 commits on branch `worktree-cuddly-sparking-badger`
- Evolution log: `docs/evolution/0090-feature-list-competitor-comparison/`
- Companion directory: `docs/history/nefario-reports/2026-03-26-044407-feature-list-competitor-comparison/`

## Backlog Changes

- Marked #144 as DONE (Phase 0090) in Product Features parking lot
- Added: [consider] Docs site SEO infrastructure (canonical tags, OG tags, BreadcrumbList)
