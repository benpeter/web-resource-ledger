# Outcome: --legal flag for verify CLI

## What was built

Added `--legal` flag to `@w-r-l/verify` CLI that produces comprehensive,
plain-language verification reports suitable for submission in legal
proceedings. Two output modes:

- `--legal` produces a 7-section plain-text report (no ANSI codes)
- `--legal --json` produces machine-readable JSON with enriched explanations

### Files created
- `packages/verify/lib/format-legal.js` (~720 lines) — formatLegal() and formatLegalJson()
- `packages/verify/test/format-legal.test.js` (~500 lines) — 82 structural tests

### Files modified
- `packages/verify/lib/cli.js` — --legal flag parsing, 3-way format routing
- `packages/verify/lib/format.js` — exported checkLabel() and CHECK_LABELS
- `packages/verify/test/cli-args.test.js` — --legal parseArgs tests
- `packages/verify/README.md` — --legal flag documentation
- `site/content/verification.md` — legal report section
- `site/content/legal-evidence.md` — legal evidence guide section

### Test results
- 230 total tests, 0 failures
- 82 new tests for format-legal.js (14 suites)
- 3 new tests in cli-args.test.js

## Success criteria verification

| Criterion | Status |
|-----------|--------|
| `--legal` produces structured report with 7 sections | Done |
| Language precise but accessible to legal professionals | Done — inline explanations for all crypto terms |
| All values untruncated | Done — Section 7 shows full hashes, signatures, key IDs |
| Distinguishes RFC 3161 vs eIDAS qualified timestamps | Done — separate subsections with legal weight explanation |
| `--legal --json` variant | Done — enriched JSON with explanations, legal context |
| Default output unchanged | Done — existing formatHuman/formatJson paths untouched |
| No ANSI codes in --legal mode | Done — structural (no ANSI helpers imported) |
| References FRE 901(b)(9) and eIDAS Art. 41 | Done — factual citations, no admissibility claims |

## Surface consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — --legal is CLI-only, not an API endpoint |
| Docs site | Updated — verification.md and legal-evidence.md |
| Landing page | No update needed — no pricing/tier changes |
| MCP server | No update needed — no new API endpoints |
| Legal pages | No update needed — no new data collection or services |

## Backlog changes

No backlog changes. Issue #166 was not in the backlog (it was a direct
feature request). No items were deferred or created.

## Deviations from plan

1. Code review identified shell-quoting issue in reproducibility command —
   fixed by adding `shellQuote()` helper
2. Code review identified summary count could disagree with Section 3 —
   fixed by scoping count to `checkOrder`
3. Unused `CHECK_LABELS` import and dead `legalMode` variable cleaned up
   during review fixes
4. Pre-existing `getVersion()` silent catch noted but not fixed (out of
   scope — pre-existing code, not introduced by this PR)
