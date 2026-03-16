---
task: "Fix secrets and environment setup documentation for fork-ready onboarding"
date: 2026-03-16
status: complete
task-count: 5
gate-count: 0
agents: [software-docs-minion, devx-minion, ux-strategy-minion, security-minion, test-minion, lucy, margo, code-review-minion]
branch: nefario/secrets-env-docs-onboarding
slug: secrets-env-docs-onboarding
---

## Summary

Documentation-only phase closing gaps exposed during the CD pipeline fix session
earlier on 2026-03-16. A forking developer can now get both staging and production
CD pipelines running from README.md and OPERATIONS.md alone. Key additions: secret
surfaces table in OPERATIONS.md explaining the three secret storage layers, 5
specific Cloudflare API token permissions, staging infrastructure prerequisites in
README, and cross-references replacing duplicated content between the two files.

## Original Prompt

Fix secrets and environment setup documentation for fork-ready onboarding.

A developer forking WRL can get both staging and production CD pipelines running
by following README.md and OPERATIONS.md alone, without needing to reverse-engineer
which secrets go where, what Cloudflare token permissions are required, or what
infrastructure must pre-exist.

Triggered by gaps found during the Phase 0024 CD pipeline fix session.

## Key Design Decisions

1. **Secret surfaces concept lives in OPERATIONS.md, not README.md.** devx-minion
   argued README (closer to the developer during setup); software-docs-minion
   argued OPERATIONS (operational diagnosis context). Resolved: OPERATIONS wins
   because the concept answers "why did my deploy fail?" not "how do I set up?"
   README gets a one-line forward reference.

2. **No README restructuring.** ux-strategy-minion recommended consolidating 9
   setup steps to 5 (Miller's Law). Deferred: the current structure works and the
   fork-readiness improvements deliver value with less churn.

3. **Anchor link fragility accepted.** Cross-references from OPERATIONS.md to
   README headings break silently when headings change. Accepted as a known
   tradeoff for a small-team project. Backlog item added for CI link lint.

## Phases

### Phase 1-3: Planning and Synthesis

Three specialists consulted: software-docs-minion (documentation architecture),
devx-minion (fork onboarding flow), ux-strategy-minion (cognitive load). Main
conflict was where to place the "secret surfaces" explanation — resolved in
favor of OPERATIONS.md. Deferred items (README restructuring, fork checklist)
parked in backlog with activation triggers.

### Phase 3.5: Architecture Review

5 mandatory reviewers. 3 APPROVE, 2 ADVISE. lucy flagged a Cloudflare permission
label discrepancy (User Memberships Read vs User Details Read) — incorporated
into Task 3 prompt. margo recommended dropping the Task 3 approval gate as
low-value given the prescriptive prompt — accepted, reducing gates from 1 to 0.

### Phase 4: Execution

5 tasks across 4 batches, all assigned to software-docs-minion (sonnet):

| # | Task | File | Lines Changed |
|---|------|------|---------------|
| 1 | Staging infrastructure prerequisites | README.md | +20 |
| 2 | Coralogix sourcing + bridge note | README.md | +6 |
| 3 | Secret surfaces + CF permissions | OPERATIONS.md | +27 |
| 4 | Cross-references replacing duplication | OPERATIONS.md | +27/-13 |
| 5 | Evolution log phase 0025 | docs/evolution/, backlog | +125 |

### Phases 5-8: Verification

Code review: 2 APPROVE (margo, code-review-minion), 1 ADVISE (lucy: process.md
timing). Tests: not applicable (docs-only). Documentation: covered by the task
itself (this IS the documentation phase).

## Agent Contributions

### Planning Agents

- **software-docs-minion**: Proposed README/OPERATIONS ownership boundary.
  Recommended OPERATIONS for secret surfaces. Identified CONTRIBUTING.md overlap
  risk.
- **devx-minion**: Mapped the minimum fork-to-green-pipeline information path.
  Identified staging infrastructure as the #1 blocker. Recommended README for
  secret surfaces (overruled in synthesis).
- **ux-strategy-minion**: Identified 9 cognitive load issues. Recommended fork
  checklist and README restructuring (both deferred). Validated the three-surfaces
  mental model as highest-severity gap.

### Review Agents

- **security-minion**: APPROVE. Confirmed no secret exposure risk.
- **test-minion**: APPROVE. Validated wrangler commands match wrangler.toml.
- **ux-strategy-minion**: APPROVE. Validated journey coherence.
- **lucy**: ADVISE. Flagged CF permission label discrepancy (incorporated).
- **margo**: ADVISE. Recommended dropping low-value gate (accepted).

## Verification

Verification: code review passed (7 docs-only files). Tests: not applicable.

## Working Files

See [2026-03-16-170442-secrets-env-docs-onboarding/](2026-03-16-170442-secrets-env-docs-onboarding/)
for scratch files including all phase prompts and outputs.

## Session Resources

**Skills Invoked**: /nefario, /despicable-prompter
**Compaction events**: 0
