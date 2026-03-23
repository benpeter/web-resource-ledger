## Security Review Verdict: ADVISE

---

- [security]: `handlePutTenantConfig` catch block does not remap new `quotas.*` validation errors, causing 500 responses instead of 400 for invalid quota overrides submitted through the admin API.
  SCOPE: `src/index.js` lines 1124-1129, `handlePutTenantConfig` error handler
  CHANGE: Extend the error remapping condition from `err.message.startsWith('rateLimit.')` to also cover `err.message.startsWith('quotas.')`. The current condition is `err.message.startsWith('rateLimit.') || err.message.startsWith('Invalid tenantId')`. After Task 1 adds quota validation in `setTenantConfig`, errors like `'quotas.capturesPerMonth must be a positive integer'` will not match either condition and will propagate as unhandled 500s. The fix is one line: add `|| err.message.startsWith('quotas.')` to the remapping predicate.
  WHY: Validation errors thrown in `setTenantConfig` for `quotas.capturesPerMonth` and `quotas.storageBytes` begin with the string `quotas.`, not `rateLimit.`. The existing catch block was written before quota validation existed and will silently convert client input errors into 500 responses for any admin operator sending malformed quota overrides. This produces misleading error responses and may hide misconfigurations.
  TASK: Task 1 (creates the validation) and Task 2 implicitly (uses `handlePutTenantConfig` to configure per-tenant overrides). The fix belongs in `handlePutTenantConfig` in `src/index.js` and should be done as part of Task 1 or at the Task 1 approval gate.

- [security]: No admin endpoint is planned for `setTenantTier`, leaving tier assignment exclusively to a D1 direct write or a future unplanned endpoint; the `setTenantTier` function built in Task 1 is unreachable through the API.
  SCOPE: `src/db.js` (`setTenantTier`), `src/index.js` (admin routes)
  CHANGE: Either (a) add a `PUT /v1/admin/tenants/:id/tier` route protected by `verifyAdminKey` that calls `setTenantTier`, or (b) extend `handlePutTenantConfig` to accept and apply a `tier` field using `setTenantTier` alongside the config update. Without this, the only way to promote a tenant to `pro` is raw D1 access, which bypasses all audit logging.
  WHY: `setTenantTier` validates the tier value and writes an `updated_by` audit field. If there is no admin-gated API route calling it, operators will resort to direct D1 mutations that skip both validation and the audit trail. This is a privilege escalation surface: a misconfigured direct write could set `tier` to an arbitrary string, which `getEffectiveQuota` falls back to `free` for (safe), but the data integrity is broken and the absence of an audit log entry means tier changes are invisible to security monitoring.
  TASK: Task 1 (creates `setTenantTier`). Recommend adding the admin route as part of Task 1 or opening a tracked backlog item before the phase closes.

- [security]: The `X-Quota-Remaining` header on every successful 202/207 response reveals exact remaining capacity to any party that can observe response headers, including browser extensions, proxies, and logging middleware.
  SCOPE: `src/index.js`, quota header construction in `handleCreateCapture` and `handleBatchCapture` (Task 2)
  CHANGE: This is low-severity because the information is scoped to authenticated tenants viewing their own quota. Accept as-is or limit headers to `X-Quota-Limit` and `X-Quota-Used` (omit `X-Quota-Remaining`, which can be computed client-side). If accepted, document explicitly in the OpenAPI spec (Task 5) that these headers are only present on authenticated capture responses.
  WHY: `X-Quota-Remaining` is derivable from `X-Quota-Limit - X-Quota-Used` but its presence as a distinct header adds no information the tenant doesn't already have. The risk is minimal since capture endpoints already require valid API key auth. Flagged for awareness; not blocking.
  TASK: Task 2, Task 5.

---

No blocking issues. The `handlePutTenantConfig` error mapping gap (first finding) is the only one likely to cause a concrete runtime defect. The missing tier management route is an operational security gap (audit trail) that should be resolved before the phase closes. The quota header finding is informational.
