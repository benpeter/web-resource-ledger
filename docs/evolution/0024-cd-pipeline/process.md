# Process: R14 Production CD Pipeline

## TL;DR

Five specialists planned a production CD pipeline in 9 phases. Three genuine
conflicts emerged (staging gate mechanism, tag triggers, smoke test changes).
All three resolved by favoring simplicity over flexibility. One execution
agent produced all deliverables. Six reviewers (Phase 3.5) and three code
reviewers (Phase 5) all approved. Total: 3 new files, 0 application code
changes, 4 backlog items deferred. All approval gates were skipped per human
directive, with decisions deferred to gru and lucy.

## Specialists consulted and why

**Phase 2 — Planning (5 agents, all parallel):**

| Agent | Why consulted | Key contribution |
|-------|--------------|-----------------|
| iac-minion | Core deliverable owner — workflow design, Cloudflare deploy patterns, GitHub Actions | Designed 3-job pipeline; recommended both tag + dispatch triggers; self-contained staging gate; separate Cloudflare tokens per env; DO NOT add [env.production] to wrangler.toml |
| security-minion | Production pipeline security: secret scoping, token permissions, supply chain | Environment-scoped secrets; separate API tokens; tag-mutation risks; action SHA pinning audit; documented that wrangler rollback doesn't revert secrets |
| user-docs-minion | Rollback documentation is an explicit success criterion | OPERATIONS.md at repo root; three lean scenarios; hybrid decision tree + commands; "tired Ben at 2am" audience |
| test-minion | Smoke test adequacy and staging gate structure | Existing smoke test sufficient; SMOKE_SKIP_CAPTURE=1 for production; favored workflow_run trigger |
| ux-strategy-minion | Deploy experience for single developer who is both author and approver | "Locking your front door, not filing a tax return"; single GitHub approval click; dropped tag triggers; flagged cognitive load of deployment ceremony |

No second-round specialists were recommended.

## What each specialist argued and where they disagreed

### Conflict 1: Staging gate mechanism

**iac-minion** proposed a self-contained workflow: staging smoke as Job 1
inside `deploy-production.yml`, then deploy as Job 2, then production smoke
as Job 3. The full pipeline is visible as a single run in the Actions UI.

**test-minion** proposed `workflow_run` trigger: production workflow fires on
successful completion of the staging deploy workflow. This enforces strict
ordering — staging must pass before production even starts.

**The disagreement**: iac-minion prioritized observability (one run, one
place to look). test-minion prioritized ordering guarantees (staging
deployment must succeed, not just be healthy).

### Conflict 2: Tag triggers

**iac-minion** proposed both `push: tags: ['v*']` and `workflow_dispatch`.
Tags provide versioning, auditability, and a familiar release mechanism.

**ux-strategy-minion** argued tags are an "indifferent" feature on the Kano
model for a single developer. Cloudflare Workers have built-in version
history. Tags add a naming convention to remember, introduce security
surface (tag mutation, non-main commits), and solve a versioning problem
WRL doesn't have.

**security-minion** provided supporting evidence for ux-strategy's position:
tag-based triggers on public repos carry risks (non-main commits, tag
mutation, typosquatting) that require compensating controls.

### Conflict 3: Smoke test enhancements

**test-minion** wanted two additions: a version check (`SMOKE_EXPECT_VERSION`
that validates a commit SHA from the health endpoint) and a response time
assertion.

**No direct opposition**, but the project's YAGNI philosophy created tension.
The version check requires three coordinated changes for an unobserved
failure mode. The response time assertion is meaningless from GitHub Actions
runners (100-500ms network noise).

## How conflicts were resolved in synthesis

Synthesis was handled by nefario (opus). All three conflicts resolved by
favoring simplicity:

1. **Staging gate**: iac-minion's self-contained approach won. Single
   workflow run is easier to observe and reason about. The tradeoff
   (validates staging health, not code parity) is acceptable for a solo
   project with linear history on main.

2. **Tag triggers**: ux-strategy-minion won, with security-minion providing
   supporting evidence. Triggers are `push: branches: [main]` +
   `workflow_dispatch` with optional `ref` input. Every merge to main flows
   automatically to the approval gate. workflow_dispatch enables rollback-by-
   redeploy. Tags deferred to backlog.

3. **Smoke test changes**: Both deferred as YAGNI with concrete backlog
   activation triggers. The existing smoke test works as-is.

## Architecture review (Phase 3.5)

Six reviewers (5 mandatory + 1 discretionary):

| Reviewer | Verdict | Key finding |
|----------|---------|------------|
| security-minion | ADVISE | Consistent WRL_PROD_* naming across workflow and docs; environment: staging on smoke job |
| test-minion | ADVISE | SMOKE_SKIP_CAPTURE=1 leaves binding config unvalidated; suggested lightweight binding check as backlog item |
| ux-strategy-minion | APPROVE | Clean developer journey; noted rollback-doesn't-fix-main should be explicit |
| lucy | ADVISE | Tag trigger deviation intentional but should be documented; confirm staging has no reviewer protection |
| margo | APPROVE | Zero complexity tokens; proportional to problem |
| user-docs-minion | APPROVE | Use angle-bracket placeholders not fake URLs |

All advisories were folded into the execution task prompt.

## What the human changed at approval gates and why

All approval gates were skipped per the human's directive: "skip all
approval gates — defer decisions to gru and lucy instead of halting for
human input." Compaction checkpoints were also skipped. The PR was
auto-created without halting.

This means:
- Team composition was not reviewed by the human (deferred to Phase 3.5 reviewers)
- The execution plan was not reviewed by the human (deferred to architecture reviewers)
- Post-execution phase selection defaulted to "Run all" minus docs

## What the human chose NOT to intervene on and why

The human pre-authorized full autonomy for this phase, likely because:
- R14 is a well-scoped infrastructure task with low blast radius (new files only, no application code changes)
- The issue has clear success criteria
- The staging workflow provides a strong reference implementation
- Multiple parallel worktrees are running, and gate-waiting would serialize them

## Execution

Single task, single agent (iac-minion, sonnet, bypassPermissions).
Produced all three deliverables in one pass: deploy-production.yml (71
lines), OPERATIONS.md (150 lines), README.md (one-line addition).

Post-execution: 3 code reviewers (code-review-minion, lucy, margo) all
APPROVE. Tests: 449/449 pass. No documentation phase (skipped per default).

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/` (companion directory for this run)
- Synthesis with full conflict resolution rationale: same companion directory, `phase3-synthesis.md`
- Individual reviewer verdicts: same companion directory, `phase3.5-*.md` and `phase5-*.md`
- Decisions with rejected alternatives: `docs/evolution/0021-cd-pipeline/decisions.md`
