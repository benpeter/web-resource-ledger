---
task: "Open-Source Readiness: baseline hygiene for outside contributors"
date: 2026-03-14
slug: open-source-readiness
mode: execution
task-count: 2
gate-count: 0
compaction-events: 3
---

## Summary

Brought web-resource-ledger to baseline open-source hygiene: .gitignore with OS/editor/env patterns, LICENSE with copyright attribution, package.json metadata, .nvmrc (Node 22 LTS), GitHub Actions CI (test + API lint, SHA-pinned actions), CONTRIBUTING.md (two-tier setup: zero-account Quick Start + optional full dev), SECURITY.md (GHSA reporting, goals-not-guarantees framing), CODE_OF_CONDUCT.md (Contributor Covenant v2.1). 13 files changed, +394/-3 lines. All 321 tests pass.

## Original Prompt

Execute the open-source readiness plan (phase 0012) for web-resource-ledger. This was planned with lucy, devx-minion, software-docs-minion, and margo.

Outcome: The repo meets baseline open-source hygiene standards so outside contributors can find, understand, and safely contribute to the project.

Steps 1-8: Fix .gitignore, fix LICENSE, package.json metadata, .nvmrc, CI workflow, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md.

Constraints: Follow CLAUDE.md evolution log requirements. Margo-approved scope only -- no ESLint, no Dependabot, no issue/PR templates, no CODEOWNERS, no release automation. Single PR against main.

## Key Design Decisions

1. **Node 22 LTS instead of 18** -- Original plan specified Node 18. iac-minion discovered wrangler 4.73.0 requires >=20.0.0. .nvmrc pins 22 (LTS through Oct 2027). engines field set to >=20.0.0. Node 20 rejected: exits LTS maintenance April 2026.

2. **Two-tier contributor setup** -- `npm test` works without any Cloudflare account (Miniflare simulates everything). `npm run dev` requires Workers Paid + Browser Rendering. CONTRIBUTING.md leads with zero-account Quick Start, frames full dev as optional.

3. **Code of Conduct enforcement via email, not GHSA** -- Originally planned to route conduct reports through GitHub Security Advisories. security-minion advised against conflating conduct and vulnerability channels. Uses maintainer email (ben@benpeter.com) instead.

4. **CI actions pinned to commit SHAs (with residual maintenance risk)** -- Version tags can be moved; SHAs are immutable. Without Dependabot (explicitly deferred per Margo), pinned SHAs require manual monitoring. Known trade-off documented in evolution log.

5. **"Goals, not guarantees" for SECURITY.md timelines** -- 72h acknowledgment / 7d assessment targets stated as goals. Avoids both corporate SLA language and underselling responsiveness.

## Phases

### Phase 1: Meta-Plan
Identified 3 specialists for planning: iac-minion (CI workflow, Node version, runner config), devx-minion (CONTRIBUTING.md structure, contributor workflow), software-docs-minion (community doc tone, evolution log format).

### Phase 2: Specialist Planning
All 3 specialists contributed. Key consensus: Node 22 LTS, two-tier contributor model, evolution log is maintainer-only, Contributor Covenant v2.1 verbatim. iac-minion caught the Node 18 incompatibility with wrangler 4.73.0.

### Phase 3: Synthesis
Resolved 2 conflicts: Node version (18 → 22 with engines >=20.0.0), CONTRIBUTING.md prerequisites (corrected to match engines field). Produced 2-task plan: Task 1 (all 8 file changes), Task 2 (evolution log, blocked by Task 1). 0 approval gates.

### Phase 3.5: Architecture Review
6 reviewers (5 mandatory + devx-minion discretionary). Results: 1 APPROVE, 5 ADVISE, 0 BLOCK. 10 advisories incorporated:
- [security] Separate conduct/vulnerability reporting channels
- [security] .env.* glob pattern in .gitignore
- [security] Document SHA maintenance gap as residual risk
- [ux-strategy] SHA verification as first-class verification step
- [devx] fetchMock leak consequence in testing gotchas
- [devx] `nvm use` in Quick Start before `npm install`
- [devx] "How This Project Is Built" leads with design rationale, not AI tooling
- [margo] CONTRIBUTING.md length guard with prioritized cut order
- [margo] Trim decisions.md to genuine architectural decisions only
- [lucy] Evolution log timing acknowledged (structural, not substantive)

### Phase 4: Execution
**Batch 1 -- Task 1** (devx-minion, sonnet): All 8 file changes. .gitignore (14 new lines), LICENSE (copyright filled), package.json (10 new fields), .nvmrc (Node 22), ci.yml (24 lines), CONTRIBUTING.md (68 lines), SECURITY.md (35 lines), CODE_OF_CONDUCT.md (83 lines). All 321 tests pass, lint:api clean.

**Batch 2 -- Task 2** (software-docs-minion, sonnet): Evolution log entry (prompt.md, decisions.md, outcome.md), evolution index updated, backlog CI/CD item marked partially done.

### Verification
Code review: 3 reviewers (code-review-minion, lucy, margo), all ADVISE. 4 findings auto-fixed: outcome.md script name mismatch (lint:openapi → lint:api), false claims about bugs/homepage fields, Thumbs.db reference, backlog "Updated through" header.

Tests: 321 passed (17 files), 0 failures.

Documentation: Phase 8 skipped (empty checklist -- no new APIs, features, or architecture changes).

## Agent Contributions

<details>
<summary>Planning agents (Phase 2)</summary>

| Agent | Recommendation |
|-------|---------------|
| iac-minion | Node 18 incompatible with wrangler 4.73.0; use Node 22 LTS, ubuntu-latest, timeout-minutes:10, no matrix |
| devx-minion | Two-tier CONTRIBUTING.md, vanilla JS stated directly, lint:api conditional, backlog as context not task board |
| software-docs-minion | Goals-not-guarantees tone, evolution log not contributor requirement, Contributor Covenant v2.1 verbatim |

</details>

<details>
<summary>Architecture reviewers (Phase 3.5)</summary>

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | Separate conduct/vulnerability channels; .env.* glob; SHA maintenance gap |
| test-minion | APPROVE | CI workflow correct, no new tests needed, 13-file test suite covers all |
| ux-strategy-minion | ADVISE | SHA verification instruction clarity |
| lucy | ADVISE | Evolution log timing (structural, acknowledged) |
| margo | ADVISE | CONTRIBUTING.md length risk; decisions.md inflation |
| devx-minion | ADVISE | fetchMock gotcha consequence; nvm use; evolution log framing |

</details>

<details>
<summary>Code reviewers (Phase 5)</summary>

| Agent | Verdict | Findings |
|-------|---------|----------|
| code-review-minion | ADVISE | outcome.md: lint:openapi→lint:api, false bugs/homepage claims, Thumbs.db reference |
| lucy | ADVISE | Same outcome.md issues + backlog "Updated through" header stale |
| margo | ADVISE | Same outcome.md issues confirmed |

All 4 findings auto-fixed in a single commit.

</details>

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- primary orchestration

</details>

<details>
<summary>Compaction</summary>

3 compaction events during session. Working files preserved in companion directory for reference.

</details>

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-14-235240-open-source-readiness/`

Files: phase1-metaplan-prompt.md, phase1-metaplan.md, phase2-{iac,devx,software-docs}-minion{,-prompt}.md, phase3-synthesis{,-prompt}.md, phase3.5-{security,test,ux-strategy,lucy,margo,devx}-minion{,-prompt}.md, phase4-{devx,software-docs}-minion-prompt.md, phase5-{code-review,lucy,margo}{,-prompt}.md, prompt.md
