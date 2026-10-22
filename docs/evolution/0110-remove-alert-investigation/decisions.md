# Decisions

## What the pipeline was

Phase 0105 wired six of the ten Coralogix alerts to a webhook,
`POST /v1/webhooks/coralogix`. The Worker checked a shared secret and sent a
`repository_dispatch` event to GitHub, which ran `investigate-alert.yml`: Claude
Code read the runbook for the alert and posted its findings as a GitHub issue.
Coralogix emailed every alert to bp@ben-peter.com independently of this.

## Why remove it rather than fix it

- It had stopped working. The workflow pinned `claude-sonnet-4-20250514`, which
  was retired, so the investigations on 2026-10-05 and 2026-10-22 failed without
  producing an issue.
- The alerts it would have looked at were noise: both were auth-failure spikes
  around a low threshold, not incidents.
- It depended on a 90-day GitHub token, an OAuth token for Claude Code and a
  shared webhook secret, all to be rotated for a pipeline that hadn't produced a
  useful issue.
- Ben stopped agent-driven work on WRL in phase 0108. An unattended agent that
  opens issues on every alert is the same kind of machinery.

## What goes

- `.github/workflows/investigate-alert.yml`
- `src/coralogix-webhook.js`, its route, and `test/coralogix-webhook.test.js`
  (replaced by one test in `test/health.test.js` that the endpoint returns 404)
- `docs/operations/auto-investigation.md` and `scripts/create-investigation-labels.sh`
- the webhook entry in the six alert definitions in `scripts/provision-alerts.sh`,
  and the code there that created the "WRL Alert Receiver" integration
- the `alert.*` rows in `docs/operations/coralogix-events.md`, the test bindings
  for `CORALOGIX_WEBHOOK_SECRET` and `GITHUB_DISPATCH_TOKEN`, and the two backlog
  items that only made sense with the pipeline

## What stays

- All ten alerts, their thresholds and their email notifications. The
  auth-failure threshold stays as it is: two emails a month is not a burden.
- The `alert:*` and `auto-investigated` GitHub labels, because past issues
  carry them.
- The phase 0105 evolution entry, as history.

## Order of the live changes

The Coralogix alerts were switched to email-only and the webhook integration
deleted before this branch was merged, so no alert could call an endpoint that
no longer exists.
