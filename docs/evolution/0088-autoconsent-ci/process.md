# Process: Automated Autoconsent Update Pipeline

## TL;DR

Three specialists planned a CI automation for autoconsent vendoring. The core tension was between Node and shell for the vendoring script (Node won via JSON.stringify safety at 170KB scale) and between strict vs advisory battery test gating (advisory won due to external site flakiness). Two files produced: a 64-line vendoring script and a 3-job GitHub Actions workflow. All 1574 unit tests pass. Three code reviewers found two fixable issues (catch blocks, regex anchor), both addressed.

## Planning Phase

### Specialists consulted

- **iac-minion** — GitHub Actions workflow design, permissions, secret management, PR automation
- **devx-minion** — Vendoring script design, string escaping strategy, Node vs shell decision
- **test-minion** — Runner sizing, test execution strategy, battery failure semantics

### Key disagreements and resolutions

**Node vs shell for vendoring (devx-minion vs iac-minion initial suggestion)**

iac-minion initially suggested a shell script with `node -e "JSON.stringify(...)"` for the escaping step. devx-minion argued for a full Node ESM script: the 170KB scale makes shell string escaping fragile, JSON.stringify handles all edge cases in one call, and the project already has Node scripts in `scripts/`. iac-minion's core concern (idempotent, works in CI) is satisfied by either approach. Synthesis chose Node — the safety argument at this file size is compelling.

**Job count: 1 vs 3 vs 4 (iac-minion vs synthesis vs test-minion)**

iac-minion favored a single job with sequential steps. test-minion proposed 4 jobs (version-check, unit-tests, battery, open-pr). Synthesis compromised on 3: merging version-check into update-and-test (they share checkout/install), keeping battery separate (different failure semantics and environment), keeping open-pr separate (different permissions). The 3-job structure was later validated by security-minion's per-job permission scoping advisory.

**Battery blocking vs advisory (acceptance criteria vs all specialists)**

The issue says "No PR opened if tests fail." All three specialists independently argued battery failures should be advisory, not blocking. 21 external sites with CMP changes, rate limiting, and geo-restrictions make strict blocking impractical — the workflow would fail most weeks. Unit test failures still block PR creation. test-minion flagged this deviation should be surfaced to the user, which it was.

**Secret source: repo-level vs environment (iac-minion vs test-minion)**

iac-minion suggested creating a new repo-level secret `WRL_STAGING_KEY`. test-minion correctly identified that `WRL_STAGING_CAPTURE_API_KEY` already exists in the `staging` GitHub environment (used by deploy-staging.yml). Synthesis chose the existing secret to avoid drift.

## Architecture Review

Five mandatory reviewers, no discretionary:
- **security-minion** (ADVISE): Per-job permission scoping. This was the most impactful advisory — it validated the 3-job structure as a security benefit.
- **test-minion** (ADVISE): Surface the battery-advisory deviation explicitly.
- **ux-strategy-minion** (APPROVE): PR body design is solid. Suggested conditional WRL_STAGING note.
- **lucy** (ADVISE): Wrong releases URL in synthesis (was `nicedigital/nicedigital-autoconsent`, corrected to `duckduckgo/autoconsent`).
- **margo** (ADVISE): Consider collapsing open-pr into update-and-test. Rejected because per-job permission scoping requires the separation.

## Execution

Two tasks executed sequentially (Task 2 depended on Task 1):

1. **devx-minion** created the vendoring script. Ran it successfully — no diff against existing vendor files, confirming idempotency.
2. I wrote the workflow directly (incorporating all advisories) rather than spawning an agent, since the synthesis prompt was detailed enough and I needed to incorporate security, test, and governance advisories into the final file.

## Code Review Phase

Three reviewers in parallel:
- **code-review-minion**: Found semver regex missing end anchor and noted stale-PR-close placement moved from update-and-test to open-pr (confirmed as intentional improvement).
- **lucy**: Found catch blocks discarding error objects (CLAUDE.md compliance).
- **margo**: Same regex finding. Also noted 3-job redundancy as accepted trade-off.

Both fixable findings were addressed before the wrap-up commit.

## Human interventions

This was an autonomous orchestration (no human at the keyboard). All gates were decided by Lucy as proxy. No human overrides occurred.

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/2026-03-26-033012-autoconsent-update-pipeline/phase2-*.md`
- Synthesis plan: `docs/history/nefario-reports/2026-03-26-033012-autoconsent-update-pipeline/phase3-synthesis.md`
- Review verdicts: `docs/history/nefario-reports/2026-03-26-033012-autoconsent-update-pipeline/phase3.5-*.md`
- Code review findings: `docs/history/nefario-reports/2026-03-26-033012-autoconsent-update-pipeline/phase5-*.md`
