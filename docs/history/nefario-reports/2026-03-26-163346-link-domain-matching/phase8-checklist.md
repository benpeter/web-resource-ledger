# Phase 8 Documentation Checklist

## Items

- [x] [software-docs] **OpenAPI spec** -- New endpoint `GET /v1/billing/invoice` needs to be added to `openapi.yaml`. Priority: SHOULD (new publicly accessible endpoint)
- [ ] Docs site (`site/content/*.md`) -- No update needed. The redirect is internal email plumbing, not a user-facing feature. Users don't interact with this endpoint directly.
- [ ] Landing page (`landing/public/index.html`) -- No update needed. No pricing/tier changes, no new headline capabilities.
- [ ] MCP server (`src/mcp.js`) -- No update needed. The redirect endpoint is not an API tool for external consumers.
- [ ] Legal pages -- No update needed. No new data collection or third-party service integrations.
