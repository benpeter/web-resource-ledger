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

**Revisited post-implementation** (nefario orchestration, 2026-03-17). The question was whether operators need `keyName` on every `capture.start`/`capture.success`/`capture.fail` event, or whether handler-level logging is sufficient.

Three options evaluated:
- **Thread keyName through performCapture()**: Adds 2 parameters (keyName, authMethod) to a 7-parameter function, both used only for log decoration. Couples auth context to a browser orchestration function that doesn't act on auth data. Rejected: wrong layer of ownership.
- **Log only at handler level, correlate via captureId**: All pipeline events carry `captureId`. A handler-level `capture.queued` event ties `captureId` to `keyName`. Operators join on `captureId` in Coralogix. One extra query step vs. direct filter. Chosen.
- **Structured logging context (e.g., AsyncLocalStorage)**: Would propagate context without signature changes, but Cloudflare Workers don't support AsyncLocalStorage. Not available.

Both observability-minion and margo independently recommended the handler-level approach. Observability-minion identified one gap: the success path had no bridge log event tying `captureId` to `keyName`. A `capture.queued` event was added at the `ctx.waitUntil(performCapture(...))` call site to close this gap.

**Correlation model**: `handleCreateCapture` emits `capture.queued` with `{captureId, keyName, authMethod, tenantId, url, cip}`. All pipeline events carry `captureId` + `tenantId`. Coralogix query: `captureId:"abc" | event:"capture.queued"` gives the key. No pipeline code changes needed.

### 5. Supplement `status` field on auth failures, don't replace

Observability-minion's Phase 3.5 review caught that replacing the `status` field with `reason` on `security.auth_fail` events would break existing Coralogix queries. Changed to supplementing: both `status` (HTTP numeric) and `reason` (semantic string) are present.

### 6. Idempotent DELETE with `idempotent` flag

DELETE on an already-revoked key returns 200 (not 409). ux-strategy-minion argued the operator's intent is fulfilled either way. Observability-minion added: the `admin.key_revoke` log event includes `idempotent: true/false` so operators can distinguish first-time from repeat revocations during audit investigation.

### 7. No name uniqueness enforcement

ux-strategy-minion flagged that enforcing unique key names per tenant creates friction during key rotation (must revoke old key before reusing the name). Resolved: names are labels for human convenience, `keyHash` is the identifier. No uniqueness constraint for MVP.

### 8. Effective scopes returned as-requested, not expanded

api-design-minion and devx-minion disagreed on whether `POST /v1/admin/keys` with `scopes: ["capture"]` should return `scopes: ["capture"]` or `scopes: ["capture", "read"]`. Resolved: return as-requested. The `capture implies read` rule is enforced at runtime by `hasScope()`, not materialized in storage. This keeps the contract simple and avoids confusion about whether the operator requested `read` or it was implied.

### 9. Double KV read on revoke path (accepted)

`handleAdminRevokeKey` does three KV reads: (1) `getApiKeyRecord` pre-flight, (2) `listApiKeyRecords` for the last-admin-key guard, (3) `revokeApiKeyRecord` reads the same record again internally. The third read is redundant since the handler already confirmed the record exists and isn't revoked. Accepted because: the admin endpoint has a 5 req/60s rate limit, one extra KV read is negligible at that traffic. If revoke latency matters later, `revokeApiKeyRecord` could accept an optional pre-fetched record.

### 10. NAME_RE tightened from printable ASCII to safe subset

Changed `NAME_RE` from `^[\x20-\x7E]{1,128}$` (all printable ASCII) to `^[a-zA-Z0-9 _.:-]{1,128}$`. The original regex accepted `<`, `>`, `"`, `'`, `\`, `(`, `)` and other characters that are surprising in structured log queries (Coralogix) or when pasted into shell commands. Since names appear in JSON responses (safely serialized) and JSON logs (also safe), this wasn't a vulnerability -- but the broader set was unnecessary. The restricted set covers all practical key naming patterns (`prod-capture`, `staging:readonly`, `ben.peter-admin`). Security-minion confirmed `/` and `@` are not needed (`:` covers hierarchy, `tenantId` covers identity).

### 11. Legacy auth scope check added

`verifyApiKey()` checked `requiredScope` for KV keys but not for the legacy `CAPTURE_API_KEY` fallback path. If a future endpoint called `verifyApiKey(req, env, { requiredScope: 'admin' })`, the legacy key would have returned `ok: true` despite not having admin scope. Today this wasn't exploitable (admin endpoints use `verifyAdminKey()`), but it violated the function's JSDoc contract. Fixed: `hasScope(legacyScopes, requiredScope)` check before returning success. Uses a distinct `reason: 'legacy_scope_insufficient'` for observability but the same 403 message as KV keys (no auth-path differentiation in HTTP responses).
