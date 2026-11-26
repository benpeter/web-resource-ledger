# Decisions

- The checker lives in the API Worker, not the landing Worker: it needs
  `validateUrl`, a rate limiter, KV and a staging environment, and the
  landing Worker has none of them. The landing Worker forwards
  `webresourceledger.com/tools/` to it over a service binding (`API` ->
  `wrl`), so the page's address is the landing site and its fetches stay on
  its own origin on both hosts (no CORS). The forwarded request keeps
  `CF-Connecting-IP`, so the per-IP limit sees the visitor. The landing
  Worker keeps the page's own CSP (it runs a script; the landing pages have
  `script-src 'none'`) and adds its other security headers.
- The page sends its list in batches of 10 to `POST /tools/link-check`. The
  batches give the page its progress, keep each request short and keep the
  Worker's subrequests per request low (each hop costs a fetch and two DNS
  lookups). The first batch gets a 16-hex run id; later batches send it with
  their `seq` (1 to 9).
- Every hop goes through `validateUrl`, as in `src/sitemap.js`, so the
  checker never sends a request to a private address, not even after a
  redirect. `Could not resolve hostname` counts as `dead` (a domain that
  lapsed is the commonest kind of rot); the other refusals are `invalid` and
  nothing is requested.
- HEAD first, GET when HEAD fails or answers 4xx/5xx: some servers answer
  HEAD with 404 or 405 for pages that exist. The body is cancelled unread.
  One 10-second budget per URL covers all its hops; at most 5 redirects.
- Six results instead of the issue's four: `alive`, `redirected`, `dead`
  (404, 410, other 4xx, no such domain, no answer), `unclear` (401, 403,
  429, 5xx, a redirect without a usable target, more than 5 redirects),
  `timeout`, `invalid`. Bot protection answers 403 or 503 for pages that
  exist; calling those `dead` would be wrong, and the #42 study had the
  same "unclear" group.
- Each batch is its own KV key, `link-check:{run}:{seq}`, with no expiry, so
  shared links keep working. One key per run would need read-modify-write,
  which KV's eventual consistency can turn into a lost batch. A batch for a
  run whose first batch doesn't exist is refused (404), and so is a batch
  that was already checked (409).
- The per-IP limit reuses `VERIFY_RATE_LIMITER` (60/60 s) under the key
  `link-check:<ip>`, so 600 URLs a minute per address, without a new
  limiter namespace.
- The endpoints sit under `/tools/`, outside `/v1/`, and are not in
  `openapi.yaml`: the issue rules out a public API. They have rows in the
  `docs/INTERNALS.md` route table.
- Pirsch: the landing Worker counts the page view as for every landing
  page; the first batch of a run sends a `Link check` event with the number
  of URLs. The privacy policy names the checker, what a run keeps and how
  long.
- A shared link (`?run=`) serves the same page with `noindex`; the
  canonical is always the bare page.
