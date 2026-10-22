# Outcome -- Phase 0109

## What changed

- `FREE_STORAGE_LIMIT` is 10 GB (was 1 GB). Tenants who are over 1 GB but under
  10 GB this month can capture again as soon as this deploys.
- `checkQuota()` returns `hasPaymentMethod` on a `storage_limit` refusal.
- New `formatStorage()` and `limitReachedEmailData()` in `src/quotas.js`.
- Single capture, batch and scheduler paths send `limit_reached` when a free
  tenant is cut off by either limit.
- `limit_reached` template: storage variant, reset date in both variants.
- `429` detail for free storage refusals names usage and the payment-method fix.
- Docs: `site/content/limits.md` table matches the code (10 GB free; no monthly
  limits with a payment method, replacing a stale "Pro 5,000 / 50 GB" row).
  OpenAPI usage examples use the new limit. CHANGELOG updated.

## Tests

Red tests were committed first (18 failing): the limit value,
`hasPaymentMethod` on storage refusals, `limitReachedEmailData()` cases, the
storage template, the 429 detail for single and batch captures, and email
dispatch from the HTTP storage path and from the scheduler. The two dispatch
tests run `worker.fetch` and `worker.scheduled` with a spy on `EMAIL_QUEUE`; the
existing 3c test only called `dispatchNotification()` directly, so the HTTP
wiring had no test before.

## Backlog changes

- Added: "[consider] Approaching-storage warning email", condition: a free
  tenant reaches the 10 GB storage limit.
- Annotated "[consider] R2 artifact streaming" with the measured 9 to 19 MB
  stored per capture (all artifacts together; the WACZ share is not measured).
