# Decisions

## What was wrong

Pirsch had 16 `Signup` events since March and nothing else: no `First Capture`,
`Payment Activated` or `Schedule Created`, although 13 tenants made a first
capture since July. Page views were mostly not pages.

- Server-side events were sent without a user agent, and `First Capture` used
  the captured site's URL instead of a WRL URL. Pirsch requires url, ip and
  user agent and answers 400 otherwise ("The URL, IP address, and User-Agent
  must be set."). `Schedule Created` came from API clients like curl, whose
  user agents Pirsch drops as bots.
- The landing and docs Workers counted every response under 400 as a page view:
  CSS, SVG, `robots.txt`, the sitemap, and redirects. In the 30 days before
  2026-10-22, `/robots.txt` (47 views) and CSS and SVG files (97) were 144 of
  the 501 views on the 16 most-viewed paths.
- Docs page views never showed up in Pirsch at all (0 docs paths in 90 days).
  Coralogix showed 57 rejected docs hits in 8 days. A replay from a laptop with
  the production key and a browser user agent was accepted for a docs URL, so
  the domain accepts docs; the Worker's own hits fail. The cause isn't clear
  yet: `pirsch.send_rejected` only logged the status. It now logs the first 200
  characters of Pirsch's error body, which names the missing or invalid field.

## Page views

`isPageView()` in `src/pirsch.js` counts a GET with a user agent that returned
an HTML page (200), or a browser revalidating one (304, with `Sec-Fetch-Dest:
document` or `text/html` in `Accept`). Assets, `robots.txt`, the sitemap,
redirects, errors and HEAD requests aren't page views. `trackHit` sends nothing
for a request without a user agent (closes #290). The decision lives in
`src/pirsch.js`, which both Workers share and which has tests, so the Workers
stay at a few lines.

## Server events

`trackServerEvent()` replaces `trackEventRaw()`. Every server event carries:

- a WRL URL on `api.webresourceledger.com` (`/v1/captures`, `/v1/schedules`,
  `/v1/billing/webhook`)
- the submitter's ip and user agent when the event traces back to their
  request; otherwise the documentation address `192.0.2.1` and
  `WRL-Server/1.0 (+https://webresourceledger.com)`
- `disable_bot_filter: true`, which Pirsch's docs describe for well-controlled
  applications. These are confirmed backend actions, not page loads, and API
  clients would otherwise be dropped as bots
- `non_interactive: true`, so the events don't change bounce rates

## Capture events

The consumer sends `First Capture`, `Capture Completed` (meta: `source`,
`qualified`) and `Capture Failed` (meta: `source`) from `src/analytics.js`.
`source` is `dashboard` or `api`, set by the two HTTP producers along with the
submitter's user agent, or derived as `mcp` or `schedule` from the message.
`Capture Failed` fires once per capture, when it fails for good: a
non-retryable failure, the dead-letter queue, or the fourth catastrophic
attempt. Retries don't send it.

## No account identifiers

Event meta used to include tenant ids, capture ids and Stripe customer ids. The
privacy policy disclosed tenant ids in conversion events, but nothing in
analytics needs them: D1 has the per-tenant truth. The events now carry only
the source and coarse flags, and the privacy policy says so (effective date
2026-10-22).

## Internal tenants

`ANALYTICS_EXCLUDE_TENANTS` (production: `gh-398734,default`) keeps the
founder's hourly self-captures and the legacy-key smoke tests out of Pirsch.
Otherwise the founder's schedule alone would produce about 720 `Capture
Completed` events a month, more than all users together.
