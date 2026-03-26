# Outcome: LLM Developer Reference

## What Was Built

A structured reference document (`docs/INTERNALS.md`) that gives LLMs and developers the context needed to operate on WRL without codebase archaeology. The document covers:

- **System Overview** — one-paragraph mental model scaffold
- **Bindings** — all 16 wrangler.toml bindings (D1, R2, KV, 6 rate limiters, browser, 6 queue producers)
- **Secrets** — 13 secrets (names only, no values)
- **Variables** — 11 vars from `[vars]` section
- **D1 Schema** — 12 active tables across 7 domains with column types, constraints, JSON column shapes, and app-layer constraints inline
- **API Routes** — 52 router entries + 3 special-case routes, with auth type, rate limit group, and surface classification
- **KV Key Patterns** — 4 patterns with TTLs, purposes, and source modules
- **R2 Object Key Patterns** — 5 patterns including content-addressed WACZ distinction
- **Queues** — 6 queues (3 main + 3 DLQ) with batch size, retry, and concurrency settings
- **Cron Triggers** — 3 triggers with handlers and purposes
- **Rate Limiters** — 6 binding-level + 5 application-layer defaults
- **Staging Differences** — 14 items that differ from production

Additionally:
- Cross-reference added to `OPERATIONS.md` line 10
- `.claude/rules/wrl-internals.md` pointer file — blocked by Claude Code sensitive file protections, flagged as HUMAN_ACTION_REQUIRED

## Validation Results

1. Route count: 52 tuples in `routes[]` + 3 special-case = 55 total. Match confirmed.
2. D1 tables: 12 active (not 10 as initially estimated). All documented. `share_tokens` absent. Correct.
3. KV patterns: 4 found via grep, all documented.
4. R2 patterns: 5 found via grep, all documented.
5. No secret values in document.

## What Deviated from Plan

- **Table count**: Planning estimated 10 active D1 tables; actual count is 12 (notification_preferences and notification_sent were added in later migrations and not counted in the planning phase estimate).
- **Token budget**: Target was 3K tokens; actual is ~5,200 tokens (~3,954 words). The dense table format with 12 schema tables and 55 routes simply requires this space. No prose bloat.
- **`.claude/rules/` pointer**: Could not be created automatically due to Claude Code treating `.claude/rules/` as a sensitive directory. Flagged for manual creation.

## Surface Consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — no new/changed endpoints |
| Docs site | No update needed — INTERNALS.md is for developers/LLMs, not end users |
| Landing page | No update needed — no pricing/feature changes |
| MCP server | No update needed — no API changes |
| Legal pages | No update needed — no new data collection or services |

## Backlog Changes

- **Added**: "Automated INTERNALS.md generation script" — deferred from this phase. A script that parses migrations, routes array, and wrangler.toml to regenerate INTERNALS.md would reduce staleness risk but is more complex than the doc itself. Low priority.
- No items removed or completed.
