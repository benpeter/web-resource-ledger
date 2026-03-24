# API Design: Health Endpoint Build Metadata

## Response Shape: Nested `build` Object

**Recommendation: nest new fields under a `build` object.**

```json
{
  "status": "ok",
  "legal": {
    "terms": "https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md",
    "policy": "https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md"
  },
  "build": {
    "commit": "43f8b68",
    "version": "0.1.0",
    "env": "production",
    "deployedAt": "2026-03-24T12:34:56Z"
  }
}
```

**Rationale (top-level vs nested):**

Top-level fields (`commit`, `version`, `env`, `deployedAt`) were considered but rejected for three reasons:

1. **Semantic grouping.** The current response has two concerns: operational status (`status`) and legal compliance (`legal`). Build identity is a third, distinct concern. Grouping it under `build` makes the response self-documenting -- consumers can ignore the entire object if they don't care about deploy metadata, or pass it as a unit to logging/dashboards.

2. **Future extensibility without field proliferation.** If additional build metadata is added later (e.g., `wranglerVersion`, `compatibilityDate`, `region`), they go inside `build` without polluting the top level. Top-level sprawl is easy to start and painful to undo.

3. **SDK ergonomics.** A `build` object maps cleanly to a typed struct/interface in generated SDKs (`HealthResponse.build.commit`). Four loose top-level fields create noise in the type definition and risk name collisions with future fields (`env` is especially collision-prone).

**Field names within `build`:**

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `commit` | `string` | `"43f8b68"` | Short SHA (7 chars). Enough for CI matching, avoids 40-char noise. |
| `version` | `string` | `"0.1.0"` | From `package.json`. Semver string. |
| `env` | `string` enum | `"production"` | One of `"production"`, `"staging"`, `"development"`. |
| `deployedAt` | `string` (date-time) | `"2026-03-24T12:34:56Z"` | ISO 8601 UTC. When the CI deploy ran, not when the Worker started. |

**Why `env` not `environment`:** Brevity. This is a single enum field read by machines (CI scripts, monitoring). The full word adds no clarity. Stripe, GitHub, and Vercel all use `env` or `environment` -- either works, but since `env` matches the Cloudflare Workers convention (`env` parameter name), it's the natural choice here.

**Why short SHA:** CI deploy verification needs to match `git rev-parse --short HEAD` output. The full 40-char SHA is available from `git log` if anyone needs it; the health endpoint is for quick "did the right commit deploy?" checks.

## Backward Compatibility Analysis

**Adding `build` is NOT a breaking change.** Here's the evidence:

1. **OpenAPI schema allows it.** The current schema at lines 1638-1653 of `openapi.yaml` defines `required: [status, legal]` and `properties: {status, legal}` but does NOT set `additionalProperties: false`. Per the OpenAPI 3.1 spec (which inherits JSON Schema 2020-12 semantics), omitting `additionalProperties` means extra properties are allowed by default. Adding `build` is a conforming additive change.

2. **Existing consumers are safe.** I checked the two known consumers:
   - **`test/health.test.js`** (lines 10-13): Uses `toMatchObject({ status: 'ok' })` and then checks `body.legal` properties individually. `toMatchObject` is a subset matcher -- extra keys are ignored.
   - **`scripts/smoke-test.sh`** (line 55): Uses `jq -e '.status == "ok"'`. jq ignores extra fields.

   Neither consumer will break from the addition.

3. **General principle for health endpoints.** Health endpoints are operational plumbing, not data contracts. Consumers should check `status === "ok"` and treat the rest as informational. Adding metadata fields is expected behavior -- this is how Kubernetes liveness/readiness probes, AWS ELB health checks, and every monitoring tool works. No responsible client `JSON.parse`s a health response with strict schema validation.

4. **No `required` change needed.** The `build` object should NOT be added to the `required` array. When build metadata is unavailable (local development without CI injection), the handler should still return a valid response. Making `build` optional means the response degrades gracefully:
   - CI deploy: full `build` object present
   - Local `wrangler dev`: `build` absent (or present with `"commit": "dev"` -- see injection section)

## Cache-Control Header

**Recommendation: set `Cache-Control: no-store` inside `handleHealth()`, not in `jsonResponse`.**

```js
function handleHealth(_request, env) {
  return jsonResponse({
    status: 'ok',
    legal: { ... },
    build: { ... },
  }, 200, { 'Cache-Control': 'no-store' });
}
```

**Rationale:**

1. **`jsonResponse` is a shared utility.** It is used by 15+ handlers across `index.js`, `account.js`, `billing.js`, `admin.js`, etc. Many of those set their own `Cache-Control` (e.g., `public, max-age=3600` for signing keys, `public, max-age=31536000, immutable` for artifacts). Adding a default `Cache-Control` to `jsonResponse` would either conflict with these explicit headers or require a "set if not already present" check that complicates the helper.

2. **Health already needs it for correctness.** The health endpoint now returns deploy-specific data (commit SHA, deploy timestamp). Caching this response means CI verification scripts could see stale build metadata from a CDN edge after deploy. `no-store` ensures every request hits the Worker.

3. **Consistency with existing patterns.** The codebase already follows the pattern of setting `Cache-Control` per-handler via the `headers` parameter of `jsonResponse` (e.g., line 1401, 1505, 1560). This is the established convention.

4. **Why `no-store` not `no-cache`.** `no-store` tells intermediaries not to persist the response at all. `no-cache` allows storage but requires revalidation. For a health endpoint with build metadata that CI scripts poll immediately after deploy, `no-store` is correct -- we don't want any layer keeping old build info.

## OpenAPI Spec Update

