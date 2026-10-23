# Decisions

## Why

66% of external captures in September and October were bulk work (lists
of pages from one site, or the same kind of page across many sites). The
only bulk option was the batch API, which needs code.

## What

- `POST /v1/sitemap` reads a sitemap or sitemap index and returns up to
  200 page URLs. It follows up to 10 child sitemaps, refuses `.gz` and
  bodies over 5 MB, and runs every fetch and every redirect hop through
  `validateUrl`, the same check captures use, so a sitemap can't point
  WRL at a private address. 10 reads a minute per tenant. The MCP tool
  `read_sitemap` does the same for agents.
- The dashboard capture form has a "Capture a list of URLs or a sitemap"
  section: paste URLs or load a sitemap, edit the list, then "Capture
  all". It sends the URLs through the existing batch endpoint in groups
  that fit the tenant's rate limit, reading `X-RateLimit-Remaining` and
  `X-RateLimit-Reset`, and waits for the window to reset between groups.
  The captures show up in the normal list below.

## Why the dashboard paces itself

The batch endpoint accepts up to 20 URLs, but each URL counts against
the per-tenant rate limit of 10 captures a minute, so a 20-URL batch
from a default tenant is always refused with 429. The docs examples
sent 20 per batch with no pause. Rather than raise the rate limit, the
dashboard sends what fits and waits; the docs now say 10 a minute and
the examples sleep 60 seconds between batches.

## Not done

- No server-side job for very long lists: the dashboard tab has to stay
  open while it submits. 200 URLs take about 20 minutes at the default
  limit.
- No crawling beyond the sitemap.
- The 20-URL batch maximum and the 10-per-minute rate limit still
  disagree for the API; changing either is a pricing question.
