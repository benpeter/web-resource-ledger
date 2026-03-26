# Process: LLM Developer Reference

## TL;DR

Five planning specialists converged on a single recommendation with zero conflicts: place a dense, table-based reference document at `docs/INTERNALS.md` with a `.claude/rules/` pointer for discoverability. Margo's Phase 3.5 review eliminated an unnecessary approval gate, collapsing 3 tasks to 2. The executing agent discovered 12 active D1 tables (not 10 as planned) and 55 routes (not 50+). Total document: 437 lines, ~3,954 words. The `.claude/rules/` pointer could not be created due to Claude Code's sensitive file protections.

## Planning Phase

### Meta-Plan (Phase 1)

Nefario identified 5 specialists for planning:

1. **ai-modeling-minion** — how LLMs consume context, format/placement decisions
2. **api-spec-minion** — route table design, avoiding OpenAPI duplication
3. **data-minion** — D1 schema documentation strategy
4. **ux-strategy-minion** — information hierarchy for dual audiences (LLM + human)
5. **software-docs-minion** — placement in existing docs ecosystem

**Notable exclusions**: security-minion (no attack surface — listing names not values), iac-minion (documenting wrangler.toml, not modifying it), devx-minion (DX concern is content/placement, covered by ai-modeling + ux-strategy).

The meta-plan also discovered one external skill (`ops-runbook`, classified as LEAF — operational procedures, not directly relevant but referenced to avoid content duplication).

### Specialist Consultations (Phase 2)

All 5 specialists ran in parallel. Key findings from each:

**ai-modeling-minion** read the existing `.claude/rules/` files (4-12 lines each) and CLAUDE.md structure. Recommended `docs/INTERNALS.md` as on-demand reference with a tiny pointer in `.claude/rules/`. Estimated the document at ~2,400 tokens and suggested a 3K ceiling. Flagged staleness as the primary risk.

**api-spec-minion** read `src/index.js` and found 61 routes in the array plus 2 special-case routes. Identified 4 auth mechanisms dispatched by URL prefix in the fetch handler. Recommended a single flat route table with auth type, rate limit group, and surface classification columns. Noted that the auth dispatch model is undocumented anywhere.

**data-minion** read all 16 migrations and found 10 active tables (later corrected to 12 during execution). Recommended hand-written current-state tables over DDL blocks or auto-generation. Identified key documentation pitfalls: the quarantined virtual status, content-addressed WACZ keys, JSON column shapes defined only in code.

**ux-strategy-minion** recommended random access over narrative, frequency-of-access section ordering (bindings first), and a sub-200-word mental model scaffold. Argued that the highest-ROI artifact is a bindings summary table mapping every `env.*` name to its type and purpose.

**software-docs-minion** read the full docs structure and recommended `docs/INTERNALS.md` (matching peers like `docs/mcp.md` and `docs/audit-log-schema.md`). Specified what NOT to duplicate: openapi.yaml, OPERATIONS.md, audit-log-schema.md.

**Zero conflicts across specialists.** All 5 independently arrived at the same placement decision and table-based format.

### Synthesis (Phase 3)

Nefario's synthesis made 5 decisions, all ratifying specialist consensus:

1. `docs/INTERNALS.md` with `.claude/rules/` pointer (unanimous)
2. Hand-written tables with inline JSON shapes and app-layer constraints (data-minion + ai-modeling-minion)
3. Single flat route table (api-spec-minion's recommendation, endorsed by ux-strategy-minion for scannability)
4. Frequency-of-access section ordering (ux-strategy-minion's analysis, adopted unanimously)
5. No generation script for MVP (all agreed: maintenance burden of script exceeds doc)

Original plan: 3 tasks with 1 approval gate on the skeleton.

### Architecture Review (Phase 3.5)

5 mandatory reviewers, no discretionary (pure documentation task):

- **security-minion**: APPROVE. Secret safeguards adequate.
- **test-minion**: APPROVE. Validation steps in Task 2 sufficient.
- **ux-strategy-minion**: APPROVE. Suggested collocating JSON/constraint annotations in per-table Notes columns instead of separate sub-tables. Incorporated.
- **lucy**: ADVISE. Flagged evolution log and backlog update as orchestrator responsibilities. Correct — handled post-execution.
- **margo**: ADVISE. Two findings: (1) merge Tasks 1+2 — the skeleton approval gate overstates rework cost for a markdown file. (2) Five reviewers for markdown-only deliverable is disproportionate process overhead. Finding 1 was accepted (tasks merged, gate removed). Finding 2 was acknowledged but not actionable — mandatory reviewers are not user-adjustable.

**Margo's gate elimination was the most impactful review action.** It removed a blocking dependency and a round-trip for zero risk reduction.

## Execution Phase

### What Changed from Plan

- Tasks collapsed from 3 to 2 (margo's ADVISE)
- Approval gate removed (margo's ADVISE)
- JSON/constraint annotations moved into per-table Notes columns (ux-strategy-minion's ADVISE)
- D1 table count corrected from 10 to 12 (discovered during execution)
- Token budget exceeded: target was 3K, actual ~5.2K. The 12-table schema with 55 routes and extensive binding detail simply requires this space. No prose bloat was present to cut.

### What the Human Did NOT Intervene On

This was an autonomous execution (no human at the gates). Lucy served as the gate proxy throughout:
- Team approval: APPROVE (no changes)
- Reviewer approval: auto-approved (no discretionary reviewers)
- Execution plan approval: APPROVE (flagged OPERATIONS.md existence concern — false negative, file exists)

### Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/2026-03-26-043000-llm-developer-reference/`
- Meta-plan: `phase1-metaplan.md` in companion directory
- Synthesis: `phase3-synthesis.md` in companion directory
- Review verdicts: `phase3.5-*.md` files in companion directory
