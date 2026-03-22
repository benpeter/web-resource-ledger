# Process: npm Publish CI Automation (#98)

## TL;DR

Three specialists planned a 3-task CI automation pipeline in ~6 minutes of
planning time. The key conflict — automation token vs OIDC Trusted Publishing —
was resolved by anchoring to the issue's explicit success criteria. Five
architecture reviewers (0 BLOCK, 11 advisories) and three code reviewers (2
fixes applied) produced a clean result: 79-line workflow, 88-line changelog
script, zero new dependencies. PR #126 created. Total: 5 commits, 30 files
changed, +2342 lines.

## Specialists Consulted

### Phase 2: Planning (3 agents, parallel)

**iac-minion** — Workflow design and trigger mechanics. Key contributions:
- Identified that GitHub Actions tag triggers have no path context (path
  filters don't work on tag events). Proposed `verify/v*` scoped prefix.
- Recommended automation token approach with `--provenance` attestation.
- Designed EPUBLISHCONFLICT handling pattern for graceful duplicate version.
- Advised running only the package's own tests, not root-level vitest.

**devx-minion** — Version bump tooling and developer experience. Key
contributions:
- Proposed using `npm version` with `.npmrc` `tag-version-prefix` instead
  of a custom bump script — zero new code for the bump mechanism.
- Designed the changelog as a separate shell script to preserve the human
  review step between changelog generation and version tagging.
- Identified the need for a retroactive `verify/v0.1.0` tag as a baseline.
- Recommended against all changelog tools (conventional-changelog-cli,
  git-cliff, changelogen) in favor of simple git log parsing.

**security-minion** — Auth model and supply chain security. Key contributions:
- Strongly advocated for OIDC Trusted Publishing (no secret to manage,
  automatic provenance, per-package+per-repo+per-workflow scoping).
- Noted that classic npm tokens were revoked Dec 2025 — only granular
  access tokens remain.
- Identified that npm 11.5.1+ is required for OIDC (Node 22 ships 10.x).
- Recommended pinning npm version explicitly, not using `npm@latest`.

### Conflict: Automation Token vs OIDC

This was the session's central design tension.

**security-minion's position**: OIDC eliminates token management entirely.
For a package whose purpose is verifying cryptographic integrity, publishing
with the strongest provenance mechanism available is "practicing what you
preach." The npm upgrade step (pin to 11.5.1) is a one-line addition.

**iac-minion's position**: The issue explicitly requires "a scoped automation
token stored as a GitHub Actions secret." OIDC requires upgrading npm in CI
(Node 22 ships 10.x), adding a maintenance burden. The automation token
approach is battle-tested and provenance still works with tokens.

**Resolution**: Automation token won. The synthesis weighted: (1) explicit
success criteria language, (2) Node 22/npm 10.x reality, (3) marginal
security gain for a single-maintainer project. The OIDC migration path was
documented as a backlog item for when Node 24+ ships npm 11+.

## Phase 3.5: Architecture Review (5 reviewers)

**Lucy adjusted the reviewer set**: removed ux-strategy-minion (no
user-facing deliverables), added gru (architecture assessment for CI
design decisions). Final set: gru, security-minion, test-minion, lucy, margo.

Results: 2 APPROVE (gru, margo), 3 ADVISE (security-minion, test-minion,
lucy). 11 total advisories, all incorporated into task prompts. Notable:
- test-minion flagged `((VAR++))` under `set -e` as a silent exit trap
- security-minion flagged token leakage risk with `tee` in publish step
- lucy noted tag convention divergence from issue wording (adaptation, not drift)

## Phase 4: Execution

**Worktree path issue**: devx-minion wrote files to the main repo instead
of the worktree. Required manual `cp` + `rm` to relocate. This is a
recurring issue with subagents in worktree environments — they resolve
paths from the repo root, not the worktree root. Not intervened on
(manual fix was trivial); flagged in outcome.md for awareness.

**Gate**: Task 1 (publish workflow) gated before Task 3. Lucy reviewed the
deliverable and approved with one convention fix: add `cache: 'npm'` with
`cache-dependency-path` for correct lockfile cache key resolution.

## Phase 5: Code Review

Three reviewers found 2 actionable fixes:
1. `cache-dependency-path` for npm cache (code-review-minion + lucy)
2. Changelog prepend logic producing double blank lines (code-review-minion
   + margo — both independently identified the `${EXISTING#*$'\n'}` fragility)

Both fixes applied in a single commit. No BLOCKs.

## Where to Read More

- Phase 2 specialist contributions: `docs/history/nefario-reports/2026-03-22-144917-npm-publish-ci-automation/phase2-*.md`
- Phase 3 synthesis (full delegation plan): `phase3-synthesis.md` in the same directory
- Phase 3.5 review verdicts: `phase3.5-*.md` in the same directory
- Phase 5 code review findings: `phase5-*.md` in the same directory
