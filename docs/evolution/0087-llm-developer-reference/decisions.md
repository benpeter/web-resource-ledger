# Decisions: LLM Developer Reference

## Document Location: `docs/INTERNALS.md`

**Chosen:** `docs/INTERNALS.md` with a 3-line pointer in `.claude/rules/wrl-internals.md`

**Over:**
- Placing full content in `.claude/rules/` (always-loaded) — rejected because rules files are 4-12 lines each; a ~250-line doc would waste ~2,500 tokens on sessions that never touch schema/routes
- Using `llms.txt` at repo root — rejected because `llms.txt` is a web-crawler convention, not applicable to internal dev refs
- Embedding in CLAUDE.md — rejected because CLAUDE.md is process philosophy, not technical reference

**Why:** All five planning specialists converged on this. The pointer pattern costs ~40 tokens always-loaded; the full doc is loaded on-demand when needed. The `.claude/rules/` pointer was blocked by Claude Code's sensitive file protections — flagged as HUMAN_ACTION_REQUIRED.

## Schema Format: Hand-Written Tables

**Chosen:** Hand-written current-state tables grouped by domain, with JSON column shapes and app-layer constraints documented inline (in Notes column)

**Over:**
- Raw CREATE TABLE DDL — tables can include what DDL cannot: JSON column shapes, app-layer-only constraints, ID format conventions
- Auto-generated from migrations — ALTER TABLE parsing across 16 migrations is fragile; maintenance burden of the script exceeds the doc itself

## Route Table: Single Flat Table

**Chosen:** One flat route table with columns: Method, Path, Auth, Rate Limit, Surface

**Over:** Separate tables per domain or a two-table split (public vs internal) — flat table is most scannable, Surface column provides grouping signal without requiring multiple tables

## Section Ordering: Frequency of Access

**Chosen:** System overview → bindings → secrets/vars → D1 schema → routes → KV → R2 → queues → crons → rate limiters → staging differences

**Why:** ux-strategy-minion's analysis showed bindings (`env.SOMETHING`) are the most frequent lookup in code-writing sessions, followed by schema, then routes.

## No Generation Script

**Chosen:** Hand-written doc with "Last verified" date and source file pointers

**Over:** `scripts/generate-internals.sh` — the schema has 10 tables and changes infrequently; a generation script handling ALTER TABLE, CHECK constraints, and JSON column annotations would be more complex than the doc itself. Deferred to backlog.

## Merging Skeleton + Content Tasks

**Chosen:** Single execution task (structure + content together)

**Over:** Original plan had Task 1 (skeleton) with approval gate, then Task 2 (content) — margo's Phase 3.5 ADVISE correctly identified the gate as over-engineering for a markdown file where wrong headings are trivially fixed in-place.

## Token Budget Exceeded but Accepted

The 3K token target was aspirational. Final document is ~5,200 tokens (~3,954 words). The content is entirely dense tables with no prose bloat — the 12-table D1 schema, 52+ routes, and extensive binding/queue/cron detail simply requires this space. Cutting would reduce accuracy.
