# Outcome

- Staging: `PUT /v1/admin/tenants/smoke-test/config` with
  `{"quotas":{"capturesPerMonth":2000}}` on 2026-11-15 17:27 UTC, then the
  failed smoke job of run 43740423747 was re-run. Production deployed
  aeb4e63 at 17:28 UTC, 15 minutes after #458 was merged.
- `scripts/smoke-test.sh`: check 4 keeps the response body and adds the
  problem's `detail` to the failure line.
- `OPERATIONS.md`: the smoke tenant, who else uses its key, the override,
  and what to do when the smoke job fails with 429.
- Production is not exposed to this: its smoke job skips the capture
  round-trip.

## Backlog changes

- New #103, with the follow-ups that are left: an alert on a failed staging
  deploy.
