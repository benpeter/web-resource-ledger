# Security Minion Review: Browser Session Reuse / Playwright Migration

**Verdict: ADVISE**

The plan is well-structured from a security standpoint. The synthesis already
incorporates my prior recommendations (browserContext.route(), SW blocking,
context.close() invariant, orphan cleanup, threat model documentation). Two
residual concerns warrant advisory flags before execution.

---

- [security]: The `getOrCreateSession` wait path sleeps up to 3 seconds in a
  Worker request context; if that sleep is implemented as `await new
  Promise(resolve => setTimeout(resolve, ms))`, a malicious or slow target
  page could keep the Worker alive long enough to collide with the
  `ctx.waitUntil` 30-second hard ceiling, leaving KV in a permanently pending
  state for that capture.
  SCOPE: `src/capture.js` — `getOrCreateSession()` retry wait logic
  CHANGE: Cap the wait at a value that leaves guaranteed headroom: the existing
  `NAV_TIMEOUT_MS` (25s) plus the wait (up to 3s) already consumes 28s of the
  30s budget before the browser has navigated anywhere. Reduce the wait cap to
  1 second (not 3), or document explicitly in the header comment that the wait
  counts against the `ctx.waitUntil` budget and the 3s cap was a deliberate
  trade-off accepted with that risk.
  WHY: Fail-open on KV state is the existing worst case, but a systematic
  session-pool-exhaustion condition (high load) would turn every timed-out
  capture into a stuck-pending record rather than a clean `failed` record.
  TASK: Task 1 (getOrCreateSession implementation)

- [security]: The cross-domain navigation blocking compares
  `new URL(route.request().url()).origin` against `targetOrigin`, but the
  initial `targetOrigin` is set from the caller-supplied `url` before
  navigation begins. If the target page responds with a same-origin redirect
  that then issues a navigation to a second same-origin redirect to a
  *different* origin (a meta-refresh or JS navigation after the first
  `goto()` resolves), the context route handler will catch it — but the
  blocking logic is not applied to cross-origin *sub-navigations within
  iframes*. The plan does not address iframe navigation isolation.
  SCOPE: `src/capture.js` — `context.route()` handler
  CHANGE: This is a known accepted residual risk for an archival tool (iframes
  must load for faithful capture), but the header comment threat model should
  explicitly name iframe navigation as an accepted gap alongside the
  same-domain DNS rebinding residual risk already documented. The edge-minion
  prompt currently only documents the DNS rebinding residual; iframe
  same-origin misuse should be added to the threat model comment.
  WHY: Without explicit documentation, a future contributor may assume
  iframe navigation is blocked, leading to false confidence. The risk is low
  for the current single-tenant deployment but the gap should be named.
  TASK: Task 1 (header comment threat model section)

---

Both concerns are advisory, not blocking. The plan may proceed to execution.
The 3s-vs-1s cap is the higher-priority of the two — it touches runtime
correctness under load, not just documentation.
