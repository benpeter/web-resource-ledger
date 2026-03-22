## Task 3: Admin Usage Endpoint + OpenAPI Spec

You are adding an admin endpoint to query per-tenant usage counters for the
Web Resource Ledger (WRL). The DAL function `getUsage(db, tenantId, period)`
already exists in src/db.js.

### Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wise-wondering-lerdorf

### What to create/modify

**1. `src/admin.js` — Add handleAdminGetUsage handler**

Add a new exported async function at the end of admin.js:

```js
/**
 * GET /v1/admin/usage -- query per-tenant usage counters
 * Query params:
 *   tenant (required) -- tenant ID to query
 *   period (optional) -- billing period in YYYY-MM format (defaults to current)
 */
export async function handleAdminGetUsage(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const params = new URL(request.url).searchParams;
  const tenantParam = params.get('tenant');
  const periodParam = params.get('period');

  // Validate tenant (required)
  if (!tenantParam) {
    return problemResponse(400, "Query parameter 'tenant' is required");
  }
  if (!TENANT_ID_RE.test(tenantParam)) {
    return problemResponse(400, "Query parameter 'tenant' must match /^[a-z0-9_-]{1,64}$/");
  }

  // Validate period format (optional, defaults to current)
  let period;
  if (periodParam) {
    if (!/^\d{4}-\d{2}$/.test(periodParam)) {
      return problemResponse(400, "Query parameter 'period' must be in YYYY-MM format");
    }
    period = periodParam;
  } else {
    period = computePeriod();
  }

  // Verify tenant exists using direct DB query (NOT getTenantConfig)
  const tenantExists = await env.DB.prepare(
    'SELECT 1 FROM tenants WHERE id = ?'
  ).bind(tenantParam).first();

  if (!tenantExists) {
    ctx.waitUntil(log(env, 4, 'admin', {
      event: 'admin.usage_query_fail',
      tenantId: tenantParam,
      reason: 'tenant_not_found',
      authMethod: 'admin_key',
      responseStatus: 404,
      cip,
    }) ?? Promise.resolve());
    return problemResponse(404, `Tenant '${tenantParam}' not found`, ADMIN_CACHE);
  }

  const usage = await getUsage(env.DB, tenantParam, period);

  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.usage_query',
    tenantId: tenantParam,
    period,
    authMethod: 'admin_key',
    responseStatus: 200,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({
    tenantId: usage.tenantId,
    period: usage.period,
    captureCount: usage.captureCount,
    storageBytes: usage.storageBytes,
    apiCallCount: usage.apiCallCount,
    updatedAt: usage.updatedAt,
  }, 200, ADMIN_CACHE);
}
```

IMPORTANT: Use `SELECT 1 FROM tenants WHERE id = ?` for tenant existence check,
NOT `getTenantConfig()`. The getTenantConfig function returns null for both
nonexistent tenants and tenants with null config column, making it ambiguous.

Add the required imports at the top of admin.js:
- Add `getUsage, computePeriod` to the import from `'./db.js'`

**2. `src/index.js` — Wire the route**

Add the import:
```js
import { handleAdminCreateKey, handleAdminListKeys, handleAdminRevokeKey, handleAdminGetUsage } from './admin.js';
```

Add the route to the routes array (after the existing admin routes, before tenant config routes):
```js
['GET', /^\/v1\/admin\/usage$/, handleAdminGetUsage],
```

**3. `openapi.yaml` — Add the endpoint spec**

Add a new path entry for `/v1/admin/usage` after the existing `/v1/admin/keys/{keyHash}` section.
Follow the existing OpenAPI style in the file (indentation, structure, examples).

The endpoint spec should document:
- GET /v1/admin/usage
- operationId: adminGetUsage
- summary: Get tenant usage counters
- description with curl example
- tags: [admin]
- security: adminAuth
- parameters: tenant (required query string), period (optional query string, YYYY-MM)
- responses:
  - 200: UsageResponse schema with captureCount, storageBytes, apiCallCount, period, tenantId, updatedAt
  - 400: Bad Request (missing tenant, bad period format)
  - 401: Unauthorized
  - 404: Tenant not found
  - 429: Rate limited

Also add a UsageResponse component schema.

### Conventions
- Follow the existing admin.js patterns exactly (ADMIN_CACHE headers, cip computation, log patterns)
- problemResponse for errors, jsonResponse for success
- Validate inputs strictly (TENANT_ID_RE for tenant, regex for period)
- Log both success and failure events
- Never log raw keys or tokens
- Keep the OpenAPI spec consistent with existing style

### What NOT to do
- Do NOT modify db.js (getUsage already exists)
- Do NOT modify capture.js
- Do NOT add tests (that's Task 5)
- Do NOT touch any handler except the new one
