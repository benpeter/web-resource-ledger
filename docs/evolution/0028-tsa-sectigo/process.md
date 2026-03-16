# Process: 0028 — Switch TSA from DigiCert to Sectigo

## TL;DR

Nefario orchestrated a minimal 3-line config change to switch the RFC 3161 TSA
from DigiCert to Sectigo. The meta-plan recommended zero specialist
consultations — the first time in 28 phases that nefario concluded no planning
help was needed. Total execution: 3 string replacements, 497 tests passing, one
commit. The human ran this with all gates skipped and auto-PR creation.

## What Happened

### Phase 1: Meta-Plan

Nefario analyzed the task against its delegation table and recommended **zero
specialists**. Its reasoning: "This task does not benefit from specialist
planning consultations. The entire task is 'replace string A with string B in
3 known locations.' There are no design decisions, architectural choices, API
contracts, security models, or UX implications to deliberate."

This was the correct call. The issue (#66) was written by `/despicable-prompter`
with pre-selected provider (Sectigo), pre-identified scope (3 files), and
explicit out-of-scope boundaries. There was nothing for specialists to argue
about.

### Phase 2: Specialist Planning

Skipped. Zero agents consulted.

### Phase 3: Synthesis

The execution plan was trivially simple: one task, zero approval gates, one
agent (iac-minion). The synthesis was written directly by the orchestrator
rather than spawning a synthesis subagent — the overhead of a subagent call
exceeded the complexity of the plan.

### Phase 3.5: Architecture Review

Skipped per human instruction (all gates auto-approved). For a 3-line config
change with no behavioral code changes, this was appropriate.

### Phase 4: Execution

The orchestrator made the 3 edits directly rather than spawning an iac-minion
subagent. The edits were:

1. `wrangler.toml` line 44: `https://timestamp.digicert.com` → `https://timestamp.sectigo.com` (production)
2. `wrangler.toml` line 89: same (staging)
3. `vitest.config.js` line 28: same (test bindings)

No source code touched. `src/rfc3161.js` is TSA-agnostic by design — it accepts
`tsaUrl` as a parameter from `env.TSA_URL`.

### Phase 6: Test Execution

All 497 tests passed across 23 test files. The RFC 3161-specific tests (17 in
`test/rfc3161.test.js`) use `fetchMock` and read `TSA_URL` from the vitest
config, so the URL change propagated correctly.

### Phase 8a: Documentation Assessment

The checklist identified evolution log entries as the only documentation need.
`decisions.md`, `outcome.md`, `process.md` written in the same commit as the
config changes.

## Human Interventions

**What was changed**: Nothing. The human ran with `skip all approval gates` and
`auto-create the PR`. Zero interactive gates were presented.

**What was deliberately left alone**: Historical evolution logs (0025) and
nefario reports that reference DigiCert. These are historical records of what
happened during that phase and should not be retroactively edited.

## Where to Read More

- Issue: #66
- Evolution log: `docs/evolution/0028-tsa-sectigo/`
- Previous TSA phase: `docs/evolution/0025-rfc3161-timestamps/`
- Nefario report: `docs/history/nefario-reports/` (generated alongside this file)
