---
task: "Web UI for Capture Submission and Browsing"
date: 2026-03-22
slug: web-ui-capture-browsing
mode: execution
source-issue: 47
task-count: 4
gate-count: 1
compaction-events: 1
---

## Summary

Built a browser-based Web UI for WRL served from the existing Cloudflare Worker at `GET /ui`. The UI provides capture submission, capture list with pagination, and capture detail view with verification status — all using vanilla HTML/JS/CSS with no frameworks. Auth uses sessionStorage + Bearer header. 9 new files, 2620 lines added, 38 new tests (755 total, all passing).

## Original Prompt

GitHub Issue #47: R17 — Web UI for capture submission and browsing

Build a browser-based interface so evaluators can try WRL by clicking a link rather than using a terminal. Success criteria: capture submission form, capture list view, capture detail view, auth flow (API key input), works on mobile, no JS frameworks.

## Key Design Decisions

1. **Hash-based routing with single Worker route** — `#/captures` and `#/captures/:id` handled client-side; Worker serves one HTML page at `GET /ui`. Over: path-based routing with server-side catch-all (collides with existing regex router and 404 behavior).

2. **sessionStorage over localStorage** — Bearer tokens clear on tab close. Over: localStorage persistence (security-minion argued tokens shouldn't persist on shared evaluator machines).

3. **Combined submit+list view** — Submit form sits above the capture list at `#/captures`. Over: separate routes for submit and list (ux-strategy-minion's inbox pattern provides immediate feedback).

4. **Single responsive DOM** — CSS grid adapts via media queries. Over: dual table/cards DOM (margo flagged doubled event wiring complexity).

5. **Favicon via /favicon.ico** — References existing Worker route. Over: inline data: URI (blocked by `img-src 'self'` CSP; lucy caught this at Task 1 gate).

6. **textContent-only rendering** — All API data via textContent/createElement. No innerHTML with variable data. Over: template-string innerHTML (security-minion's non-negotiable requirement given `script-src 'unsafe-inline'`).

7. **autocomplete="current-password"** — Allows password managers per WCAG 2.2 SC 3.3.8. Over: autocomplete="off" (accessibility-minion flagged the barrier).

## Phases

### Phase 1: Meta-Plan
Identified 6 specialists: frontend-minion (architecture), security-minion (auth model, CSP, XSS), api-design-minion (endpoint compatibility), ux-strategy-minion (user flow), test-minion (test strategy), software-docs-minion (documentation scope).

### Phase 2: Specialist Planning
All 6 contributed. Key consensus: hash routing, sessionStorage, same-origin (no CORS changes), textContent-only rendering, combined form+list view. Conflicts: localStorage vs sessionStorage (resolved for sessionStorage), separate vs combined views (resolved for combined), dual vs single DOM (resolved for single).

### Phase 3: Synthesis
4 tasks, 1 gate. Execution agent: frontend-minion (sonnet, bypassPermissions). Gate on Task 1 (shell + routing foundation — hard to reverse, all other tasks depend on it).

### Phase 3.5: Architecture Review
5 mandatory reviewers (security, test, ux-strategy, lucy, margo) + 2 discretionary (ux-design, accessibility). All APPROVE or ADVISE. Key advisories incorporated: autocomplete fix, single responsive DOM, no root redirect.

### Phase 4: Execution

**Task 1**: Worker route, HTML shell, auth gate, CSS foundation
- Created `src/ui/ui-shell.js` (HTML shell with hash router), `src/ui/ui-auth.js` (auth gate + apiFetch), `src/ui/ui-css.js` (page-level CSS), stub views
- Added `GET /ui` route to `src/index.js`
- Gate approved after lucy caught CSP/favicon conflict (fixed: `/favicon.ico` instead of data: URI)

**Task 2**: Combined submit form + capture list view
- `src/ui/ui-submit.js` (560 lines): URL validation, optimistic UI, pagination, error handling
- `src/ui/ui-poll.js` (142 lines): setTimeout-based polling with Retry-After, visibility pause, 120s timeout, aria-live

**Task 3**: Capture detail view
- `src/ui/ui-detail.js` (584 lines): complete/pending/failed/error layouts, metadata grid, screenshot display, artifact links, live polling
- `src/ui/ui-css.js` grew to 675 lines (+247 detail view CSS)

**Task 4**: Tests, documentation, polish
- `test/ui-dashboard.test.js` (276 lines): 38 tests covering response headers, HTML structure, CSP exact match, innerHTML security scan, polling guards, route integration
- README Web UI section added
- Comment banners in shell for DevTools orientation

### Phase 5: Code Review
3 reviewers (code-review-minion, lucy, margo) — all ADVISE, 0 BLOCK.
4 findings auto-fixed: dead code removal, silent catch fix (fail loudly), `// tva` signature, innerHTML test regex anchoring.
3 findings accepted as-is (low-risk for MVP): auth timeout abort race, fetchAndRenderDetail complexity, overlapping media query breakpoints.

### Phase 6: Test Execution
755 tests passed, 2 skipped (pre-existing), 0 failures, 0 regressions. Duration: 8.49s.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
8a assessment: all items addressed by Task 4 (README section). 0 MUST items. Phase 8b skipped (no unaddressed items).

## Verification

Verification: code review passed (3 ADVISE, 4 findings auto-fixed), all tests pass (755 passed, 2 skipped).

## Agent Contributions

### Planning (Phase 2)
| Agent | Recommendation |
|-------|---------------|
| frontend-minion | Hash routing, modular file structure in src/ui/, polling via setTimeout |
| security-minion | sessionStorage + Bearer header, strict CSP, textContent-only rendering |
| api-design-minion | No CORS changes needed, existing endpoints sufficient |
| ux-strategy-minion | Combined form+list, inline auth gate, empty state = the form itself |
| test-minion | Vitest worker tests primary (80%+), E2E deferred |
| software-docs-minion | Inline-first docs, light README section, UI is self-documenting |

### Review (Phase 3.5)
| Agent | Verdict |
|-------|---------|
| security-minion | APPROVE |
| test-minion | ADVISE (CSP exact match, innerHTML scan, polling guards) |
| ux-strategy-minion | APPROVE |
| lucy | ADVISE (no root redirect, autocomplete fix) |
| margo | ADVISE (single responsive DOM) |
| ux-design-minion | APPROVE |
| accessibility-minion | ADVISE (autocomplete="current-password") |

### Code Review (Phase 5)
| Agent | Verdict | Findings |
|-------|---------|----------|
| code-review-minion | ADVISE | Auth timeout race, silent catch, dead code, test regex |
| lucy | ADVISE | Missing // tva, silent catch, dead code |
| margo | ADVISE | Duplicate timeout logic, detail view complexity, dead code |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — orchestration

</details>

<details>
<summary>Compaction</summary>

1 compaction event (after Phase 3.5, before Phase 4 execution).

</details>

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-22-141103-web-ui-capture-browsing/`

Files:
- prompt.md — original user prompt
- phase1-metaplan-prompt.md, phase1-metaplan.md
- phase2-{frontend,security,api-design,ux-strategy,test,software-docs}-minion.md (with prompts)
- phase3-synthesis-prompt.md, phase3-synthesis.md
- phase3.5-{security,test,ux-strategy,lucy,margo,ux-design,accessibility}-minion.md (with prompts)
- phase4-frontend-minion-task{1,2,3,4}-prompt.md
- phase5-{code-review-minion,lucy,margo}.md (with prompts)
- phase6-test-results.md
- phase8-checklist.md
