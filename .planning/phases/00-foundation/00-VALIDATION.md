---
phase: 0
slug: foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
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

> Reconciled with the actual task IDs from PLAN-A (A-01..A-05) and PLAN-B (B-01..B-05).
> Every PRE/AUDIT/QG requirement covered. Manual-only verifications listed separately below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| A-01 | A | 1 | PRE-01 | T-00A-04 | `buildStatusBanner` collision resolved; only `ui-detail.js:34` declares the bare name; `ui-billing.js` uses `billing_buildStatusBanner` at lines 169 + 198 | grep gate (manual visual gated by A-04) | `grep -nE "function +buildStatusBanner\b" src/ui/*.js` returns exactly one match in `ui-detail.js`; `grep -c "billing_buildStatusBanner" src/ui/ui-billing.js` = 2 | ✅ exists | ⬜ pending |
| A-02 | A | 1 | PRE-02, QG-06 | T-00A-01, T-00A-02 | scheduler `schedule.advance_failed` log emitted (severity 5, subsystem `schedule`) instead of silent catch on `advanceSchedule` D1 write failure | unit + grep | `npm test -- test/scheduled-handler.test.js` passes; `grep -c "\.catch(() => {})" src/scheduler.js` = 0; `grep -c "schedule.advance_failed" src/scheduler.js` = 1 | ✅ extends `test/scheduled-handler.test.js` | ⬜ pending |
| A-03 | A | 1 | PRE-03, QG-07 | T-00A-04 | `formatDate` collision resolved; only `ui-settings.js:22` declares the bare name; `ui-submit.js` uses `submit_formatDate` at lines 25 + 438 | grep gate (manual visual gated by A-04) | `grep -nE "function +formatDate\b" src/ui/*.js` returns exactly one match in `ui-settings.js`; `grep -c "submit_formatDate" src/ui/ui-submit.js` = 2 | ✅ exists | ⬜ pending |
| A-04 | A | 1 | PRE-01, PRE-02, PRE-03 | T-00A-01..04 | staging smoke green; grace-period banner visually rendered; 24h Coralogix observation; production smoke green | manual + smoke | `./scripts/smoke-test.sh` exits 0 against staging then production; manual dashboard render confirmation per Manual-Only Verifications below | ✅ existing script | ⬜ pending |
| A-05 | A | 1 | QG-04, QG-05 | T-00A-04 | evolution log `0108-pre-flight-cleanup/{prompt,decisions,outcome}.md` exists; `outcome.md` has `## Files changed` and `## Backlog changes`; README updated | grep gate | `test -f docs/evolution/0108-pre-flight-cleanup/outcome.md && grep -q "^## Backlog changes" docs/evolution/0108-pre-flight-cleanup/outcome.md && grep -q "0108-pre-flight-cleanup" docs/evolution/README.md` | ✅ files created by task | ⬜ pending |
| B-01 | B | 2 | AUDIT-04 | T-00B-05 | persistent CDP-availability spike test exists; runs (PASS or FAIL acceptable as data); emits JSON evidence line `{"test":"AUDIT-04","cdpSessionAvailable":<bool>,"cdpError":<obj>}` | integration | `npm run test:integration -- test/integration/audit/cdp-availability.test.js` runs to completion; `grep -E '"test":"AUDIT-04"' /tmp/cdp-spike.log` matches | ❌ Wave 0 — created in B-01 | ⬜ pending |
| B-02 | B | 2 | AUDIT-01, AUDIT-05 | T-00B-01, T-00B-02 | URL battery (≥20 URLs across 6 #257 areas, failure-orthogonal, ≥1 DACH PUR rep) curated; before-corpus capture batch executed against production API; capture_id + status per URL recorded | manual + grep | `grep -cE "https?://" .planning/audit/url-battery.md` ≥ 20; `grep -cE "cap_[a-f0-9]{32}" .planning/audit/url-battery.md` (or `before-corpus.csv`) ≥ 20; `git status .planning/audit/` shows only `.md`/`.csv` (no WACZ/PNG/HTML) | ❌ Wave 0 — created in B-02 | ⬜ pending |
| B-03 | B | 2 | AUDIT-02 | T-00B-03, T-00B-07 | `AUDIT.md` §1 baselines populated with real numeric values (post-PRE-02 30-day window); §4 verbatim DataPrime queries (≥9, single percentile function name throughout) | doc gate | `grep -c "^## 1\. Baselines" .planning/audit/AUDIT.md` = 1; `grep -c "^## 4\. Coralogix Queries" .planning/audit/AUDIT.md` = 1; `grep -c "^\`\`\`dataprime" .planning/audit/AUDIT.md` ≥ 9; `grep -oE "(percentile\|approx_percentile\|quantile)\(" .planning/audit/AUDIT.md \| sort -u \| wc -l` = 1 | ❌ Wave 0 — created in B-03 | ⬜ pending |
| B-04 | B | 2 | AUDIT-03, AUDIT-04 (finalize) | T-00B-07 | `AUDIT.md` §2 ranks 6 #257 areas by frequency × severity (real numbers, not placeholders); §3 declares PASS/FAIL with verbatim JSON evidence line + Phase 7 implication | doc gate | `for area in "Area 1" "Area 2" "Area 3" "Area 4" "Area 5" "Area 6"; do grep -q "$area" .planning/audit/AUDIT.md \|\| exit 1; done`; `grep -E "^\\*\\*Result:\\*\\* (PASS\|FAIL)" .planning/audit/AUDIT.md`; `grep -q '"test":"AUDIT-04"' .planning/audit/AUDIT.md` | ❌ AUDIT.md updated by B-04 | ⬜ pending |
| B-05 | B | 2 | QG-04, QG-05 | T-00B-07 | evolution log `0109-foundation-audit/{prompt,decisions,outcome}.md` exists; `decisions.md` has ≥6 H2 sections; `outcome.md` has `## Files changed` and `## Backlog changes`; README updated; backlog reviewed (or "no changes" recorded) | grep gate | `test -f docs/evolution/0109-foundation-audit/outcome.md && grep -q "^## Backlog changes" docs/evolution/0109-foundation-audit/outcome.md && grep -q "0109-foundation-audit" docs/evolution/README.md && [ "$(grep -c "^## " docs/evolution/0109-foundation-audit/decisions.md)" -ge 6 ]` | ✅ files created by task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/integration/audit/cdp-availability.test.js` — CDP API probe (AUDIT-04). NEW FILE, created in B-01.
- [ ] `test/scheduled-handler.test.js` — extend the existing scheduler test file with a new `describe`/`it` covering the threat-block + advanceSchedule-throw path for PRE-02 (per A-02). Verify-then-add: if the case already exists, refine; otherwise create.

*Existing vitest + workers pool covers all other phase requirements; no new framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Billing banner renders for grace-period tenants | PRE-01 | Real dashboard render in browser; cannot be unit-tested across the flat UI scope | Open dashboard as a tenant in `grace_period` state on staging; confirm banner copy + dismiss works |
| Production Coralogix p50/p95/p99 numbers | AUDIT-01..03 | Requires live production query post-PRE-02 deploy | Run DataPrime queries from RESEARCH.md §Audit Methodology against production; paste results into AUDIT.md with timestamps |
| URL battery capture quality | AUDIT-05 | Visual review of 20 captures across site categories | After capture batch completes, manually inspect ≥1 capture per category; log subjective notes in AUDIT.md |
| PRE-01 / PRE-03 UI string renames | PRE-01, PRE-03 | `src/ui/*.js` modules are concatenated into a single inline `<script>` block at runtime (see CLAUDE.md Dashboard UI Architecture). No DOM-level unit tests possible without rebuilding the rendering pipeline. Grep-verifiable rename + manual staging dashboard render is the appropriate verification. | After deploy, open dashboard on staging as a tenant in `grace_period` state — confirm billing banner renders. Then submit a capture from the dashboard and confirm `formatDate` output is correct. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (see exemption below)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 300s for targeted, full-suite run only at wave boundaries
- [x] `nyquist_compliant: true` set in frontmatter

**Sampling rule exemption (PRE-01 / PRE-03):**
Plan A's tasks A-01, A-03, and A-05 are grep-only / doc-only verifications, which would otherwise trigger the Dimension 8c rule (≥2 of any 3 consecutive impl tasks lacking automated test execution). The architectural constraint that justifies the exemption is real and immutable within Phase 0 scope: `src/ui/*.js` modules are concatenated into a single inline `<script>` block at runtime (per CLAUDE.md "Dashboard UI Architecture"), so DOM-level unit tests are not possible without rebuilding the rendering pipeline — out of scope for a pre-flight cleanup. A-02 (the scheduler fix between them) DOES have a real targeted test run (`npm test -- test/scheduled-handler.test.js`); A-04 is the human-verify gate that checks the visible behavior of A-01 + A-03 on staging. The grep gates plus the staging visual confirmation form a complete verification chain for the UI renames. A-05 is documentation-only; its "test" is structural file/section presence, which the grep gate covers. This sign-off accepts the exemption.

**Approval:** approved 2026-04-30
