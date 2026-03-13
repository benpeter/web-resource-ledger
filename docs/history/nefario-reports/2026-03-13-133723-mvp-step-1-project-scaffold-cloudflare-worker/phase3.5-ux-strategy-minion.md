ADVISE

- [ux-strategy]: The `detail` message in the 404 fallback exposes the HTTP method and raw pathname in the error text, which sets a precedent for detail message formatting that future steps may follow inconsistently.
  SCOPE: `src/index.js` — the fallback `problemResponse(404, ...)` call
  CHANGE: Standardize the detail message format in the code comment at the routes array. The current example (`No route matches ${request.method} ${url.pathname}`) is reasonable, but the comment documenting "detail message convention" lives in `src/responses.js`, not at the call site where developers will look first when adding routes in Steps 2-8. Add a one-line example to the routes comment so the convention is visible at the point of use.
  WHY: The plan correctly identifies RFC 9457 type field drift as a risk across 8 implementation steps. The same drift risk applies to `detail` message quality — developers adding routes in later steps will pattern-match from the nearest example they see, which is the fallback 404 in index.js. If that example is the only model, later steps may write terse or inconsistent details. Placing the convention comment in responses.js only is a proximity failure.
  TASK: Task 2

- [ux-strategy]: The health endpoint returns `{"status":"ok"}` with no timestamp or version field, which is sufficient for Step 1 but sets a bare-minimum contract that is harder to extend later without a breaking change.
  SCOPE: `src/index.js` — `handleHealth` function; `test/health.test.js` — assertion on body shape
  CHANGE: No change required for Step 1 — this is an advisory for the roadmap, not a blocker. When Step 8 (headers, observability) is planned, consider whether `GET /health` should evolve to include a `version` or `uptime` field. The test currently asserts `toEqual({ status: 'ok' })` which will fail if a field is added — ensure the test uses partial matching (`toMatchObject`) or document that the test must be updated when the response shape grows.
  WHY: Strict equality assertions on the health body (`toEqual`) create friction for every future enhancement to the health endpoint. Using `toMatchObject` costs nothing now and eliminates a predictable future edit. This is a minor learnability issue: developers reading the test as a contract specification may conclude the response is intentionally frozen.
  TASK: Task 3

- [ux-strategy]: The `problemResponse` fallback title `'Error'` for unknown status codes is a silent degradation with no visibility to the developer who caused it.
  SCOPE: `src/responses.js` — the `titles[status] || 'Error'` fallback
  CHANGE: Add a comment on the fallback line noting that `'Error'` signals a missing entry in the `titles` map, and that developers adding new error types should add the corresponding status code to `titles` first. Alternatively, consider `console.warn` in development when the fallback fires. The comment approach has zero runtime cost.
  WHY: A developer calling `problemResponse(418, ...)` will get a response with `title: 'Error'` and no indication that this is a degraded output. The test suite covers this case (the 418 fallback test asserts 'Error') but frames it as expected behavior rather than a gap to fill. Future steps are unlikely to hit this in practice, but the silent fallback violates the "system status must be visible" heuristic at the developer-experience level.
  TASK: Task 2
