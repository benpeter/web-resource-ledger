# Decisions: Per-Tenant API Keys (Phase 0038)

Decisions captured during implementation. See the [nefario advisory report](../../history/nefario-reports/2026-03-17-020022-per-tenant-api-keys-isolation.md) for pre-implementation design decisions.

## Implementation Decisions

### 1. Misconfiguration guard: binding-presence, not KV content scan

The advisory specified a 503 when "no auth is configured." The initial synthesis had the auth module scanning KV for any `apikey:` records to determine if the system was configured. Security-minion's Phase 3.5 review caught this: the scan adds a KV read to every failed auth attempt and produces false 503s on a fresh deploy with empty KV (which is a valid state). Changed to `!env.KV && !env.CAPTURE_API_KEY` — a pure binding-presence check.

### 2. KV errors fail loudly, never fall through to legacy

The advisory didn't specify what happens when `env.KV.get()` throws (network error, timeout). Three options considered:
- Fall through to legacy (dangerous: masks infrastructure failures)
- Return 401 (misleading: suggests invalid key)
- Return 500 with `reason: 'kv_error'` (chosen: fail loudly per CLAUDE.md)

Observability-minion flagged this in Phase 3.5. Without it, a KV outage would silently degrade all tenants to the `default` tenant via legacy fallback — a security regression.

### 3. Drop pagination on admin key list

The synthesis included cursor-based pagination matching `GET /v1/captures`. Margo flagged this as YAGNI: at single-digit key counts, the full array is fetched into memory anyway before pagination is applied. Saves ~30 lines, 2 schemas, and several tests. Added as a parking lot item if key count exceeds 500.

### 4. Log enrichment in handler, not capture pipeline

The synthesis had `keyName`/`authMethod` threaded through `performCapture()`'s function signature. Margo flagged this as coupling auth concerns to the capture pipeline. Changed to logging auth details in `src/index.js` handlers where auth succeeds, keeping `src/capture.js` focused on capture logic.

### 5. Supplement `status` field on auth failures, don't replace

Observability-minion's Phase 3.5 review caught that replacing the `status` field with `reason` on `security.auth_fail` events would break existing Coralogix queries. Changed to supplementing: both `status` (HTTP numeric) and `reason` (semantic string) are present.

### 6. Idempotent DELETE with `idempotent` flag

DELETE on an already-revoked key returns 200 (not 409). ux-strategy-minion argued the operator's intent is fulfilled either way. Observability-minion added: the `admin.key_revoke` log event includes `idempotent: true/false` so operators can distinguish first-time from repeat revocations during audit investigation.

### 7. No name uniqueness enforcement

ux-strategy-minion flagged that enforcing unique key names per tenant creates friction during key rotation (must revoke old key before reusing the name). Resolved: names are labels for human convenience, `keyHash` is the identifier. No uniqueness constraint for MVP.

### 8. Effective scopes returned as-requested, not expanded

api-design-minion and devx-minion disagreed on whether `POST /v1/admin/keys` with `scopes: ["capture"]` should return `scopes: ["capture"]` or `scopes: ["capture", "read"]`. Resolved: return as-requested. The `capture implies read` rule is enforced at runtime by `hasScope()`, not materialized in storage. This keeps the contract simple and avoids confusion about whether the operator requested `read` or it was implied.
