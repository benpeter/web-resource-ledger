# Phase 0012 Process: Open-Source Readiness

## TL;DR

Three planning specialists (iac-minion, devx-minion, software-docs-minion) and six architecture reviewers produced a clean 2-task plan for 8 open-source hygiene files. One material correction during planning (Node 18 → 22), 10 advisories from review, 4 doc-accuracy fixes caught in post-execution code review. 13 files changed, +394/-3 lines of project files. Zero execution surprises. The plan was pre-scoped by a prior advisory orchestration, which made this phase unusually smooth.

## How the Team Was Assembled

The meta-plan identified three specialists whose domains directly mapped to the deliverables:
- **iac-minion** for CI workflow design (GitHub Actions, Node version, runner config)
- **devx-minion** for CONTRIBUTING.md structure and contributor workflow
- **software-docs-minion** for community doc tone, Contributor Covenant details, evolution log format

No discretionary reviewers were controversial. devx-minion was added as a Phase 3.5 reviewer because CONTRIBUTING.md is the primary developer experience artifact and devx-minion designed the two-tier setup -- they should verify it landed correctly.

## What the Specialists Argued

### The Node Version Debate

The original plan (from a prior advisory orchestration) specified Node 18 and .nvmrc with `18`. **iac-minion** caught this immediately: wrangler 4.73.0 requires Node >=20.0.0. They proposed Node 22 LTS for .nvmrc and >=20.0.0 for the engines field.

Node 20 was briefly considered and rejected -- it exits LTS maintenance in April 2026, one month from execution date. Node 22 LTS runs through October 2027. This was consensus across all specialists; no one argued for 20.

### Two-Tier Contributor Model

**devx-minion** identified a key insight that shaped CONTRIBUTING.md: `npm test` works completely without a Cloudflare account (Miniflare simulates the Workers runtime), but `npm run dev` requires a Cloudflare Workers Paid plan with Browser Rendering enabled. This means there's a meaningful split between "I can run tests and submit PRs" and "I can run the full dev server."

devx-minion recommended leading with a "Quick Start" (clone, install, test -- zero accounts) and framing full local dev as optional. **software-docs-minion** agreed and contributed specific phrasing. No disagreement here -- the structure fell out naturally from the platform constraint.

### Code of Conduct Enforcement Channel

The synthesis plan originally routed Code of Conduct enforcement reports through GitHub Security Advisories (GHSA), reasoning that GHSA was already set up for SECURITY.md. During Phase 3.5 review, **security-minion** flagged this: GHSA is designed for security vulnerabilities, not conduct reports. Mixing the channels conflates two distinct workflows with different response expectations.

The fix was straightforward: use a maintainer email address for conduct reports, keep GHSA for security vulnerabilities. The human provided the email address (bp@ben-peter.com) during execution.

### Evolution Log as Contributor Requirement

All three planning specialists converged on the same conclusion independently: external contributors should NOT be expected to write evolution log entries (prompt.md, decisions.md, outcome.md). The format is tightly coupled to the nefario orchestration workflow. **software-docs-minion** proposed specific framing: mention it exists, frame it as project history, don't make it a contributor obligation.

## What the Reviewers Found

Phase 3.5 produced 10 advisories across 6 reviewers (1 APPROVE from test-minion, 5 ADVISE, 0 BLOCK):

The most impactful advisories:
- **security-minion** caught three things: the GHSA/conduct channel conflation (fixed), missing `.env.*` glob pattern in .gitignore (added), and the SHA maintenance gap from having pinned actions without Dependabot (documented as residual risk).
- **devx-minion** caught three contributor experience issues: missing `nvm use` in Quick Start (without it, Node 18 users get cryptic wrangler errors), missing fetchMock leak consequence in testing gotchas (a non-deactivated mock causes failures in unrelated tests -- 20+ min of wrong-place debugging), and the "How This Project Is Built" framing (should lead with design rationale, not AI tooling).
- **margo** added a length guard for CONTRIBUTING.md: if it overshoots 150 lines, cut "If You're Changing the API" first, then "How This Project Is Built."

## Human Interventions

Two mid-execution interventions:
1. **Email address for package.json and CODE_OF_CONDUCT.md**: The human provided `bp@ben-peter.com` during execution. The plan had left the CODE_OF_CONDUCT enforcement contact unspecified pending the GHSA-vs-email decision.
2. **Copyright date**: The human changed the LICENSE copyright year from 2025 to 2026. The plan specified 2025 (first commit year), but the human preferred the current year.

What the human chose NOT to intervene on:
- The two-tier CONTRIBUTING.md structure landed as designed
- The CI workflow was accepted as-is (single job, sequential steps, SHA-pinned actions)
- SECURITY.md "goals, not guarantees" framing was accepted without changes
- All 10 Phase 3.5 advisories were accepted and incorporated

## Post-Execution Code Review

Three code reviewers (code-review-minion, lucy, margo) all returned ADVISE with overlapping findings -- all in outcome.md:
1. Script name mismatch: `lint:openapi` (written by software-docs-minion) vs `lint:api` (actual script name)
2. False claims that `bugs` and `homepage` fields were added to package.json (they weren't in the plan)
3. Reference to `Thumbs.db` in .gitignore (wasn't added -- macOS-only project)
4. Backlog "Updated through" header still said 0010 instead of 0012 (lucy catch)

All 4 were documentation inaccuracies in outcome.md, not functional issues. Auto-fixed in a single commit.

## Where to Read More

- Full nefario report: `docs/history/nefario-reports/2026-03-14-235240-open-source-readiness.md`
- Working files (all agent prompts and outputs): `docs/history/nefario-reports/2026-03-14-235240-open-source-readiness/`
- Phase 2 specialist contributions: `phase2-{iac,devx,software-docs}-minion.md` in the working files directory
- Phase 3.5 review verdicts: `phase3.5-{security,test,ux-strategy,lucy,margo,devx}-minion.md`
- Phase 5 code review findings: `phase5-{code-review,lucy,margo}.md`
