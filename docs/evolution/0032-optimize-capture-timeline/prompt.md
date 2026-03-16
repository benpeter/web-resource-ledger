# Prompt: Optimize Capture Pipeline (#79)

GitHub Issue: #79

## Task

Optimize capture pipeline: consent timeout, graceful consent failure, adaptive settle.

## Outcome

Capture pipeline completes faster and more reliably by eliminating wasted time
in the consent and settle stages, and by surviving autoconsent bugs that currently
crash entire renders. Stage-level timing analysis (#75) showed consent timeout
burning 8s on 6/7 tested sites with no CMP detected — 33% of the 30s ctx.waitUntil
budget spent doing nothing.

## Success criteria

- Consent timeout reduced from 8s to 2s; all existing consent tests pass
- Autoconsent failures (e.g., TypeError on adobe.com) degrade to consentStatus:
  'failed' instead of crashing the renderer; capture completes with individual
  artifacts
- Settle delay adapts to actual network activity with a 3s cap; pages that settle
  faster than 3s proceed earlier
- Median capture time for CMP-absent pages drops by at least 5s (baseline: ~23s
  from staging data)
- No change to capture quality or artifact completeness for working pages
- adobe.com captures succeed (currently fails with TypeError in consent.js)

## Scope

**In:** CONSENT_TIMEOUT_MS in consent.js, try/catch wrapper around
dismissCookieConsent() in defaultRenderer(), settle delay logic in
defaultRenderer(), related tests and OpenAPI descriptions

**Out:** Consent opt-in per capture request, screenshot format changes (WebP),
session pool optimization, Coralogix alerting rules

## Constraints

- Consent timeout set to 2s (real CMPs resolve in <2s; slashdot.org with
  consentmanager.net completed in 1.8s)
- Evidence base: docs/evolution/0031-stage-level-timings/
