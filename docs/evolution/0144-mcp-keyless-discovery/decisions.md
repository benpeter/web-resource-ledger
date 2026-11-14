# Decisions

- `initialize`, `notifications/initialized`, `ping` and `tools/list` answer without a
  key. The tool list doesn't depend on the caller (scope checks happen inside the tool
  handlers), and the MCP guide already publishes every tool and its inputs, so nothing
  new becomes visible. `tools/call` still needs a key.
- A request counts as keyless discovery only when it has no `Authorization` header and
  every JSON-RPC message in it uses one of those methods. A bad key still gets 401, the
  same rule as the REST routes ("bad credentials are not the same as none"), and a batch
  that mixes `tools/list` with a tool call gets 401.
- Deciding that means reading the body before the key check. The read uses the SDK's
  own `readRequestBody` on a clone, capped at the same 256 KiB as the transport, so a
  large keyless body costs no more than the transport would allow. A body that isn't
  JSON, or is over the cap, goes on to the key check and gets 401. `readRequestBody`
  isn't documented SDK API; the tests would notice if an SDK update moved it.
- Keyless discovery shares `VERIFY_RATE_LIMITER` (60 a minute per IP) with the other
  public reads, and a 429 logs `security.rate_limit` with `via: mcp`. The crawlers send
  one request every few minutes each.
- No log line for successful keyless discovery: Cloudflare's request analytics already
  show who calls, and an info event every few minutes would add noise. The 644 error
  events a day and a half from these probes go away with this change.
- `server.json` keeps `isRequired: true` for the `Authorization` header: a client needs
  the key for anything beyond listing.
