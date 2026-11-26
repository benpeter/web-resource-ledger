# Decisions

- `DELETE /v1/admin/captures/{id}/quarantine`, admin key only. `scope=url`
  releases every quarantined capture of the same URL, across tenants, since
  the re-scan quarantines by URL too. 404 for an unknown capture, 409 when it
  isn't quarantined.
- The release clears `quarantined`, `quarantine_reason` and `quarantined_at`
  and writes a `threat_checks` row with verdict `safe` and source `operator`.
  The table already had a free-text `source` column, so no migration.
- The re-scan query and `quarantineCapturesByUrl` skip captures that have
  such a row. Without that, the next night's re-scan would quarantine them
  again while Web Risk still lists the URL. New captures of the URL are
  checked as before.
- No `capture.unquarantined` webhook event: subscribers would have to opt in
  to a new event type, and releases will be rare enough that an email to the
  tenant does the job. The webhooks page tells tenants to email
  hello@webresourceledger.com about a quarantine they dispute.
- Verification responses cached before the quarantine stay valid: the capture
  and its signature did not change.
