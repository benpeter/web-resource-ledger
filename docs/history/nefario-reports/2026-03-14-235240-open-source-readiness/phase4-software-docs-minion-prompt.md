Create the evolution log entry for phase 0012 (open-source readiness) in `/Users/ben/github/benpeter/web-resource-ledger/docs/evolution/0012-open-source-readiness/`.

This phase brought web-resource-ledger to baseline open-source hygiene standards. The work was completed in Task 1 of this plan. Your job is to document what was done.

## Create these files:

### 1. `prompt.md`
Document the task briefing: Execute the open-source readiness plan -- make the repo ready for outside contributors. 8 steps: .gitignore, LICENSE, package.json metadata, .nvmrc, CI workflow, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md. Margo-approved scope only (no ESLint, Dependabot, templates, CODEOWNERS, release automation).

### 2. `decisions.md`
**Advisory [margo]**: Trim to 5-6 genuine architectural/technical decisions. Drop editorial tone choices (bug bounty omission, vanilla JS framing, backlog framing) -- these are implementation details, not decisions worth documenting.

**Advisory [security]**: Document SHA maintenance gap (pinned SHAs with no Dependabot) as a known residual risk.

Key decisions to document:

1. **Node version: 22 instead of 18** -- The original plan specified Node 18 and .nvmrc with `18`. iac-minion discovered wrangler 4.73.0 requires >=20.0.0. Resolved: .nvmrc = `22` (current LTS through Oct 2027), engines = `>=20.0.0`. Node 20 rejected because it exits LTS maintenance April 2026 (one month away).

2. **Two-tier contributor setup** -- devx-minion identified that `npm test` works without any Cloudflare account (Miniflare simulates everything), but `npm run dev` requires Cloudflare Workers Paid plan + Browser Rendering. CONTRIBUTING.md leads with "Quick Start" (no account needed) and frames full local dev as optional.

3. **Evolution log is NOT a contributor requirement** -- All three specialists agreed: the evolution log structure is coupled to the nefario orchestration workflow. External contributors should not be expected to write prompt.md/decisions.md/outcome.md. Maintainers handle it.

4. **CI: actions pinned to commit SHAs (with residual maintenance risk)** -- Security best practice for open-source projects. Version tags can be moved; SHAs are immutable. However, without Dependabot (explicitly out of scope per Margo), pinned SHAs require manual monitoring for updates. This is a known trade-off: security of pinned SHAs vs. maintenance burden of manual updates.

5. **Code of Conduct enforcement via email, not GHSA** -- Contributor Covenant v2.1 requires a contact method. Originally planned to use GitHub Security Advisories, but security-minion advised against conflating conduct reports with vulnerability reports. Uses maintainer email instead.

6. **SECURITY.md: "goals, not guarantees" framing** -- 72h acknowledgment / 7d assessment targets stated as goals, not SLAs. Avoids both corporate contract language and underselling responsiveness.

### 3. `outcome.md`
Summarize what was produced:

**Files created**: .nvmrc, .github/workflows/ci.yml, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
**Files modified**: .gitignore (added OS/editor/log/env patterns), LICENSE (filled copyright), package.json (added metadata)

**Key outcomes**:
- The repo now has baseline open-source hygiene: license with attribution, contributor guide, security policy, code of conduct, CI, and correct Node version tooling
- CI runs tests and API linting on every push to main and every PR
- Contributors can clone and run tests immediately without any Cloudflare account
- The two-tier development model (test-only vs full-dev) is documented clearly

**Deferred items / backlog changes**:
- Review `docs/backlog.md`: The CI/CD pipeline item under Operations ([must] "add GitHub Actions when it hurts") should be marked as partially done -- CI is in place, CD (deployment) is still deferred
- README.md should eventually link to CONTRIBUTING.md (out of scope for this phase)
- "Good first issue" labels and contributor-ready backlog curation deferred until there are actual contributors
- ESLint, Dependabot, issue/PR templates, CODEOWNERS, release automation all remain deferred per Margo-approved scope

**What went as planned**: All 8 steps completed as specified. Node version correction was the only material change from the original plan.

**What didn't go as planned**: Nothing significant. The Node 18 -> 22 correction was caught during Phase 2 planning (by iac-minion), not during execution.

## Also update:

### 4. `docs/evolution/README.md`
Add a new row to the table:
```
| [0012-open-source-readiness](0012-open-source-readiness/) | Open-source readiness: .gitignore, LICENSE, CI, contributor docs |
```

### 5. `docs/backlog.md`
Update the Operations section: change the CI/CD pipeline item from `[must]` to reflect that CI is now done but CD is still deferred. Suggested edit:
- Change: `- [must] CI/CD pipeline -- "add GitHub Actions when it hurts" or >1 developer (MVP.md, iac-minion, kickoff)`
- To: `- ~~[must] CI/CD pipeline~~ -- CI added in 0012-open-source-readiness; CD (deployment automation) still deferred (MVP.md, iac-minion, kickoff)`

## What NOT to Do
- Do NOT create process.md -- that will be written by the calling session after PR creation
- Do NOT modify any files created by Task 1 (they are already committed)
- Do NOT modify README.md

When you finish, report back with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
