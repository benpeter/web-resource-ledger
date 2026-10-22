# Decisions -- Phase 0109

## Free storage limit: 10 GB per month

Stored bytes per capture in production are 9 to 19 MB (two screenshots, the
rendered HTML, headers and the WACZ). 200 captures at 19 MB is 3.8 GB. 10 GB
leaves room for an average of 50 MB per capture, so the 200-capture limit is the
one free tenants hit, and the storage limit only stops unusually large pages.

Alternatives considered:

- 5 GB: fits 200 captures at 25 MB, less headroom for long pages with tall
  screenshots.
- No storage limit for free tenants: the capture count bounds usage anyway, but
  one capture of a very large page has no upper bound, so a cap stays.

Cost: R2 storage is $0.015 per GB-month, so a free tenant that uses all 10 GB adds
$0.15 a month for every month the data is kept. Nothing is deleted
automatically, so that accumulates. That is acceptable at current volume and is
the retention question already open in the backlog.

The counter is bytes written in the current month (`usage_counters.storage_bytes`),
not bytes stored. Deleting captures does not lower it. The docs table now says
"Storage / month" to match.

## Telling the tenant

- The `limit_reached` email gets a storage variant ("Free storage limit
  reached", storage used against the limit) instead of a new notification type.
  A new type would need a migration, a preference toggle and an unsubscribe
  label for a message that has the same purpose. The cost: a tenant who hits the
  storage limit and then the capture limit in the same month gets one email, not
  two, because `limit_reached` is deduplicated per month.
- Both variants now name the date the free allowance resets. The capture email
  used to say captures were paused until a payment method was added, which left
  out the monthly reset.
- `limitReachedEmailData()` in `src/quotas.js` decides whether a refusal sends an
  email and builds the template data. The single capture, batch and scheduler
  paths all call it. It returns null for tenants with a payment method (their
  limits come from operator overrides, and "add a payment method" would be
  wrong) and for batches that would only exceed the free captures while some
  are left.
- The scheduler now sends the email when it skips a free tenant at the limit.
  Deduplication in `dispatchNotification()` keeps it to one per month.
- The `429` detail for a free tenant at the storage limit now says how much was
  used and to add a payment method, like the capture-limit message already did.
- The dashboard showed "Monthly capture limit reached" for every quota `429`,
  storage included, and read the reset date from `data.resetsAt`, which the API
  never sets (it is `quota.resetsAt`), so no date ever appeared.
  `submit_quotaMessage()` now names the limit that was hit, shows the reset
  date, and tells free tenants to add a payment method in Settings. It decides
  that from the server's `detail` text, which says "Add a payment method" exactly
  when one would lift the limit. An extra boolean on the 429 body would be
  cleaner but changes the API for one sentence of UI text.

## Not done

- No "approaching the storage limit" warning. With 10 GB, the capture warning at
  160 captures comes first for typical pages. Added to the backlog.
- The batch path still sends no email when a batch would exceed the free
  captures while some are left. That is a "this batch is too big" answer, not a
  cut-off.
