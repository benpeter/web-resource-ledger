# Margo Review -- Per-Tenant API Keys and Tenant Isolation

## Verdict: ADVISE

The plan is well-scoped for a feature of this significance. The six conflict
resolutions are all YAGNI-aligned (deferred test prefix, dropped name
uniqueness enforcement, stored-as-requested scopes). The task decomposition
matches the actual requirements from the prompt. The codebase is small (~300
lines auth + kv + index) and the plan is proportional to it.

Three advisory items follow. None are blocking.

---

### Advisory 1: Pagination on admin key list is premature

- **SCOPE**: Task 3, `handleAdminListKeys` in `src/admin.js` -- the `limit`,
  `cursor`, and pagination response envelope for GET /v1/admin/keys.
- **CHANGE**: Drop cursor-based pagination from the admin key list endpoint.
  Return the full array in `{ data: [...] }` with no pagination envelope.
  Keep the `?tenant` and `?include=revoked` filters. If the result set ever
  grows large enough to warrant pagination, add it then.
- **WHY**: The prompt says key count is "single-digit to low double-digit."
  The KV CRUD layer (Task 2, `listApiKeyRecords`) already fetches all keys
  via `kv.list({ prefix: 'apikey:' })` and filters in memory. Adding
  cursor/limit/pagination on top of an in-memory list is theater -- the entire
  dataset is already in memory before pagination is applied. This adds request
  parsing, validation, response shaping, OpenAPI schema (`Pagination`), and
  test surface for a feature that will never activate at these volumes.
  Estimated savings: ~30 lines of handler code, 2 OpenAPI schemas, 2-3 tests.
- **TASK**: edge-minion (Task 3 prompt adjustment), software-docs-minion
  (Task 5 OpenAPI simplification), test-minion (Task 4 fewer pagination tests).

---

### Advisory 2: Log enrichment in capture.js is scope creep

- **SCOPE**: Task 3 prompt, section "Log enrichment for existing events" --
  specifically the requirement to "Pass `keyName` and `authMethod` through to
  `performCapture()` in `src/capture.js` (add parameters)" and "Update all
  capture pipeline log events in `src/capture.js` to include `keyName`."
- **CHANGE**: Log `keyName` and `authMethod` in the handler (`src/index.js`)
  at the point where auth succeeds, not inside `performCapture`. The
  capture pipeline does not need to know about auth details -- it captures
  web pages. Threading auth fields through function signatures that have
  nothing to do with authentication couples unrelated concerns. The auth
  success is already logged before `performCapture` is called; enriching
  that single log event with `keyName`/`authMethod` is sufficient.
- **WHY**: `performCapture` currently takes `(env, url, ip, captureId,
  tenantId, cip)`. Adding `keyName` and `authMethod` expands the signature
  for a concern that belongs to the request layer, not the capture layer.
  Every future change to auth metadata would require signature changes in
  capture.js. Keep the boundary clean: auth concerns stay in the handler,
  capture concerns stay in the capture pipeline. The `tenantId` parameter
  is justified because capture records are keyed by tenant -- `keyName` is
  not.
- **TASK**: edge-minion (Task 3 prompt adjustment -- remove capture.js log
  enrichment, keep index.js enrichment).

---

### Advisory 3: OpenAPI version bump to 0.5.0 may be premature -- verify

- **SCOPE**: Task 5, OpenAPI spec version bump from 0.4.0 to 0.5.0.
- **CHANGE**: Confirm the current version in `openapi.yaml` before specifying
  the target version. If the current version is already past 0.4.0 (due to
  phases between the original planning and execution), adjust accordingly.
  This is a minor point but avoids a confusing version regression or skip.
- **WHY**: The plan hardcodes "0.4.0 -> 0.5.0" but the codebase has had
  multiple phases since the backlog was created. A stale version reference in
  the prompt could cause the docs minion to write incorrect metadata.
- **TASK**: software-docs-minion (Task 5 -- read current version, bump by one
  minor).

---

### What the plan gets right

1. **YAGNI discipline is strong.** Six conflicts resolved, five in the
   simpler direction. `wrl_test_` prefix deferred. Name uniqueness dropped.
   No KV caching. No secondary index for keys. No KV-stored admin keys. No
   audit logging (R13 scope). No CLI tooling. This is well-scoped.

2. **Dual-mode fallback is the right migration strategy.** Zero breaking
   change to existing clients. Legacy key works until explicitly removed.
   The three-phase runbook in OPERATIONS.md gives operators a safe path.

3. **Complexity budget is proportional.** One new file (`src/admin.js`),
   four new KV functions, one auth rewrite. For a feature that introduces
   multi-tenancy, this is lean. No new frameworks, no new dependencies, no
   new services.

4. **Single approval gate on the auth module is correctly placed.** The auth
   module is the trust boundary and all downstream tasks depend on its
   contract. Gating here catches design issues before they cascade.

5. **Conflict 4 (gating condition) handled correctly.** Planning proceeds
   but execution is gated on user confirmation. This avoids wasted work
   without blocking planning.
