Optimize capture pipeline: consent timeout, graceful consent failure, adaptive settle

## Outcome

Capture pipeline completes faster and more reliably by eliminating wasted time in the consent and settle stages, and by surviving autoconsent bugs that currently crash entire renders. Stage-level timing analysis (#75) showed consent timeout burning 8s on 6/7 tested sites with no CMP detected — 33% of the 30s ctx.waitUntil budget spent doing nothing.

## Success criteria

- Consent timeout reduced from 8s to 2s; all existing consent tests pass
- Autoconsent failures (e.g., TypeError on adobe.com) degrade to consentStatus: 'failed' instead of crashing the renderer; capture completes with individual artifacts
- Settle delay adapts to actual network activity with a 3s cap; pages that settle faster than 3s proceed earlier
- Median capture time for CMP-absent pages drops by at least 5s (baseline: ~23s from staging data)
- No change to capture quality or artifact completeness for working pages
- adobe.com captures succeed (currently fails with TypeError in consent.js)

## Scope

In: CONSENT_TIMEOUT_MS in consent.js, try/catch wrapper around dismissCookieConsent() in defaultRenderer(), settle delay logic in defaultRenderer(), related tests and OpenAPI descriptions

Out: Consent opt-in per capture request, screenshot format changes (WebP), session pool optimization, Coralogix alerting rules

## Constraints

- Consent timeout set to 2s (real CMPs resolve in <2s; slashdot.org with consentmanager.net completed in 1.8s)
- Evidence base: docs/evolution/0031-stage-level-timings/staging-analysis.md

---
Additional context: skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement. IMPORTANT: other worktrees may be running in parallel -- check the evolution log sequence numbers on upstream main before PR creation and adjust. when done, deploy to staging, test some heavy-loading sites - the guardian, adobe.com, tagesschau, slashdot, and 3-5 more, and open the verify pages in the browser when done
