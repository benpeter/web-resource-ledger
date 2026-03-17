# Observability Analysis: keyName/authMethod in Capture Pipeline

## What the code actually shows

### Handler level (index.js, handleCreateCapture)

`keyName` and `authMethod` are available from line 170 onwards:

```js
const { tenantId, keyName, authMethod } = auth;
```

They are used in every security and error log emitted from the handler:
- `security.rate_limit` (lines 176, 185)
- `security.ssrf_block` (line 209)
- `capture.kv_create_fail` (lines 220-229)

The call to `performCapture` on line 233 does NOT pass them:

```js
ctx.waitUntil(performCapture(env, result.url, result.ip, captureId, tenantId, cip));
```

`captureId` IS passed, and it is logged in the handler's `capture.kv_create_fail` event immediately before the `ctx.waitUntil` call.

### Pipeline level (capture.js, performCapture)

`performCapture` emits these log events, none of which carry `keyName` or `authMethod`:

| Event | Severity | Has captureId | Has tenantId |
|---|---|---|---|
| `capture.start` | 3 | yes | yes |
| `capture.stage.fail` | 5 | yes | yes |
| `capture.header_fail` | 4 | yes | yes |
| `capture.key_archive_fail` | 4 | yes | yes |
| `capture.wacz_fail` | 4 | yes | yes |
| `capture.partial` | 3 | yes | yes |
| `capture.success` | 3 | yes | yes |
| `capture.consent_error` | 4 | yes | yes |
| `capture.fail` (catch-all) | 5 | yes | yes |
| `capture.kv_fail` | 5 | yes | yes |

`captureId` is present on every single pipeline log event.

## Question 1: Is handler-level logging of keyName/authMethod sufficient?

Yes, for the overwhelming majority of operational queries.

The diagnostic questions that operators actually ask are:

1. "Which API key is generating the most failures?" -- answered by joining on `captureId`: find `capture.fail` events, pivot to `captureId`, then look up the `capture.kv_create_fail` or `security.*` events that precede them. Both events carry `keyName`. This is a two-query join, not a single-query lookup.

2. "Did a specific key's captures succeed today?" -- same join pattern. Filter `capture.success` by `tenantId`, then correlate back to the handler events to get `keyName`.

3. "Which auth method is being used on a failing capture?" -- same join.

The handler emits `capture.kv_create_fail` with `captureId` + `keyName` + `authMethod` before calling `performCapture`. That event is the explicit bridge record between the auth context and the capture pipeline. It exists specifically for correlation.

The only scenario where handler-level logging is NOT sufficient: when the operator wants to filter pipeline events in a single query pass without a join. For example, a Coralogix DataPrime query like:

```
filter $l.event == 'capture.fail' && $l.keyName == 'prod-key-1'
```

That query cannot work without `keyName` on the pipeline event. With captureId-based correlation, the operator needs two queries or a join -- feasible in Coralogix but adds friction.

Verdict: Handler-level logging is operationally sufficient. The gap is query ergonomics, not information availability.

## Question 2: Does captureId-based correlation replace direct field presence?

Yes, with one important precondition: the handler must emit a log event that binds `captureId` + `keyName` + `authMethod` before `ctx.waitUntil` is called.

Looking at the current code, that precondition is currently only met on the ERROR path (`capture.kv_create_fail`). On the SUCCESS path -- when `createCapture` succeeds -- the handler emits NO log event that ties `captureId` to `keyName`.

That is the actual gap. The correlation bridge is missing on the happy path.

With a `capture.request` (or `capture.queued`) log event emitted on the success path before `ctx.waitUntil`, the join becomes:

```
capture.request { captureId, keyName, authMethod, tenantId, url }
    |
    +--> captureId links to all pipeline events
         capture.start, capture.success/fail, etc.
```

This is textbook captureId-based correlation and is exactly how distributed tracing handles context propagation across async boundaries -- the "parent span" carries the context at dispatch time; child spans carry only the span/trace ID.

## Question 3: What is the observability cost of NOT having keyName on pipeline events?

**Low, given the missing bridge log is added at the handler level.**

Without that bridge log, the cost is:
- Moderate: operators cannot correlate pipeline failures to API keys without external state (KV lookup by captureId), which may not be viable in a log query interface.

With the bridge log added (the real fix):
- Low: operators need a two-step query (find captureId, look up bridge event) but all data is present in logs. This is standard practice for async pipeline observability.

The cost of threading `keyName`/`authMethod` through `performCapture` would be:
- Signature change to `performCapture` -- explicitly unwanted per the task constraint
- Conceptual coupling: `performCapture` is a pure execution pipeline; it does not need to know which key authorized the request. That context belongs at the dispatch boundary.
- Redundancy: `tenantId` already provides the auth boundary for per-tenant queries. `keyName` is a finer-grained attribution field useful for billing/audit, not for pipeline diagnostics.

## Recommendation

Do NOT thread `keyName`/`authMethod` into `performCapture`. The user's instinct is correct.

Instead, add a single log event in `handleCreateCapture` on the success path, emitted after `createCapture` succeeds and before `ctx.waitUntil`:

```js
ctx.waitUntil(log(env, 6, 'capture', {
  event: 'capture.queued',
  captureId,
  tenantId,
  keyName,
  authMethod,
  cip,
}) ?? Promise.resolve());

ctx.waitUntil(performCapture(env, result.url, result.ip, captureId, tenantId, cip));
```

Or collapse into the existing flow with a single `waitUntil` that runs both:

```js
ctx.waitUntil((async () => {
  await (log(env, 6, 'capture', {
    event: 'capture.queued',
    captureId,
    tenantId,
    keyName,
    authMethod,
    cip,
  }) ?? Promise.resolve());
  return performCapture(env, result.url, result.ip, captureId, tenantId, cip);
})());
```

This establishes the `captureId -> keyName` binding at dispatch time in the log stream, making all downstream pipeline events queryable by key through a single join on `captureId`.

### Summary of changes needed

| Change | File | Required |
|---|---|---|
| Add `capture.queued` log event with `captureId`, `keyName`, `authMethod` | `index.js` | Yes -- closes the correlation gap on the happy path |
| Thread `keyName`/`authMethod` into `performCapture` | `capture.js` | No |

The existing `capture.kv_create_fail` event already carries the correlation fields on the error path. The only missing record is the happy-path dispatch event.
