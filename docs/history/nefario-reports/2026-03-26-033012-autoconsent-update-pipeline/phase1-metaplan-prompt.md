MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
## Summary

Automate the vendored autoconsent update process. Currently the update is manual (npm install → regenerate vendor script → test → PR). A GitHub Action should handle this periodically.

## Motivation

- Autoconsent receives frequent updates with new CMP rules (Sourcepoint, OneTrust, etc.)
- Manual updates lag — v14.59.0 → v14.63.0 gap caused Sourcepoint opt-out failures on Guardian/Spiegel/Zeit
- Automated pipeline catches CMP regressions before they affect production captures

## Proposed Implementation

GitHub Action workflow (`autoconsent-update.yml`):
1. **Trigger**: Weekly schedule (cron) or manual dispatch
2. **Check**: Compare installed version vs latest on npm
3. **Update**: `npm install @duckduckgo/autoconsent@latest`
4. **Regenerate**: Run vendoring script to rebuild `src/vendor/autoconsent-script.js`
5. **Update constant**: Bump `AUTOCONSENT_VERSION` in `src/consent.js`
6. **Test**: Run unit tests (`npm test`)
7. **Battery**: Run `npm run test:battery` against staging (requires staging API key secret)
8. **PR**: Open a PR with the version bump if tests pass

## Secrets Required

- `WRL_STAGING_KEY` — staging API key for test battery

## Acceptance Criteria

- Weekly cron trigger + manual dispatch
- Skips if already on latest version
- PR includes version diff in description
- Test battery results in PR comment
- No PR opened if tests fail
</github-issue>

## Codebase Context

Key files:
- `src/consent.js` — defines `AUTOCONSENT_VERSION = '14.63.0'`
- `src/vendor/autoconsent-script.js` — auto-generated wrapper exporting autoconsent script as string. Header says: "regenerate from autoconsent.playwright.js (NOT content.bundle.js)"
- `src/vendor/autoconsent.playwright.js` — vendored copy from @duckduckgo/autoconsent package (3709 lines)
- `package.json` — `"@duckduckgo/autoconsent": "^14.63.0"`
- No existing vendoring script exists — the regeneration is currently manual
- 8 existing GitHub Actions workflows in `.github/workflows/` (ci.yml, deploy-*, e2e-tests.yml, publish-verify.yml, vibe-coded-badge.yml)
- `scripts/test-battery.js` — capture quality validation against real sites, uses `WRL_KEY` env var
- One external skill discovered: `ops-runbook` (not relevant to this task)

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/streamed-munching-dragon

## External Skill Discovery
One skill found: `.claude/skills/ops-runbook/SKILL.md` — operational procedures. Not relevant to CI automation task.

## Instructions
1. Read relevant files to understand the codebase context
2. The external skill discovery is complete (1 skill found, not relevant)
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nkBysh/autoconsent-update-pipeline/phase1-metaplan.md`
