# Process: Phase 0048 — Brand Identity and Design System

## TL;DR

Seven specialist agents planned a pure CSS design system for WRL. The key
tension was between feature completeness (the issue specifies 12 component
patterns, logos, favicon, style guide) and YAGNI discipline. The team landed
on "include everything the issue requires, but keep each component under 10
lines." Three WCAG AA contrast failures were caught during architecture review
and fixed before any code was written. The execution produced 10 new files and
modified 3, with 717 tests passing. Code review found and auto-fixed 3 issues
(duplicate .sr-only, missing --color-info-text, orphaned .spinner motion rule).

## Team composition

**Planning specialists** (Phase 2):
- **frontend-minion** — CSS architecture, token naming, component patterns
- **ux-strategy-minion** — Journey coherence, cognitive load, simplification
- **ux-design-minion** — Visual design, color theory, typography scale
- **accessibility-minion** — WCAG AA compliance, contrast ratios, motion
- **security-minion** — CSP implications, favicon serving, SVG sanitization
- **devx-minion** — Developer ergonomics, style guide structure
- **lucy** — Governance, CLAUDE.md compliance, issue requirement coverage

**Architecture reviewers** (Phase 3.5):
- All 5 mandatory (security, test, ux-strategy, lucy, margo)
- 2 discretionary (ux-design-minion, accessibility-minion)

**Code reviewers** (Phase 5):
- code-review-minion, lucy, margo (all ADVISE, 0 BLOCK)

## Where the specialists disagreed

### Component patterns: include or defer?

**ux-strategy-minion** argued component patterns should be deferred to R17
(Web UI) since the verification page is the only consumer today. Including 12
component classes for a single page violates YAGNI.

**lucy** countered that the issue success criteria explicitly require "component
patterns defined in CSS: buttons, form inputs, tables, cards, badges, alerts."
Deferring would fail the acceptance criteria.

**Resolution**: Include all 12 patterns but constrain each to under 10 lines.
This satisfies the requirement without over-engineering. The patterns exist as
CSS classes ready for R17 consumption without being speculative infrastructure.

### CSS delivery: external file vs inline

**frontend-minion** recommended serving `design-system.css` as a separate
static asset via Workers Static Assets for browser caching benefits.

**margo** pushed back: adding a Workers Static Assets binding, routing logic,
and a cache-busting strategy for a sub-8KB file adds operational complexity
with negligible performance benefit. The existing pattern is HTML-with-inline-CSS.

**devx-minion** proposed a middle ground: keep CSS inlined in the HTML response
(zero-latency, matches existing pattern) but maintain a real `.css` file as
source of truth for syntax highlighting and linting, with a `.js` wrapper for
the Worker import.

**Resolution**: Adopted devx-minion's proposal. `design-system.css` is the
canonical source; `design-system.js` is a manually-synced template literal
export. No build step (per issue constraints). Sync verified by tests.

### Color palette: what shade of institutional?

**ux-design-minion** proposed a dark ink-blue primary (#2a3444) to communicate
"notarial seal" trust — appropriate for an evidence/legal product.

**accessibility-minion** validated the color against WCAG AA and found three
problems during review:
1. `--color-text-muted` (#7a7672) fails on non-white backgrounds (4.17:1 on
   page bg, 4.03:1 on surface-muted — both under 4.5:1)
2. `--color-warning` (#e6a817) on warning-bg (#fff8e1) = 1.98:1 for text
3. No `--color-info-text` token (inconsistent with other semantic colors)

**Resolution**: Fixed all three before execution began:
1. Darkened text-muted to #6e6a66
2. Added --color-warning-text: #7a5800 (dark amber for text, bright amber for icons)
3. Added --color-info-text: #0d47a1 during code review (caught as a consistency gap)

## Human interventions

This was an autonomous execution (no human at gates). Lucy agent made all
gate decisions:
- **Team gate**: Approved as proposed
- **Reviewer gate**: Approved with mandatory + discretionary reviewers
- **Execution plan gate**: Approved
- **Task gates**: All approved with "Run all" post-execution option
- **Calibration check**: "Gates are fine"

## What was deliberately left alone

- **CSS/JS sync risk**: All three reviewers flagged the manual sync between
  `design-system.css` and `design-system.js`. The project constraint is "no
  build step," and wrangler text modules aren't available in this pipeline.
  Token-by-token assertions in the test suite catch drift for critical values.
  A byte-for-byte comparison test would require `node:fs` which isn't available
  in the Workers test environment. Accepted as a known trade-off.

- **`scripts/generate-favicon.sh`**: Lucy and margo both noted this script
  generates a `.ico` file that the Worker never serves (it serves SVG directly).
  Kept as documentation for future use — if a binary `.ico` is ever needed,
  the command is preserved. Not dead code per se, more like a recipe.

- **`rgba(0,0,0,0.06)` in verify-page.js**: One remaining hardcoded color
  literal for a hover overlay. code-review-minion flagged it. Not worth a
  design token for a single transparent overlay value.

## Where to read more

- Nefario execution report: `docs/history/nefario-reports/` (timestamped file)
- Scratch files (planning prompts, specialist contributions, review verdicts):
  copied to the companion directory alongside the report
- Design decisions with rationale: `docs/evolution/0048-brand-identity-design-system/decisions.md`
- Style guide: `docs/style-guide.md`
