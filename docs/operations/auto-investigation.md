# Automated Alert Investigation

When a production alert fires, the WRL Worker receives a webhook from Coralogix,
applies dedup and rate-limit checks, and dispatches a `repository_dispatch` event
to GitHub Actions. A Claude Code session then investigates the alert by reading the
relevant runbook, checking recent git history and source code, and posting findings
as a GitHub Issue with the `auto-investigated` label.

## Which alerts trigger investigation

| Alert | Priority | Runbook |
|-------|----------|---------|
| [WRL] Capture Failures | P1 | [capture-failures.md](runbooks/capture-failures.md) |
| [WRL] Auth Failure Spike | P1 | [auth-failure-spike.md](runbooks/auth-failure-spike.md) |
| [WRL] Worker Errors (5xx) | P1 | [worker-errors.md](runbooks/worker-errors.md) |
| [WRL] Qualified TSA Failures | P2 | [qualified-tsa-failures.md](runbooks/qualified-tsa-failures.md) |
| [WRL] Threat Check API Failures | P2 | [threat-check-api-failures.md](runbooks/threat-check-api-failures.md) |
| [WRL] Email Delivery Failures | P2 | [email-delivery-failures.md](runbooks/email-delivery-failures.md) |

P3 and P4 alerts (TSA Failures, Threat Check Quarantines, Email Bounces, New API
Key Created) send email notifications only and do not trigger automated investigation.

## How to verify it is working

**Send a test webhook** to confirm the Worker receives and dispatches correctly:

```bash
source ~/.secrets
curl -s -X POST https://api.webresourceledger.com/v1/webhooks/coralogix \
  -H "Authorization: Bearer $WRL_CORALOGIX_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "alert_id": "test-001",
    "alert_name": "[WRL] Capture Failures",
    "alert_action": "trigger",
    "hit_count": 5,
    "event_severity": "critical",
    "subsystem_name": "capture"
  }'
```

Expected response: `{"received":true,"dispatched":true}`

If `dispatched` is `false` with `reason: "deduplicated"`, a dispatch already ran in
this hour bucket. Use a different `alert_name` not in the recent dedup window, or
wait until the next UTC hour.

**Check that the workflow ran:**

```bash
gh run list --workflow=investigate-alert.yml --limit 5
```

**Find investigation issues:**

```bash
gh issue list --label auto-investigated --state open
```

**Expected latency:** 2-5 minutes from webhook receipt to issue creation.
The GitHub Actions runner queues immediately; the Claude Code session itself
takes 1-4 minutes depending on investigation depth and model latency.

## Kill switch (three levels)

Choose based on how quickly you need to stop dispatches and what you want to restore later.

**Level 1 — Coralogix (disable webhook integration):**

In the Coralogix UI, navigate to Alerts > Alert Webhooks and disable the WRL webhook
endpoint. No further webhooks reach the Worker. Re-enable when ready to resume.

**Level 2 — GitHub Actions (disable the workflow):**

```bash
gh workflow disable investigate-alert.yml
```

The Worker continues receiving and deduplicating webhooks, but no workflow runs.
Webhooks dispatched during the disabled window do not queue — they are silently
dropped by GitHub. Re-enable:

```bash
gh workflow enable investigate-alert.yml
```

**Level 3 — Worker (invalidate webhook auth):**

Rotate `CORALOGIX_WEBHOOK_SECRET` to a value Coralogix does not have. Every
incoming webhook returns 401 and nothing is dispatched. This is the fastest
kill switch and requires no Coralogix or GitHub access.

```bash
NEW_SECRET=$(openssl rand -hex 32)
echo -n "$NEW_SECRET" | unset CLOUDFLARE_API_TOKEN && npx wrangler secret put CORALOGIX_WEBHOOK_SECRET
# Update Coralogix webhook config with $NEW_SECRET when ready to restore
```

## Re-running an investigation manually

When an investigation produced an incomplete result, or you want to re-investigate
after resolving the root cause:

**Via CLI:**

```bash
gh workflow run investigate-alert.yml -f alert_name="[WRL] Capture Failures"
```

Replace the alert name with any of the six names in the allowlist table above.

**Via GitHub UI:**

Actions tab > Investigate Alert > Run workflow > enter alert name > Run workflow.

