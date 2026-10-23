# Outcome

- `src/sitemap.js` (`readSitemap`, `parseSitemap`), `POST /v1/sitemap`,
  rate limit `sitemap` (10/min), MCP `read_sitemap`, OpenAPI entry.
- Dashboard: bulk section in `src/ui/ui-submit.js`
  (`submit_parseBulkList`, `submit_nextBatchSize`, `submit_batchWaitMs`).
- Docs: batch.md, limits.md (rate limit table), mcp.md, the
  preserve-a-site and compliance-survey use cases. The marketplace and
  preserve pages no longer say bot-check captures are marked complete
  (phase 0121 made them fail).

Red tests first: `test/sitemap.test.js` (15) and the bulk helpers in
`test/ui-submit.test.js` (7).
