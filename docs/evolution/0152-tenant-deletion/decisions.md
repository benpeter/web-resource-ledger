# Decisions

- Admin routes rather than a script: they run with the Worker's own D1, R2 and KV
  bindings, and the vitest pool tests them end to end. Requests arrive by email, so an
  operator calls them; there is no self-service route (the retention page says so).
- `tenants.deletion_requested_at` (migration 0019) records the request. `checkQuota`
  refuses with `deletion_requested` while it is set, so REST captures answer 403 and the
  scheduler skips the tenant's schedules (`skipReason: deletion_requested`). Captures
  stay readable. Asking twice keeps the first date; `DELETE .../deletion` clears it.
- The purge (`DELETE /v1/admin/tenants/{id}`) refuses unless a request is at least 30
  days old and `confirm` repeats the tenant id: it is irreversible and a typo in the
  path must not be enough. It deletes R2 objects first (keys from each capture's
  `artifacts` and `wacz`), then all rows in one D1 batch, children first (threat checks
  through captures, sign-in links through the tenant's email address), then the
  `first_key:` KV entry. If R2 fails, the rows that list the keys are still there for a
  retry.
- Nothing purges on a timer. An automatic irreversible delete in a cron is a bigger risk
  than a forgotten purge; the admin tenant detail shows `deletionRequestedAt`, and
  OPERATIONS.md has the steps.
- Stripe isn't called. The response returns the Stripe customer id and the runbook says
  to cancel it in the dashboard; one request a year doesn't justify the API calls and
  their failure handling.
- Edge-cached capture responses survive the R2 delete; the runbook purges the cache
  (`targets: ["all"]`) afterwards.
- While writing the refusal for pending deletions: a tenant blocked for non-payment
  fell through the quota branch in `handleCreateCapture` and the batch handler and got
  429 with the storage-limit message, `undefined` values and `Retry-After: Invalid
  Date`. Both refusals now answer 403 with a plain message (`security.account_refused`
  in the logs). No production tenant is blocked today.
- POST `/v1/captures` and `/v1/captures/batch` didn't document a 403 at all, though a
  key without the capture scope already got one. Both now list it with the three
  cases.
- Found on the way, fixed in the next phase: MCP `capture_url` and `batch_capture` never
  call `checkQuota`, so neither the free-tier limit nor a block nor a pending deletion
  stops captures made through MCP.
