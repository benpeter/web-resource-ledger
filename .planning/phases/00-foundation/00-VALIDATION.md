---
phase: 0
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 0 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x with @cloudflare/vitest-pool-workers |
| **Config file** | vitest.config.js |
| **Quick run command** | `npm test -- <test-file-pattern>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~120-300 seconds full suite (~8 GB memory; never run in parallel) |

---

## Sampling Rate

- **After every task commit:** Run targeted test for the file being modified (quick command)
- **After every plan wave:** Run full suite (`npm test`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds for targeted run, ~5 minutes full suite
- **CSS/copy-only changes:** Visual verification only, no test run (per CLAUDE.local.md)

---

## Per-Task Verification Map

> Populated by gsd-planner using research + RESEARCH.md §Validation Architecture.
> Each task in PLAN-A and PLAN-B gets a row mapping it to a REQ-ID, automated test, and pass signal.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 0-A-01 | A | 1 | PRE-01 | — | billing banner renders for grace-period/blocked tenants | manual + integration | dashboard visual smoke + `npm test ui-billing` | ⬜ pending | ⬜ pending |
| 0-A-02 | A | 1 | PRE-02 | — | scheduler logs `schedule.advance_failed` to Coralogix on DB write failure (not silent) | unit + log inspection | `npm test scheduler` + Coralogix DataPrime probe post-deploy | ⬜ pending | ⬜ pending |
| 0-A-03 | A | 1 | PRE-03 | — | `formatDate` collision resolved (only one definition reachable) | grep + integration | `grep -c 'function formatDate' src/ui/*.js` returns expected count | ⬜ pending | ⬜ pending |
| 0-B-01 | B | 2 | AUDIT-01..03 | — | `.planning/audit/AUDIT.md` contains p50/p95/p99 + partial-capture rate from production Coralogix data post-PRE-02 | manual + artifact | file exists; sections present; numbers cited from query receipts | ⬜ pending | ⬜ pending |
| 0-B-02 | B | 2 | AUDIT-04 | — | CDP spike test exits with definitive PASS/FAIL recorded in audit doc | integration | `npm test cdp-availability` | ⬜ pending | ⬜ pending |
| 0-B-03 | B | 2 | AUDIT-05 | — | ≥20 URL battery captured; WACZ + screenshot per URL stored in versioned location | manual + artifact | capture batch + storage manifest reference in AUDIT.md | ⬜ pending | ⬜ pending |
| 0-B-04 | B | 2 | QG-04 | — | `docs/evolution/0107-foundation/{prompt,decisions,outcome}.md` created during the phase | grep | `test -f docs/evolution/<NNNN>-foundation/outcome.md` | ⬜ pending | ⬜ pending |
| 0-B-05 | B | 2 | QG-05 | — | `docs/backlog.md` updated this phase (or "no changes" recorded explicitly) | grep | `git log --oneline -- docs/backlog.md` shows phase commit OR outcome.md states "no backlog changes" | ⬜ pending | ⬜ pending |
| 0-B-06 | B | 2 | QG-06 | — | PRE-02 fix uses `log(env, ...)`, not `console.warn/error` | grep | `grep -n 'console\.\(warn\|error\)' src/scheduler.js` returns 0 in PRE-02 region | ⬜ pending | ⬜ pending |
| 0-B-07 | B | 2 | QG-07 | — | PRE-01 + PRE-03 demonstrate UI prefix discipline (`billing_*` / `submit_*`) | grep | `grep -E 'function (billing|submit|detail|diff|shell)_' src/ui/*.js` | ⬜ pending | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> **Note to planner:** the IDs above are placeholders illustrating the expected mapping shape. Replace with the actual task IDs from PLAN-A and PLAN-B once those are written. Every PRE/AUDIT/QG requirement must have at least one row.

---

## Wave 0 Requirements

- [ ] `test/integration/audit/cdp-availability.test.js` — CDP API probe (AUDIT-04)
- [ ] `test/integration/scheduler-advance-failed.test.js` — verify PRE-02 log emission shape (or extend existing scheduler suite)

*Existing vitest + workers pool covers all other phase requirements; no new framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Billing banner renders for grace-period tenants | PRE-01 | Real dashboard render in browser; cannot be unit-tested across the flat UI scope | Open dashboard as a tenant in `grace_period` state on staging; confirm banner copy + dismiss works |
| Production Coralogix p50/p95/p99 numbers | AUDIT-01..03 | Requires live production query post-PRE-02 deploy | Run DataPrime queries from RESEARCH.md §Audit Methodology against production; paste results into AUDIT.md with timestamps |
| URL battery capture quality | AUDIT-05 | Visual review of 20 captures across site categories | After capture batch completes, manually inspect ≥1 capture per category; log subjective notes in AUDIT.md |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s for targeted, full-suite run only at wave boundaries
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
