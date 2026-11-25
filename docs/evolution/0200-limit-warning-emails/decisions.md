# Decisions

- No new notification types. Both emails go out under preferences an account
  already has: the storage warning under "Approaching limit", the refused
  batch under "Limit reached". A new type would need a D1 column, a dashboard
  toggle and API changes for two emails that belong to the existing ones.
- Each has its own once-a-month limit. `dispatchNotification` takes an
  optional `dedupKey`, written to `notification_sent` instead of the type:
  `approaching_storage_limit` and `batch_refused`. So the capture warning
  doesn't hold back the storage warning, and a refused batch doesn't hold back
  the limit-reached email later in the month. `notification_sent.event_type`
  has no CHECK, so no migration.
- Storage warning at 80% of the storage limit (8 of 10 GB), like the capture
  warning at 80%. Only for accounts without a payment method and a finite
  limit. Checked after each completed capture next to the capture warning,
  with the same short-circuit read of `notification_sent`.
- Refused-batch email: for a free account whose batch asks for more captures
  than are left while some are left (`payment_required`, used < limit). It
  says how many are left and that a smaller batch works, not that captures are
  paused. Sent from the REST batch route and MCP `batch_capture`; a single
  capture can't hit this case.
- `billingEmailLinks()` in quotas.js builds the period and payment link for
  all three limit emails.
