# Decisions

- Both MCP capture tools call `checkQuota` in the same place as the REST handlers:
  after the per-tenant rate limits and before the global capacity limit, and before
  any URL is resolved or any capture row is written. `batch_capture` checks the whole
  batch at once, so a batch that would go past the limit is refused as a whole, as
  on REST. The legacy key skips the check, as on REST, because it has no tenant row.
- The refusal texts (`accountRefusalDetail`, `storageLimitDetail` and the capture
  limit texts) move from `src/index.js` to `src/quotas.js` as exported helpers, with
  the single and batch texts in `quotaLimitDetail`. REST and MCP now send the same
  words; the REST responses don't change. MCP returns them as a tool error.
- MCP refusals log `security.account_refused` and `security.quota_exceeded` with
  `via: 'mcp'` and the HTTP status the REST route would have sent, and send the same
  limit-reached email.
- While testing: `get_usage` read its numbers from `checkQuota(..., 0)`, whose
  refusals leave out the counts. A blocked account, one with a pending deletion and
  one already past a limit saw "Captures used: 0", billing status `free` and period
  `(unknown)`. The REST usage endpoint already read the rows again in that case; that
  read moves to `quotas.js` as `readTenantUsage` and `get_usage` uses it. A pending
  deletion now gets the same closing line as a block.
- Usage counts completed captures (the queue consumer increments it), so captures
  still in flight don't count yet and a burst can end a few past the limit. That
  holds for REST too and isn't changed here.
- Production data: only the founder account ever went past 200 captures in a month
  without a payment method (408 in 2026-03, 201 in 2026-07); nothing shows whether
  those came through MCP.
- Docs: the limits page quoted made-up 429 texts (and a `quota.remaining` field the
  API doesn't send); it now quotes the real ones and explains the 403. The batch page
  example had the wrong 422 title and detail text.
