## Security Review: Usage Metering Delegation Plan (Revision Round 1 of 2)

**Verdict: ADVISE**

Overall risk level: LOW. The 404-for-nonexistent-tenants fix from round 0 is
correctly incorporated at the intent level -- in the handler, OpenAPI spec,
and integration tests. However, the implementation mechanism chosen for the
tenant existence check (reusing `getTenantConfig`) will silently produce the
wrong result for any tenant that exists but has a null `config` column. That
is the one required fix. A secondary finding covers an audit log gap on the
404 path.

---

### Findings

---

#### HIGH: getTenantConfig Cannot Reliably Gate the 404

**Location**: Task 3, `handleAdminGetUsage` tenant existence block; also the
prior round's `TASK` recommendation, which prescribed this exact function

**Description**: The revised plan (and my own prior advisory) prescribed:

```js
const tenant = await getTenantConfig(env.DB, tenantId);
if (!tenant) {
  return problemResponse(404, `Tenant '${tenantId}' not found`);
}
```

Reading `src/db.js` lines 247-254 directly:

```js
export async function getTenantConfig(db, tenantId) {
  const row = await db.prepare(
    'SELECT config FROM tenants WHERE id = ?'
  ).bind(tenantId).first();
  if (!row || row.config == null) return null;
  return JSON.parse(row.config);
}
```

This returns `null` in two distinct cases:
1. No row in `tenants` for this `tenantId` -- correct trigger for 404
2. Row exists but `config` column is NULL -- this is a legitimate tenant with
   no custom config set; should return 200 with zeroed counters

The `tenants` schema (migration 0001) declares `config TEXT` as nullable with
no default. Every tenant created via the `api_keys` FK path (or via
`seedUsageCounter`'s `INSERT OR IGNORE INTO tenants`) will have `config = NULL`
unless `setTenantConfig` was subsequently called. These are real tenants.

Using `getTenantConfig` as an existence check will return 404 for every tenant
whose config has not been explicitly set -- which is likely the majority of
tenants in early operation.

**Impact**: The 404-for-nonexistent-tenants behavior that was the purpose of
the round 0 advisory will be unreliable. Any real tenant with a null config
gets a 404 instead of 200 with zeroed/actual counters. This breaks the
critical invariant: "existing tenant with no activity = 200 with zeros."

**Remediation**: Replace the `getTenantConfig` existence check with a direct
row presence query:

```js
const tenantRow = await env.DB.prepare(
  'SELECT 1 FROM tenants WHERE id = ?'
).bind(tenantId).first();
if (!tenantRow) {
  return problemResponse(404, `Tenant '${tenantId}' not found`);
}
```

This checks whether a row exists in `tenants` without caring about the config
column. No new db.js function is needed. Remove `getTenantConfig` from the
import list in `src/admin.js` unless it was already imported for another
reason (it is not currently in the admin.js imports shown in the codebase).

The import line in Task 3 should be:

```js
import { createApiKeyRecord, getApiKeyRecord, listApiKeyRecords,
  revokeApiKeyRecord, TENANT_ID_RE, getUsage, computePeriod } from './db.js';
```

No `getTenantConfig` needed.

---

#### LOW: 404 Path Produces No Audit Log Event

**Location**: Task 3, `handleAdminGetUsage`

**Description**: The handler in the plan emits `admin.usage_query` only on
the 200 success path. If the tenant existence check returns 404, no event
is logged. An operator (or a compromised admin key) enumerating tenant IDs
via the 404/200 distinction would leave no trace in Coralogix.

With the current single shared ADMIN_KEY model this is a secondary concern,
but it is inconsistent with how other admin handlers log all responses.

**Remediation**: Add the log call on the 404 path:

```js
if (!tenantRow) {
  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.usage_query',
    tenantId,
    period: period ?? computePeriod(),
    authMethod: 'admin_key',
    responseStatus: 404,
    cip,
  }) ?? Promise.resolve());
  return problemResponse(404, `Tenant '${tenantId}' not found`);
}
```

Severity 3 (info) -- a 404 here is almost certainly a typo, not an attack.

---

#### INFORMATIONAL: Round 0 err.message Truncation Note Still Valid

The prior advisory note about `String(err?.message ?? '').slice(0, 256)` in
catch handlers remains no-action. The bound parameters in `incrementUsage`
are `tenantId` (validated against TENANT_ID_RE) and integer counters -- no
PII or secrets can echo back through D1 error messages on this path. No
change required.

---

### Verification of Round 0 Advisory

The round 0 ADVISE raised two items:

**Item 1 (404 for nonexistent tenants)**: Intent incorporated correctly.
The handler has the existence check, the OpenAPI spec documents 404, the
integration tests include an explicit test case for it. The mechanism
(`getTenantConfig`) is what fails -- see HIGH finding above.

**Item 2 (err.message in catch handlers)**: Correctly not acted upon;
the note in the plan confirms this is informational only.

---

### Required Changes Before Execution

1. **Task 3** (api-design-minion): Replace the `getTenantConfig`-based
   existence check with the direct `SELECT 1 FROM tenants WHERE id = ?`
   query shown above. Remove `getTenantConfig` from the admin.js import for
   this handler. This is the only blocking change.

2. **Task 3** (api-design-minion, optional but recommended): Add the
   `admin.usage_query` log event on the 404 path.

3. **Task 5** (test-minion): The existing "returns 200 with zeroed counters
   for existing tenant with no usage" test should seed the tenant with a
   null config (via the `INSERT OR IGNORE INTO tenants` path in
   `seedUsageCounter`, not via `setTenantConfig`). This exercises the case
   that would have broken under the getTenantConfig approach and confirms
   the fix is correct.
