# Test Minion Review: mcp-server-web-evidence

**Verdict: ADVISE**

The overall approach is sound. Raw HTTP JSON-RPC against the Worker endpoint is the right testing strategy -- it tests what matters (WRL's protocol handling and tool logic) without coupling tests to MCP SDK internals. The existing vitest + @cloudflare/vitest-pool-workers infrastructure handles this correctly. Three issues need attention before implementation.

---

- [testing]: The round-trip test (test 15) calls `capture_url` then `get_capture` sequentially, but `ctx.waitUntil()` in miniflare completes asynchronously and may not have resolved before the next tool call.
  SCOPE: `test/mcp.test.js` -- full round-trip test (test 15)
  CHANGE: Either (a) set up the capture KV record and R2 artifacts directly using `createCapture` + `performCapture` with `stubRenderer` (as `verify-integration.test.js` does in `beforeEach`), then call `get_capture` and `verify_capture` against that pre-seeded state -- bypassing the async wait -- or (b) document explicitly in the test that miniflare's `waitUntil` draining behavior must be confirmed before relying on it for sequential assertions. Option (a) is more reliable and matches existing patterns.
  WHY: `ctx.waitUntil()` semantics in miniflare are not guaranteed to drain before the test's next HTTP request. If `get_capture` is called before the capture worker resolves, the test will see `pending` status and fail intermittently. This is a classic async/timing flakiness pattern. The `verify-integration.test.js` already solved this by seeding state directly in `beforeEach` -- the round-trip test should do the same.
  TASK: 4

- [testing]: The plan specifies testing `capture_url` with `insufficient scope` using a key with only `read` scope (test 3), but the plan also says route-level auth requires `read` scope -- meaning a `read`-only key passes route auth but should be rejected inside the `capture_url` tool handler. The test must verify the JSON-RPC response shape (not an HTTP 4xx), since the 401 was already bypassed by route auth.
  SCOPE: `test/mcp.test.js` -- test 3 (insufficient scope)
  CHANGE: Assert the response is HTTP 200 with a JSON-RPC result containing `isError: true` in the tool content, NOT a 401 HTTP status. The test comment should clarify this distinction. Use `seedApiKey` from `fixtures.js` to create a `read`-only KV key (mirrors the pattern in `auth.test.js`).
  WHY: The plan's architecture has two auth layers: route-level (Bearer, requires `read`) and tool-level (`capture_url` requires `capture`). A `read`-only key passes route auth and reaches the tool handler, which returns a tool error embedded in a JSON-RPC 200 response. Testing for HTTP 401 here would pass the wrong assertion and miss the actual failure mode agents will encounter.
  TASK: 4

- [testing]: The `verify_capture` happy-path test (test 10) requires a signed WACZ bundle in R2, but the plan prompt tells the implementer to "create a complete capture with a signed WACZ in R2" without pointing to the exact setup pattern. `verify.test.js` builds WACZs manually using `fflate` + raw crypto -- this is complex and error-prone to replicate.
  SCOPE: `test/mcp.test.js` -- test 10 (verify_capture verified)
  CHANGE: The implementer must use `performCapture` with `stubRenderer` (from `fixtures.js`) inside `beforeEach` to produce a real signed WACZ, exactly as `verify-integration.test.js` does. The Task 4 prompt should explicitly reference `test/verify-integration.test.js` lines 20-43 as the required setup pattern, not the manual WACZ construction in `verify.test.js`.
  WHY: `verify-integration.test.js` already has a working, tested setup that produces a cryptographically valid WACZ via the real code path. Using it guarantees the test exercises the actual signing logic. If the implementer follows `verify.test.js` instead and constructs a WACZ manually, they may produce a bundle that verifies under direct `verifyWacz()` calls but differs from what `performCapture` actually produces, creating a false pass.
  TASK: 4
