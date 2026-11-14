# Decisions

- The code follows the docs, not the other way round: `limitType: "schedules"`
  is added to the schedule-limit `429`, an additive field no client can trip
  over. The dashboard and MCP don't read it; they show the `detail` text.
- The OpenAPI `429` for `POST /v1/schedules` said `limitType: 'rate'` for burst
  rate limiting. That route has no burst limiter, so the description now covers
  only the schedule limit, and the `Retry-After` header is gone from it: waiting
  doesn't free a slot.
- `setTenantConfig` throws `schedules.maxSchedules ...` for a value below 1 or
  above 100, but the admin handler only turned `rateLimit.` and `quotas.` errors
  into a `400`. `schedules.` joins that list.
- The schedules guide carried `noindex: true` from phase 0091, when it was not in
  the nav. It is in the nav now, so the page is indexed and listed in the sitemap.
- The compare tables say "Hourly or slower (10 URLs)" with the partial badge,
  not a pass: the row is about bulk monitoring, and 10 schedules with an hourly
  minimum is small next to the crawl-based tools in that row.
- The admin config routes are missing from the OpenAPI spec; that is a separate
  change.
