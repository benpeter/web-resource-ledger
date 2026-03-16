MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Optimize capture pipeline: consent timeout, graceful consent failure, adaptive settle

Capture pipeline completes faster and more reliably by eliminating wasted time in the consent and settle stages, and by surviving autoconsent bugs that currently crash entire renders. Stage-level timing analysis (#75) showed consent timeout burning 8s on 6/7 tested sites with no CMP detected — 33% of the 30s ctx.waitUntil budget spent doing nothing.

### Success criteria

- Consent timeout reduced from 8s to 2s; all existing consent tests pass
- Autoconsent failures (e.g., TypeError on adobe.com) degrade to consentStatus: 'failed' instead of crashing the renderer; capture completes with individual artifacts
- Settle delay adapts to actual network activity with a 3s cap; pages that settle faster than 3s proceed earlier
- Median capture time for CMP-absent pages drops by at least 5s (baseline: ~23s from staging data)
- No change to capture quality or artifact completeness for working pages
- adobe.com captures succeed (currently fails with TypeError in consent.js)

### Scope

In: CONSENT_TIMEOUT_MS in consent.js, try/catch wrapper around dismissCookieConsent() in defaultRenderer(), settle delay logic in defaultRenderer(), related tests and OpenAPI descriptions

Out: Consent opt-in per capture request, screenshot format changes (WebP), session pool optimization, Coralogix alerting rules

### Constraints

- Consent timeout set to 2s (real CMPs resolve in <2s; slashdot.org with consentmanager.net completed in 1.8s)
- Evidence base: docs/evolution/0031-stage-level-timings/staging-analysis.md

## Working Directory

/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/optimize-capture-timeline

## External Skill Discovery

No external skills detected in .claude/skills/ or .skills/ relevant to this task.

## Instructions
1. Read relevant files to understand the codebase context
2. The scope is well-defined: consent.js (timeout constant), capture.js (try/catch around consent, adaptive settle logic), tests, OpenAPI
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-H6iVro/optimize-capture-timeline/phase1-metaplan.md