The `/health` response schema needs the `build` property added. Key decisions:

**1. `build` is optional (not in `required` array):**

```yaml
schema:
  type: object
  required: [status, legal]
  properties:
    status:
      type: string
      const: ok
    legal:
      # ... unchanged
    build:
      type: object
      description: Build identity metadata. Present when deployed via CI.
      required: [commit, version, env, deployedAt]
      properties:
        commit:
          type: string
          description: Short git commit SHA of the deployed code.
          pattern: '^[a-f0-9]{7,40}$'
          example: '43f8b68'
        version:
          type: string
          description: Semantic version from package.json.
          pattern: '^\d+\.\d+\.\d+'
          example: '0.1.0'
        env:
          type: string
          description: Deployment environment.
          enum: [production, staging, development]
        deployedAt:
          type: string
          format: date-time
          description: ISO 8601 UTC timestamp of when the deploy occurred.
```

**2. Why `build` is optional but its children are required:** If `build` is present at all, all four fields must exist. This avoids partial build objects that CI scripts can't rely on. But `build` itself is optional because local dev won't have CI-injected values.

**3. Add `Cache-Control` header to the spec:**

```yaml
headers:
  Cache-Control:
    schema:
      type: string
      const: 'no-store'
```

**4. Update the example:**

Add a second example showing the response with build metadata alongside the existing `healthy` example.

**5. `operationId` stays `getHealth`.** No change needed -- the operation hasn't changed, just the response shape.

## Build Metadata Injection Mechanism

This is at the boundary of API design and infrastructure, but the API contract depends on it, so I'll address the pattern.

**Recommendation: use wrangler `--define` flags in CI, not `[vars]`.**

`[vars]` are environment variables read at runtime via `env.VAR_NAME`. They're declared in `wrangler.toml` and can't vary per deploy (they're checked into the repo). Build metadata by definition changes every deploy.

`--define` performs compile-time string replacement, similar to C preprocessor `#define` or webpack's `DefinePlugin`. The CI workflow passes `--define` flags to `wrangler deploy`:

```yaml
# In deploy workflow
- uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    command: deploy --define __BUILD_COMMIT__:'"${{ github.sha }}"' --define __BUILD_VERSION__:'"${{ steps.version.outputs.version }}"' --define __BUILD_ENV__:'"production"' --define __BUILD_DEPLOYED_AT__:'"${{ steps.timestamp.outputs.value }}"'
```

Note: the `cloudflare/wrangler-action` `command` parameter overrides the default `deploy` command entirely. The exact syntax will need verification against the action's current API, but the principle is: inject values at build time, not runtime.

**In the handler:**

```js
/* global __BUILD_COMMIT__, __BUILD_VERSION__, __BUILD_ENV__, __BUILD_DEPLOYED_AT__ */

function handleHealth(_request, env) {
  const body = {
    status: 'ok',
    legal: {
      terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
      policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
    },
  };

  if (typeof __BUILD_COMMIT__ !== 'undefined') {
    body.build = {
      commit: __BUILD_COMMIT__,
      version: __BUILD_VERSION__,
      env: __BUILD_ENV__,
      deployedAt: __BUILD_DEPLOYED_AT__,
    };
  }

  return jsonResponse(body, 200, { 'Cache-Control': 'no-store' });
}
```

The `typeof` check means local `wrangler dev` (where no `--define` flags are passed) still returns a valid health response without `build`. This matches the OpenAPI contract where `build` is optional.

**Alternative considered: `wrangler.toml` `[define]` block.** This would work for `version` but not for `commit` or `deployedAt`, which change every deploy. A `[define]` block is checked into the repo and requires a git commit to update -- circular for commit SHA.

**Alternative considered: runtime env vars.** Setting `COMMIT_SHA` etc. as `[vars]` in wrangler.toml, overridden at deploy time via `wrangler deploy --var COMMIT_SHA:abc123`. This works but `--var` is less well-documented than `--define`, and runtime vars are accessible to all code (not just the health handler), which leaks build concerns into the runtime environment. `--define` is compile-time, scoped, and idiomatic for constants.

## Smoke Test Integration

The existing smoke test (`scripts/smoke-test.sh`) should be extended to verify build metadata after deploy. This is a CI concern, not an API design concern, but I'm noting it because the API contract enables it:

```bash
# After health check passes, verify build matches deployed commit
if [ -n "${EXPECTED_COMMIT:-}" ]; then
  DEPLOYED_COMMIT=$(echo "$HEALTH_BODY" | jq -r '.build.commit // empty')
  if [ "$DEPLOYED_COMMIT" = "$EXPECTED_COMMIT" ]; then
    pass "Deployed commit matches expected ($EXPECTED_COMMIT)"
  else
    fail "Deployed commit '$DEPLOYED_COMMIT' != expected '$EXPECTED_COMMIT'"
  fi
fi
```

The `EXPECTED_COMMIT` env var would be set by the CI workflow. When not set (manual runs), the check is skipped gracefully.

## Summary of Decisions

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Response shape | Nested under `build` | Semantic grouping, extensibility, SDK ergonomics |
| `build` required? | No (optional at top level) | Graceful degradation for local dev |
| `build` children required? | Yes (when `build` is present) | CI scripts need all-or-nothing |
| Cache-Control placement | Per-handler in `handleHealth()` | Matches existing codebase pattern, doesn't affect other handlers |
| Cache-Control value | `no-store` | Build metadata must not be cached by any layer |
| Injection mechanism | `wrangler --define` at deploy time | Per-deploy values can't live in checked-in config |
| Breaking change? | No | Additive field, no `additionalProperties: false`, existing consumers unaffected |
