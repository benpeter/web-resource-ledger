## Domain Plan Contribution: observability-minion

### Recommendations

#### 1. tenantId placement: top-level field in the Coralogix log data payload

tenantId should be a **top-level field inside the `data` object** (the object passed to `log()` that gets `JSON.stringify`'d into `text`). Not nested further.

**Rationale**: The current log structure sends everything inside `data` as the `text` field. Coralogix parses `text` as JSON and makes all top-level keys available as filter dimensions. Placing `tenantId` at the top level of `data` means it becomes directly filterable and groupable in Coralogix without needing parsing rules or nested JSON extraction. This keeps the Coralogix Streama pipeline zero-config.

Concretely, a log call changes from:

```js
log(env, 5, 'security', { event: 'security.auth_fail', status: 401 })
```

to:

```js
log(env, 5, 'security', { event: 'security.auth_fail', status: 401, tenantId: 'default' })
```

**Do NOT add tenantId to the outer Coralogix envelope** (alongside `applicationName`, `subsystemName`, `severity`). Those fields are part of the Coralogix ingestion schema and have fixed semantics. Custom dimensions belong in `text`.

**Do NOT use `subsystemName` to encode tenantId**. The subsystem field (`'capture'`, `'security'`) has a different purpose (module/domain partitioning) and should not be overloaded.

#### 2. Existing log entries that should gain tenantId

Every log call that fires **after** authentication succeeds should include `tenantId`. Log calls that fire **before or instead of** authentication (auth_fail itself, rate limiting of unauthenticated endpoints) should NOT include tenantId because there is no authenticated identity to attribute.

**Currently in index.js -- post-auth log calls (should gain tenantId):**

- `security.ssrf_block` (line 115) -- fires after auth succeeds at line 70-74. Add tenantId.
- The log calls inside `performCapture()` are reached only after auth succeeds, so all capture pipeline logs should gain tenantId:
  - `capture.stage.fail` (capture.js line 103)
  - `capture.header_fail` (capture.js line 111)
  - `capture.wacz_fail` (capture.js line 159)
  - `capture.success` (capture.js line 163)
  - `capture.fail` (capture.js line 172)
  - `capture.kv_fail` (capture.js line 176)

**Currently in index.js -- pre-auth or unauthenticated log calls (should NOT gain tenantId):**

- `security.auth_fail` (line 72) -- fires because auth failed; no identity available.
- `security.rate_limit` for `capture_per_ip` (line 82) -- fires before auth check.
- `security.capacity_limit` (line 92) -- fires before auth check.
- `security.rate_limit` for `verify` (line 257) -- unauthenticated endpoint.
- `security.rate_limit` for `signing_key` (line 335) -- unauthenticated endpoint.

**Implementation approach**: Thread tenantId from `auth.tenantId` through to `performCapture()` as an additional parameter. The function signature becomes `performCapture(env, url, ip, captureId, tenantId, renderer)`. Each log call in the pipeline adds `tenantId` to its data object. This is explicit, grep-able, and avoids hidden context objects.

#### 3. Log events for the new `GET /v1/captures` list endpoint

The list endpoint is authenticated and reads from KV. It should emit these log events:

**Required:**

| Event | Severity | Subsystem | When | Fields |
|-------|----------|-----------|------|--------|
| `list.success` | 3 (info) | `capture` | Successful response | `tenantId`, `resultCount`, `cursor` (present/absent), `durationMs` |
| `list.error` | 5 (error) | `capture` | KV read failure or unexpected error | `tenantId`, `errorClass` |

**Not recommended:**

- **Per-request access logging**: Do not add a generic "request received" log for every list call. Cloudflare Workers already emit request-level logs in the Workers dashboard. Adding a separate access log doubles the volume for a read-only endpoint with no side effects, and at scale this becomes a cost concern. The `list.success` event with `durationMs` covers the legitimate observability need.
- **Pagination metrics as a separate log event**: Do not emit a separate "pagination" event. The `cursor` field in `list.success` (present when there is a next page, absent when the result set is complete) tells you everything you need about pagination behavior. You can query Coralogix for `cursor:*` to find paginated responses and correlate with `resultCount` to understand page sizes.
- **Auth failure logging for the list endpoint**: The auth check will reuse the same `verifyApiKey()` call and the existing `security.auth_fail` log. No new log event needed.

#### 4. Latency logging for the list endpoint

**Yes, the list endpoint should log request latency.** This is the single most important observability signal for a <300ms SLO.

**Implementation**: Capture `Date.now()` at the start of the handler. Include `durationMs: Date.now() - start` in the `list.success` log event. This gives you:

- The ability to query p50/p95/p99 latency in Coralogix using `avg(durationMs)` and percentile functions.
- Alerting on SLO violations: a Coralogix alert on `event:list.success AND durationMs:>300` catches SLO breaches.
- Trend analysis: latency drift over time as data volume grows.

**Do NOT use a separate latency-only log event.** Embedding `durationMs` in the success event keeps the log volume at exactly one event per request, which is the right cost/signal tradeoff.

**Future consideration**: If list traffic grows to the point where per-request logging is expensive, consider a Prometheus-style histogram counter instead. But for launch, per-request logging is correct -- you need the raw data to establish baselines before you can design aggregations.

### Proposed Tasks

1. **Modify `verifyApiKey()` return shape** (auth.js line 80): Change `return { ok: true }` to `return { ok: true, tenantId: 'default' }`. This is the R8 issue scope.

2. **Thread tenantId through handleCreateCapture** (index.js): After auth succeeds, extract `auth.tenantId`. Pass it to `performCapture()` and include it in the `security.ssrf_block` log call.

3. **Update performCapture() signature** (capture.js): Add `tenantId` parameter. Add `tenantId` to all six log calls in the capture pipeline.

4. **Thread tenantId into KV records** (kv.js): Add `tenantId` to the pending record written by `createCapture()`. This persists the tenant association with the capture data, which the list endpoint will need for tenant-scoped queries.

5. **List endpoint handler with observability** (index.js): New `handleListCaptures()` with:
   - Auth check (reuse verifyApiKey)
   - `const start = Date.now()` at handler entry
   - KV list operation
   - `list.success` log event with `tenantId`, `resultCount`, `cursor`, `durationMs`
   - `list.error` log event on KV failure with `tenantId`, `errorClass`

6. **No changes to log.js**: The `log()` function signature and behavior stay the same. tenantId is just another field in the `data` object -- no schema changes needed at the transport layer. This is a deliberate strength of the current design.

### Risks and Concerns

**Risk: tenantId missing from capture pipeline logs due to threading error.** If `tenantId` is not correctly passed to `performCapture()`, all capture pipeline logs will silently lack the field. Coralogix will not error -- it will just have logs without `tenantId`. This is hard to catch without explicit testing.

*Mitigation*: Add a unit test that asserts `tenantId` appears in the `data` object of every log call made during a successful capture. The existing test/capture.test.js test structure with injectable renderers makes this straightforward.

**Risk: KV list operation latency for the 300ms SLO.** Cloudflare KV list operations are eventually consistent and have variable latency depending on the number of keys and the prefix scan range. If the number of captures grows large, a naive `kv.list({ prefix: 'capture:' })` could exceed 300ms.

*Mitigation*: The `durationMs` field in `list.success` logs will surface this immediately. Set up a Coralogix alert on `event:list.success AND durationMs:>300` from day one. If KV list latency becomes a concern, consider a secondary index key that stores a tenant's capture list as a single KV value.

**Risk: Log volume from the list endpoint.** If the list endpoint is polled frequently (e.g., a UI refreshing every few seconds), the `list.success` log event fires on every request. At 1 event per request this is reasonable, but at high poll rates it could become a cost concern.

*Mitigation*: The `list.success` event is severity 3 (info). If volume becomes a problem, it can be deprioritized in the Coralogix TCO Optimizer without losing the ability to rehydrate it on demand. Do not pre-optimize by sampling or dropping -- you need the baseline data first.

**Risk: Existing captures in KV have no tenantId field.** After deploying R8, all existing KV records will lack `tenantId`. The list endpoint must handle records where `tenantId` is undefined.

*Mitigation*: Treat records with no `tenantId` as belonging to `'default'` tenant. This is backward-compatible and matches the hardcoded `'default'` value from R8.

### Additional Agents Needed

None required for the observability concerns. The implementation tasks are straightforward additions to existing patterns. The observability design does not introduce new infrastructure, new dependencies, or new deployment requirements. All changes are code-level modifications to existing files.
