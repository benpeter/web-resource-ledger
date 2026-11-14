# Decisions

- The session-only dashboard routes (keys, settings, ToS, first key, billing) stay out
  of `openapi.yaml`. Phase 0134 decided they stay session-only, an API key gets 401 on
  them, and the INTERNALS route table already lists them. The public reference covers
  what an API client can call.
- `GET` and `PUT /v1/account/notifications` are in the reference already, so they keep
  their place but declare a new `sessionCookie` scheme (`__Host-wrl_session`) instead of
  `security: - {}`, which reads as "no auth". Production answers 401 to both a key and
  no credentials. The API reference shows a "Dashboard session" badge for them; with
  `- {}` it showed no badge at all.
- `test/routes-sync.test.js` (sync suite, like `mcp-sync`) checks three things, reading
  the files as text: every route in the `src/index.js` router has a row in the
  INTERNALS table, every row is a real route (`POST /mcp` is handled before the router),
  and every OpenAPI operation's `security` matches its row's Auth column. The Rate Limit
  column isn't checked: it names the limiter bindings, which don't map one-to-one onto
  route prefixes.
- The diff route's row said "none (optional dual)"; the handler returns 401 without
  credentials (production too), so the row now says `dual`, as the spec already did.
- `bearerAuth` said keys come from `POST /v1/admin/keys` or the static
  `CAPTURE_API_KEY`. Users get the first key at sign-in and more in Settings → API
  Keys; the admin route and the static key are for operators of their own deployment.
- `ADMIN_RATE_LIMITER` is 30 a minute in `wrangler.toml`, not 5, and account and billing
  routes use `AUTH_RATE_LIMITER`, not the admin one. The table now says so.
