# Outcome

## Live changes (2026-10-22, before merge)

- `scripts/provision-alerts.sh` (this branch) run against production Coralogix:
  six alerts updated to email-only, four were already email-only. Checked
  afterwards through the alerts API: all ten list only the email recipient.
- Coralogix webhook integration "WRL Alert Receiver" (externalId 624821)
  deleted; the webhook list is empty.

## Code

- Workflow, Worker endpoint, its tests, the auto-investigation runbook and the
  label script removed. `POST /v1/webhooks/coralogix` returns 404.
- Red test committed first; the full unit suite passes after the removal.

## Left after merge

- Delete the Worker secrets `CORALOGIX_WEBHOOK_SECRET` and
  `GITHUB_DISPATCH_TOKEN`, and the repository secrets the workflow used.
- The fine-grained GitHub token behind `GITHUB_DISPATCH_TOKEN` has to be revoked
  in GitHub's settings by its owner; the API can't delete it.
