# Outcome

- `src/index.js`: the account gate authenticates `GET /v1/account/usage` with an API key
  (`read` scope) when the request has an `Authorization` header.
- `src/account.js`: the usage log records the auth method.
- `test/account-usage.test.js`: read key 200 with that tenant's numbers, admin-only key
  403, unknown key 401, and `/v1/account/keys` still 401 for a key. Red first (865de68).
- `test/e2e/quota-enforcement.spec.js`: waits for the usage counter before the second
  capture.
- `openapi.yaml`: description says which credentials work, 403 response, response schema
  and examples match the handler, new `PricingTier` component.
- `site/content/limits.md`: curl example with an API key instead of "requires session
  auth"; `docs/INTERNALS.md` route table: `dual`; CHANGELOG under Fixed.
- MCP: no change, `get_usage` already took a `read` key; the docs now point to it from
  the REST section.

## Backlog changes

None in benpeter/wrl-backlog: this came out of the phase 0133 E2E check, not an item.
