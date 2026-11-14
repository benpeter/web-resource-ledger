# Decisions

- Only `GET /v1/account/usage` takes an API key. Keys, settings, ToS, billing and
  notifications stay session-only; a test checks that `GET /v1/account/keys` still
  refuses an API key. The usage numbers are what an API client needs before a batch,
  and MCP's `get_usage` already returns them for a `read` key.
- The key path is chosen by the `Authorization` header and checked with `verifyApiKey`
  and the `read` scope (a `capture` key includes `read`). A request with a bad key gets
  that key's 401 or 403; it doesn't fall back to the session cookie, the same rule as
  the capture routes ("presenting bad credentials is not equivalent to presenting none").
  The per-IP account rate limit (10 per minute) applies to both paths.
- The red scope test first used a `capture`-only key and expected 403. `hasScope`
  treats `capture` as including `read`, so that key is allowed; the test now uses an
  `admin`-only key, the one valid scope set without `read`.
- The `oauth.usage_view` log reports `authMethod: kv` for key requests instead of a
  hard-coded `session`.
- The OpenAPI schema for the response was wrong beyond auth: it required `tierDisplay`,
  which the handler never sent, and left out `billingStatus`, `hasPaymentMethod`,
  `gracePeriodEnd` and `billing`; its examples used a free limit of 100. The schema now
  follows the handler, with a `PricingTier` component for the `billing` tiers, and
  `limit`/`remaining` are nullable as the handler returns null without a limit.
- The quota E2E test polls this endpoint until the counter shows the first capture,
  every 4 seconds (the account rate limit), instead of submitting the second capture as
  soon as the first is complete. The counter is written after completion, in
  `ctx.waitUntil`, so the old test raced it. Making completion and counting atomic would
  touch the double-count fix from phase 0120 for an overshoot of at most the captures in
  flight, so it stays as it is.
