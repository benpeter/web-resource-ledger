# Process: 0049 — Web UI for Capture Submission and Browsing

## TL;DR

Six specialists planned a vanilla JS Web UI for WRL in parallel. The synthesis resolved three conflicts (sessionStorage vs localStorage, combined vs separate views, single vs dual DOM) and produced a 4-task execution plan with one gate. Seven reviewers (5 mandatory + 2 discretionary) approved with advisories. A single frontend-minion agent executed all four tasks sequentially. Three code reviewers in Phase 5 found overlapping issues (dead code, silent catches, missing code signature). Total: 9 files, 2620 lines, 38 tests, 5 commits, one compaction event.

## Phase 1: Meta-Plan

Nefario identified six specialists for planning:

- **frontend-minion**: Architecture (routing, file structure, rendering pattern)
- **security-minion**: Auth model, CSP, XSS prevention
- **api-design-minion**: Endpoint compatibility, CORS assessment
- **ux-strategy-minion**: User flow, view composition, empty states
- **test-minion**: Test strategy, what to cover vs defer
- **software-docs-minion**: Documentation scope (inline vs standalone)

Notable exclusions: iac-minion (no infrastructure changes), observability-minion (client-side UI, no new logging), data-minion (no schema changes).

## Phase 2: Specialist Planning

All six specialists ran in parallel. Key arguments:

**frontend-minion** proposed path-based routing with separate `/submit` and `/captures` routes, localStorage for key persistence, and a modular file structure in `src/ui/`. Their routing proposal would have required a catch-all route in the Worker.

**security-minion** pushed hard for sessionStorage (not localStorage), strict CSP with `default-src 'none'`, and textContent-only rendering. They recommended `data:` in `img-src` for the favicon — this later conflicted with the plan's own decision to keep img-src tight.

**ux-strategy-minion** argued for the "inbox pattern" — a combined form+list view where submitting a URL immediately shows it in the list below. This contradicted frontend-minion's separate routes. UX-strategy also cut the "Try again" prefill feature for failed captures, arguing cross-view state coordination was unjustified for MVP.

**api-design-minion** confirmed no CORS changes were needed (same-origin), existing endpoints were sufficient, and `hasWacz` was nice-to-have but not required.

**test-minion** recommended Vitest worker tests as the primary layer (80%+ of test value), with E2E browser tests deferred. They proposed specific guard tests: CSP exact match, innerHTML pattern scan, polling module content assertions.

**software-docs-minion** argued the UI should be self-documenting with inline help text. No separate user guide needed for three views. A brief README section was sufficient for discovery.

## Phase 3: Synthesis

The synthesis resolved three conflicts:

1. **sessionStorage vs localStorage**: security-minion's argument won — evaluators on shared machines shouldn't have persistent bearer tokens. frontend-minion's convenience argument was weaker than the security posture.

2. **Combined vs separate views**: ux-strategy-minion's inbox pattern won — immediate feedback after submission is the primary user benefit. frontend-minion didn't strongly object.

3. **Hash routing vs path routing**: frontend-minion's own analysis favored hash routing once the regex router collision was identified. No real conflict — consensus.

The plan produced 4 tasks: (1) shell + auth + routing, (2) submit form + list, (3) detail view, (4) tests + docs + polish. One gate on Task 1 (establishes the foundation all others build on).

## Phase 3.5: Architecture Review

Seven reviewers (5 mandatory + 2 discretionary):

- **security-minion**: APPROVE — no concerns beyond what was already in the plan
- **test-minion**: ADVISE — recommended CSP exact-match assertion, innerHTML pattern scan, polling guard tests. All incorporated into Task 4 prompt.
- **ux-strategy-minion**: APPROVE
- **lucy**: ADVISE — caught root redirect as out of scope (removed), flagged autocomplete="off" (fixed to current-password)
- **margo**: ADVISE — pushed for single responsive DOM instead of dual table/cards. Incorporated.
- **ux-design-minion**: APPROVE
- **accessibility-minion**: ADVISE — autocomplete="current-password" per WCAG 2.2 SC 3.3.8

No BLOCKs. All advisories were actionable and incorporated into task prompts.

## Phase 4: Execution

Single agent (frontend-minion, sonnet model) executed all four tasks sequentially.

**Task 1 Gate**: Lucy reviewed the shell output and caught the CSP/favicon conflict — `img-src 'self'` blocks the `data:image/svg+xml` favicon URI from verify-page.js. The fix was straightforward: reference `/favicon.ico` (existing Worker route) instead of inline data URI. Gate approved after fix.

**Tasks 2-4**: No gates, no surprises. Task 4 ran the full test suite (755 tests) confirming no regressions.

## Phase 5: Code Review

Three reviewers ran in parallel:

- **code-review-minion**: ADVISE — identified auth timeout race condition (Promise.race doesn't abort the loser), silent catch violations, dead code, and innerHTML test regex too permissive
- **lucy**: ADVISE — missing `// tva` code signature on ui-poll.js, same silent catch and dead code findings
- **margo**: ADVISE — duplicate timeout logic in auth, high cognitive complexity in fetchAndRenderDetail, same dead code

All three independently flagged the same dead code block (ui-submit.js lines 94-97). Two flagged the same silent catch. This convergence gave high confidence these were real issues.

**Fixed (4 findings)**:
- Dead code removal (unanimous across all 3 reviewers)
- Silent catch in loadMoreCaptures → now shows error feedback (lucy + code-review)
- Missing `// tva` signature (lucy)
- innerHTML test regex anchoring (code-review)

**Accepted as-is (3 findings)**:
- Auth timeout abort race (code-review + margo) — low risk, good improvement for later
- fetchAndRenderDetail complexity (margo) — valid but refactoring not justified for MVP
- Overlapping media query breakpoints (margo) — cosmetic, no visual impact

## Human Interventions

This was a fully autonomous execution (AUTONOMOUS mode). All gate decisions were made by Lucy agent:
- Team approval: approved as-is
- Reviewer approval: approved with discretionary reviewers (ux-design, accessibility)
- Execution plan approval: approved
- Task 1 gate: approved after CSP/favicon fix
- Post-execution: "Run all" selected

No human overrides. No calibration adjustments.

## Where to Read More

- Full specialist discussions: `docs/history/nefario-reports/2026-03-22-141103-web-ui-capture-browsing/`
- Phase 2 contributions: `phase2-{agent-name}.md` files in the companion directory
- Phase 3.5 review verdicts: `phase3.5-{agent-name}.md` files
- Phase 5 code review findings: `phase5-{agent-name}.md` files
- Execution plan: `phase3-synthesis.md`