A manually triggered run uses `github.run_id` as the concurrency key (not the alert
dedup key), so it runs even if an automated run is already in progress for the same
alert.

## How to update investigation behavior

The investigation prompt and output format live in
`.github/workflows/investigate-alert.yml`. The runbooks that Claude Code reads
live in `docs/operations/runbooks/` and are read from `main` at investigation time.

**To change what Claude Code investigates or how it classifies:** edit
`.github/workflows/investigate-alert.yml` and merge to main.

**To change the investigation steps for a specific alert:** edit the corresponding
runbook in `docs/operations/runbooks/` and merge to main. The next investigation
for that alert picks up the updated runbook automatically — no workflow change needed.

## Failure modes

| Failure | Effect | Recovery |
|---------|--------|----------|
| Worker endpoint unreachable | Coralogix retries on its own schedule; no dispatch | Restore Worker or wait for Worker recovery |
| GitHub API rejects dispatch (e.g., expired token) | Worker logs `alert.dispatch_error`; issue not created | Rotate `GITHUB_DISPATCH_TOKEN` (see below) |
| GitHub Actions quota exhausted | Workflow queues but does not start | Wait for quota reset or re-run manually once capacity frees |
| Claude Code step fails (model error, timeout) | Issue not created or partial findings posted | Re-run manually via `gh workflow run` |
| Coralogix API key expired | Investigation notes what evidence it could not gather | Rotate `WRL_CORALOGIX_API_KEY` in `~/.secrets` and 1Password |

For dispatch errors, check recent Worker logs:

```bash
source ~/.secrets
# Query alert subsystem for dispatch_error events
```

## Cost controls

Four mechanisms prevent runaway investigation costs:

| Control | Mechanism | Limit |
|---------|-----------|-------|
| Per-alert dedup | KV key `cx_alert:{slug}:{hourBucket}`, TTL 7200s | 1 dispatch per alert per UTC hour |
| Daily circuit breaker | KV key `cx_dispatch_count:{date}`, TTL 86400s | 10 total dispatches per UTC day across all alerts |
| Workflow concurrency | `concurrency.group: investigate-{dedup_key}` | 1 concurrent run per dedup key (queues, does not cancel) |
| Workflow timeout | `timeout-minutes: 15` | Each investigation terminates after 15 minutes |

The daily circuit breaker resets at UTC midnight. If you need to dispatch more than
10 investigations in a day (e.g., during a multi-alert incident), temporarily
increase `DAILY_DISPATCH_LIMIT` in `src/coralogix-webhook.js` and deploy, or
trigger additional runs manually via `gh workflow run` (manual triggers bypass the
Worker dedup entirely).

## Secret rotation

### `CORALOGIX_WEBHOOK_SECRET`

This secret authenticates Coralogix to the Worker. Rotation order matters: update
Coralogix first so no webhooks are dropped during the cutover.

1. Generate a new secret: `openssl rand -hex 32`
2. Update the Coralogix webhook configuration with the new secret (Coralogix UI:
   Alerts > Alert Webhooks > edit the WRL endpoint)
3. Push the new secret to the Worker:
   ```bash
   echo -n "<NEW_SECRET>" | unset CLOUDFLARE_API_TOKEN && npx wrangler secret put CORALOGIX_WEBHOOK_SECRET
   ```
4. Store the new secret in 1Password (WRL vault > Production > `CORALOGIX_WEBHOOK_SECRET`)
   and update `~/.secrets` if the variable is cached there

### `GITHUB_DISPATCH_TOKEN`

This is a fine-grained GitHub PAT with `actions:write` scope. It expires every
90 days. Watch for `alert.dispatch_error` log events with HTTP 401 from the GitHub
API — that is the first symptom of expiry.

Rotation procedure:

1. Generate a new fine-grained PAT:
   - GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens
   - Repository: `benpeter/web-resource-ledger`
   - Permissions: Repository permissions > Actions = Read and write
   - Expiration: 90 days (maximum recommended)
2. Push to the Worker:
   ```bash
   echo -n "<NEW_TOKEN>" | unset CLOUDFLARE_API_TOKEN && npx wrangler secret put GITHUB_DISPATCH_TOKEN
   ```
3. Store in 1Password (WRL vault > Production > `GITHUB_DISPATCH_TOKEN`)
4. Update the expiry reminder in your calendar or task system
