# Security Review Verdict: sync-mcp-api-surface

**Verdict: ADVISE**

---

## Findings

### [security]: delete_schedule scope is too permissive
**SCOPE**: Task 1 (src/mcp.js), create_schedule and delete_schedule tool definitions
**CHANGE**: The plan marks `delete_schedule` with scope "read (implicit)". The HTTP handler (`handleDeleteSchedule`) requires `capture` scope. The existing `list_schedules` HTTP handler also requires `capture` scope — the plan's "read (implicit)" annotation is factually wrong for both of these.
**WHY**: If the MCP tool implements `delete_schedule` without a `capture` scope check (mirroring the "read implicit" annotation), a read-only API key can delete schedules — privilege escalation from read to write. This is an access control regression relative to the HTTP API. `list_schedules` via HTTP also requires `capture` scope, so the mcp-minion prompt's guidance to skip scope checks on list/delete is incorrect.
**TASK**: Task 1 (mcp-minion). In the implementation prompt, correct the scope table:
- `list_schedules` → requires `capture` scope (matches HTTP handler)
- `delete_schedule` → requires `capture` scope (matches HTTP handler)
- Explicitly add `hasScope(auth.scopes, 'capture')` checks to both tools, same pattern as `capture_url`.

---

### [security]: batch_capture MCP tool has a weaker rate-limit path than the HTTP handler
**SCOPE**: Task 1 (src/mcp.js), batch_capture tool
**CHANGE**: The HTTP `handleBatchCapture` calls `checkCaptureRateLimit(env, auth, clientIp, 'capture', body.urls.length)` — a multi-dimensional limiter (per-IP, per-tenant, global) that accounts for the full batch count. The existing `capture_url` MCP tool uses the simpler `env.CAPTURE_RATE_LIMITER` + KV counter path, which charges 1 unit regardless of batch size. The plan's batch_capture prompt says "Rate limit check per-tenant before enqueuing" without specifying whether it must charge N slots for N URLs or only 1.
**WHY**: If batch_capture charges 1 rate-limit slot for 20 URLs, an attacker gets 20× more queue throughput than the HTTP batch endpoint allows. The existing capture_url MCP tool has this property too (acknowledged as acceptable for single-URL capture), but batch multiplies the impact.
**TASK**: Task 1 (mcp-minion). Explicitly instruct: charge the rate-limit counter by `urls.length` (not 1), consistent with `handleBatchCapture`'s behavior. Specifically: the KV `rateLimitCounter` call should pass `urls.length` as the increment, and the CF CAPTURE_RATE_LIMITER should be called once per URL (or refused if the limiter would be exceeded for the batch count). Read how `checkCaptureRateLimit` accounts for batch size in `src/index.js` and replicate the logic.

---

### [security]: diff_captures has no tenant isolation check on base/target capture IDs
**SCOPE**: Task 1 (src/mcp.js), diff_captures tool
**CHANGE**: The plan says "Both captures must exist and be complete" but does not mention verifying `tenantId` ownership of both captures before returning diff content. The existing `get_capture` MCP tool calls `getCapture(env.DB, captureId)` — it is unclear from the plan whether `getCapture` already filters by tenantId.
**WHY**: If `getCapture` does not enforce tenant isolation (or if the diff path fetches artifacts from R2 by capture ID without checking ownership), a tenant could diff their own capture against another tenant's capture ID — cross-tenant information disclosure (IDOR, A01).
**TASK**: Task 1 (mcp-minion). Before implementing diff_captures, verify that `getCapture` in `src/db.js` returns null for captures belonging to another tenant (check the SQL WHERE clause). If it does, the tool is safe. If it does not, add an explicit `record.tenantId === auth.tenantId` check before fetching R2 artifacts. Document which path applies.

---

### [security]: get_certificate has no tenant isolation check
**SCOPE**: Task 1 (src/mcp.js), get_certificate tool
**CHANGE**: Same pattern as diff_captures. The plan does not explicitly require a tenantId ownership check before calling `generateCertificate`.
**WHY**: If `generateCertificate` accepts any capture ID and returns certificate data (including signed metadata, timestamps, and URLs), a read-scope key could retrieve another tenant's certificate.
**TASK**: Task 1 (mcp-minion). Same verification as diff_captures — confirm `getCapture` (or whatever function fetches the capture record for certificate generation) filters by `auth.tenantId`. Make the tenantId check explicit in the implementation, not assumed.

---

### [security]: Error messages in new tools must not reflect raw user input
**SCOPE**: Task 1 (src/mcp.js), all new tool handlers
**CHANGE**: The existing tools are careful not to reflect raw URLs or capture IDs in error messages (see `url-validation.js` Step 2 comment: "Do not reflect rawUrl in the error message"). The plan does not remind the mcp-minion to apply this discipline.
**WHY**: Tool error text is returned verbatim in MCP TextContent responses, which flows back to the LLM context. Reflecting attacker-controlled input (e.g., a crafted schedule name or URL fragment) creates a mild injection vector through the LLM output path (LLM05 — Improper Output Handling).
**TASK**: Task 1 prompt should include: "Do not echo raw user input (URLs, IDs, cron expressions) in error messages. Echo only safe, static descriptors or values that have already passed validation." Reference the existing pattern in `validateUrl` where rawUrl is never reflected.

---

## Non-Issues (explicitly reviewed and cleared)

- **Auth boundary enforcement**: The plan correctly excludes all `admin*` operationIds from the MCP tool surface. The MCP handler calls `verifyApiKey` with `requiredScope: 'read'` before constructing the server — admin endpoints are unreachable by design.
- **SSRF in batch_capture**: `validateUrl()` is a thorough SSRF guard (scheme allowlist, private IP blocklist including IPv4-mapped IPv6, double-encoding check). The plan correctly instructs mcp-minion to call it per URL. The TOCTOU limitation is pre-existing, acknowledged, and documented in `url-validation.js`.
- **Cron injection in create_schedule**: `validateCron()` enforces 5-field standard cron only, rejects @specials, enforces minimum 60-minute interval, and delegates to `croner` for parsing. There is no shell execution; the parsed value is stored to D1. No injection path.
- **Secret exposure in error messages**: Existing tools log `keyHashPrefix` (8 hex chars, not the raw key) and cap `errorMessage` at 256 chars. The pattern should be followed by new tools; the non-echo note above covers this.
- **Drift detection test security**: The inline maps in `test/mcp-sync.test.js` are read-only assertions against `openapi.yaml` using `fs.readFileSync`. No external input, no injection surface.
- **Rate limiting on list/get endpoints**: List and get operations (list_captures, get_capture, list_schedules, get_usage) are read-only. The existing MCP handler uses `verify_capture`'s own VERIFY_RATE_LIMITER for rate-limited reads. Read-only MCP tools without per-call rate limits are acceptable given overall per-tenant limits at auth time.
