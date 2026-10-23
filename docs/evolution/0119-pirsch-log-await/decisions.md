# Decisions

- What is known: the docs Worker's code and key are the same as landing's. Run
  on Cloudflare's edge with `wrangler dev --remote`, the docs Worker's hit was
  answered 200 by Pirsch and counted. The deployed docs Worker logs no
  `pirsch.send_rejected` and its hits never count.
- Why no rejection was seen: since phase 0113, `_send` called `log()` for a
  rejection inside a `.then` without returning it. A Worker ends once its
  `waitUntil` promises settle, so the log could be dropped before it reached
  Coralogix. The 57 docs rejections logged before 0113 were sent by code that
  did not read the response body first.
- This phase makes the rejection and failure logs part of the promise `_send`
  returns, so the deployed docs Worker can tell us what Pirsch answers. The fix
  for #316 itself depends on that answer.
- The same dropped-log pattern was in five `usage.increment_fail` handlers in
  `src/index.js` and one cleanup handler in `src/capture.js`. They return the
  log call now too.
- `src/scheduler.js` has the same pattern on its usage increment, but that
  increment is wrong in itself (it double-counts scheduled captures) and is
  removed in phase 0120.
