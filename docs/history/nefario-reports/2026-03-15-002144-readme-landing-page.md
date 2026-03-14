---
task: "Restructure README as project landing page with usage examples and complete setup docs"
date: 2026-03-15
slug: readme-landing-page
source-issue: 16
mode: execution
task-count: 1
gate-count: 1
compaction-events: 0
---

## Summary

Restructured README.md from a setup manual (100 lines, infrastructure-first) to a project landing page (193 lines, value-first). New structure: badges, tagline, positioning, "what you get" artifact list, 4-step curl walkthrough, complete setup with CAPTURE_API_KEY documentation, cross-reference to CONTRIBUTING.md, despicable-agents section, reference (key rotation, public key endpoint), license. All existing setup instructions preserved. Node.js version corrected from 18+ to 20+. All 321 tests pass.

## Original Prompt

Restructure README as project landing page with usage examples and complete setup docs.

The README serves as an effective landing page so that someone encountering the project for the first time can quickly understand what WRL does and why it matters, see how to use it with concrete examples, and then find complete setup instructions -- in that order. The current README buries the value proposition and omits critical setup steps (CAPTURE_API_KEY), making first-time adoption unnecessarily difficult.

Success criteria:
- README structure follows: positioning/why -> usage examples -> setup/deploy
- Positioning section explains what WRL does and why
- Usage section includes curl-based examples for the core flow
- CAPTURE_API_KEY documented for production and local dev
- README mentions despicable-agents
- Both despicable badge and vibe-coded badge present
- All existing setup instructions preserved

## Key Design Decisions

1. **Information architecture: positioning -> usage -> setup** -- All four specialists agreed. ux-strategy-minion diagnosed the current README as "catastrophic" -- 91 lines of infrastructure before any API indication. Serves the Evaluator persona first (most common first-time visitor).

2. **`wrl.example.com` over `$WRL_URL` for placeholder hostname** -- devx-minion won over ux-strategy-minion. Consistency with openapi.yaml matters more than avoiding a copy-paste risk that's handled by a note.

3. **Four usage steps, not three** -- devx-minion won over product-marketing-minion and ux-strategy-minion. The async API (202 -> poll -> retrieve) is a three-step operation. Hiding the async nature would confuse developers.

4. **`$WRL_API_KEY` in examples, `CAPTURE_API_KEY` in setup** -- devx-minion's recommendation. User-facing env var follows `{PRODUCT}_{TYPE}` convention. Explicit bridge sentence prevents confusion.

5. **"What you get" section included** -- product-marketing-minion won over ux-strategy-minion. 7-line bullet list communicates value faster than curl output, doesn't push Usage below the fold.

## Phases

### Phase 1: Meta-Plan
Identified 4 specialists: devx-minion (curl examples), product-marketing-minion (positioning), user-docs-minion (information architecture), ux-strategy-minion (journey coherence). No external skills detected.

### Phase 2: Specialist Planning
All 4 ran in parallel. Key consensus: positioning -> usage -> setup order, progressive disclosure, happy-path-only examples. devx-minion caught the async API teaching opportunity. product-marketing-minion mapped 8 competitors and flagged the legal admissibility overpromise risk. user-docs-minion flagged the `.dev.vars.example` gap (deferred). ux-strategy-minion set a 50-line budget for usage.

### Phase 3: Synthesis
Resolved 5 conflicts (hostname, step count, badges, env var naming, section placement). Produced single-task plan with one approval gate. Routed execution to devx-minion (sonnet).

### Phase 3.5: Architecture Review
6 reviewers (5 mandatory + user-docs-minion). Results: 3 APPROVE (test-minion, ux-strategy-minion, user-docs-minion), 3 ADVISE (security-minion, lucy, margo), 0 BLOCK. Advisories incorporated: openssl entropy guidance, verify URL vs capture ID distinction, per-section security warnings, evolution log compliance.

### Phase 4: Execution
Single task: devx-minion wrote README.md (193 lines). All success criteria met. Auto-committed.

### Phases 5-8
Phase 5 (code review): not applicable -- docs-only change.
Phase 6 (tests): 321 pass, API lint clean.
Phase 7 (deployment): not applicable.
Phase 8 (documentation): evolution log written (0013-readme-landing-page).

## Agent Contributions

### Planning (Phase 2)

| Agent | Contribution |
|-------|-------------|
| devx-minion | 4-step curl walkthrough design, $WRL_API_KEY naming, auth asymmetry callout, happy-path-only |
| product-marketing-minion | 3-sentence positioning, competitive analysis (8 alternatives), "What you get" section, legal admissibility risk |
| user-docs-minion | Section ordering, Reference section for day-2 ops, CONTRIBUTING.md cross-reference, .dev.vars.example gap |
| ux-strategy-minion | Progressive disclosure strategy, 50-line usage budget, auth asymmetry as UX asset, two-tier setup |

### Review (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | Entropy guidance, verify URL vs capture ID distinction, per-section security warnings |
| test-minion | APPROVE | Markdown-only change, no test implications |
| ux-strategy-minion | APPROVE | Endorsed plan including overruled recommendations |
| lucy | ADVISE | Evolution log compliance (CLAUDE.md requirement) |
| margo | ADVISE | Prompt over-specification, disproportionate reviewer count |
| user-docs-minion | APPROVE | Documentation hierarchy validated |

## Verification

Tests: 321 passed (17 files). API lint: clean (2 pre-existing explicit ignores). Code review: not applicable (docs-only). Documentation: evolution log 0013 written.

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- orchestration

</details>

<details>
<summary>Compaction</summary>

0 compaction events. User requested no compaction stops.

</details>

## Working Files

[2026-03-15-002144-readme-landing-page/](2026-03-15-002144-readme-landing-page/)

20 files: meta-plan, 4 specialist prompts + outputs, synthesis prompt + output, 6 reviewer verdicts, execution prompt, original prompt.
