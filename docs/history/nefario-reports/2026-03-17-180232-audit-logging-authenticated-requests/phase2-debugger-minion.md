## Domain Plan Contribution: debugger-minion

### Summary of Current State

I traced every log call across `src/index.js` and `src/capture.js` and mapped the existing event taxonomy:

| Event namespace | Subsystem | Where | Includes tenantId? | Includes action context? |
|---|---|---|---|---|
| `security.auth_fail` | security | index.js L135, L219 | No | No (status code only) |
| `security.rate_limit` | security | index.js L144, L228, L446, L553, L583 | No | No |
| `security.capacity_limit` | security | index.js L153, L235 | No | No |
| `security.ssrf_block` | security | index.js L177 | Yes | Yes (reason) |
| `capture.kv_create_fail` | capture | index.js L188 | Yes | Yes |
| `capture.start` | capture | capture.js L113 | Yes | Yes (url) |
| `capture.success` | capture | capture.js L230 | Yes | Yes |
| `capture.partial` | capture | capture.js L218 | Yes | Yes |
| `capture.fail` | capture | capture.js L258 | Yes | Yes |
| `list.success` | list | index.js L299 | Yes | Partial (resultCount) |
| `list.error` | list | index.js L270 | Yes | Partial |

**Key findings:**

1. **No `keyId` anywhere in the auth flow.** `auth.js` returns `{ ok: true, tenantId }` but no `keyId`. Today `tenantId` is hardcoded to `'default'`. This is the R12 dependency -- until per-tenant keys ship, there is no real key identity to log. However, the audit log _schema_ should include `keyId` from day one (populated as `null` or `'legacy'` pre-R12) so queries don't need migration later.

2. **No admin endpoints exist yet.** There are no key provisioning/revocation routes in the codebase. The CLAUDE.local.md documents an external `POST /v1/admin/keys` endpoint and admin auth via `ADMIN_KEY`, but this is not implemented in `src/index.js`. Key lifecycle audit events cannot be wired up until those endpoints exist. This is a scope reduction opportunity: R13 should focus on request-path audit logging and define the schema for key lifecycle events, deferring implementation of key lifecycle logging to the R12 phase that creates those endpoints.

3. **`capture.start` in `capture.js` already covers the "who captured what, when" requirement** for captures. It logs `tenantId`, `captureId`, `url`, and `cip` at the moment work begins. Similarly `list.success` covers the list endpoint. These are operational logs, not dedicated audit events, but they contain the required fields.

4. **Auth failures lack tenant context.** The `security.auth_fail` events log only the response status code and hashed IP. By definition, a failed auth doesn't have a valid tenantId. This is correct behavior -- but for compliance queries ("show all activity from IP X"), the `cip` field is the join key. This already works.

### Recommendations

**(a) Router level vs. per-handler: per-handler, with no new abstraction.**

A router-level audit log would require wrapping every handler to inject tenant context _after_ auth completes. Since only 2 of 9 routes require auth, this wrapper would be a no-op for 7 routes and would add indirection with no coverage benefit. The two authenticated handlers already have the `auth` object in scope immediately after `verifyApiKey()`. Placing the audit log call right after auth success (before any business logic) gives maximum coverage with zero abstraction overhead. This is the KISS path.

Do NOT introduce middleware, decorator patterns, or wrapper functions. The codebase explicitly avoids frameworks, and the two auth-requiring handlers are simple enough that a single `ctx.waitUntil(log(...))` call at the right line is the correct approach.

**(b) Extending post-auth sections without duplication.**

The two handlers (`handleCreateCapture`, `handleListCaptures`) share an identical auth+rate-limit pattern (lines 133-156 and 217-238). The audit log call should go in the same location in both handlers: immediately after `const { tenantId } = auth;` (or equivalent). Yes, this means two nearly identical `log()` calls. This is fine -- two lines is not "duplication" worth abstracting. The payloads differ (`action: 'capture.create'` vs `action: 'capture.list'`), so any shared helper would just be moving parameters around for aesthetics.

**(c) Do existing capture.js logs count as audit coverage?**

Partially. The `capture.start` event already logs tenantId + url + captureId + cip, which satisfies "who captured what, when." But there is a critical gap:

- **`capture.start` fires inside `ctx.waitUntil()` (background execution).** If the worker is terminated before `performCapture()` runs (e.g., runtime limit, deployment), the audit event is lost. The 202 response was already sent to the caller.
- **For audit purposes, the request itself must be logged synchronously in the request path**, before the 202 is returned. The capture.start log in `capture.js` remains valuable for operational correlation but is not a reliable audit record.

So: yes, we need separate audit events in `index.js`, fired _before_ the response is sent. The capture.js events supplement but do not replace them.

The audit events should use a new subsystem name `'audit'` to distinguish them from operational logs. This enables Coralogix queries like `subsystemName == 'audit'` to return exactly the compliance-relevant events without noise from operational capture pipeline logs.

**(d) Minimal set of code changes.**

**4 files touched, ~20 lines added:**

1. **`src/index.js` -- `handleCreateCapture()`**: Add one `ctx.waitUntil(log(...))` call after line 138 (`const { tenantId } = auth;`), before rate limiting. Event: `audit.capture.create`. Fields: `tenantId, keyId: null, action: 'capture.create', cip, resource: null` (captureId not yet generated). Severity 3 (info).

2. **`src/index.js` -- `handleListCaptures()`**: Add one `ctx.waitUntil(log(...))` call after line 221 (`auth.ok` check passes). Event: `audit.capture.list`. Fields: `tenantId, keyId: null, action: 'capture.list', cip`. Severity 3.

3. **`src/index.js` -- `handleCreateCapture()` (post-ID generation)**: Optionally, enrich the audit log to include `captureId` after line 182. Alternative: rely on the existing `capture.start` event in capture.js for captureId correlation. I recommend the simpler option: one audit event per request, at the auth boundary. The captureId can be correlated via timestamp+tenantId+cip with the existing operational logs.

4. **`src/auth.js`**: No changes needed for R13. When R12 ships, `verifyApiKey()` will return `keyId` alongside `tenantId`. The audit log schema includes `keyId: null` today as a placeholder.

5. **`src/log.js`**: No changes needed. The existing `log()` function supports arbitrary subsystem strings and structured data. Using `'audit'` as a new subsystem value is sufficient.

**That's it.** Two log calls added. No new files. No new abstractions. No schema definitions (the Coralogix payload is freeform JSON).

### Proposed Tasks

**Task 1: Add audit log events to authenticated handlers**
- What: Add `ctx.waitUntil(log(env, 3, 'audit', { event: 'audit.api_request', tenantId, keyId: null, action: 'capture.create', cip }))` after auth success in `handleCreateCapture()`, and an equivalent call with `action: 'capture.list'` in `handleListCaptures()`.
- Deliverables: Modified `src/index.js` with 2 new log calls.
- Dependencies: None.

**Task 2: Define audit event schema (documentation only)**
- What: Document the audit event schema in a decision record. Fields: `event` (string, `audit.api_request` / `audit.key.create` / `audit.key.revoke`), `tenantId`, `keyId` (null until R12), `action` (enum: `capture.create`, `capture.list`, `key.create`, `key.revoke`), `cip`, `resource` (optional, e.g., captureId when available), `responseStatus` (HTTP status).
- Deliverables: `docs/evolution/NNNN-audit-logging/decisions.md` entry.
- Dependencies: None.

**Task 3: Verify Coralogix queryability**
- What: After deployment to staging, execute a capture and list request, then query Coralogix for `subsystemName == 'audit'` to confirm events arrive and are filterable by tenantId and time range.
- Deliverables: Verified query, documented in outcome.md.
- Dependencies: Task 1 deployed to staging.

### Risks and Concerns

1. **R12 dependency is real but manageable.** The success criteria say "tenantId, keyId" -- but keyId does not exist yet (auth.js hardcodes tenantId to `'default'` and returns no keyId). The plan should explicitly state that `keyId` will be `null` in audit events until R12 ships, and that R12's implementation must populate it. This is not a blocker for R13 but must be tracked.

2. **`ctx.waitUntil` log delivery is not guaranteed.** If the Worker runtime terminates the isolate before the log fetch completes, the audit event is lost. This is the same risk as all existing log calls. For true compliance-grade audit trails, a durable write (KV or D1) would be needed. This is out of scope for R13 but should be acknowledged in the decision record. For the current single-operator use case, Coralogix delivery via `ctx.waitUntil` is sufficient.

3. **Don't log the auth token or API key.** This seems obvious but is worth stating as a constraint. The audit event must never include the raw bearer token or any derivative that could reconstruct it. `tenantId` and `keyId` (when available) are the identity fields.

4. **Subsystem naming: use `'audit'` not `'security'`.** The `security` subsystem already contains rate limit, auth fail, and SSRF events. Mixing audit events into `security` would make compliance queries noisier. A dedicated `'audit'` subsystem enables clean `subsystemName == 'audit'` queries in Coralogix.

5. **Event naming convention.** Existing events use `namespace.action` (e.g., `capture.start`, `security.auth_fail`, `list.success`). Audit events should follow the same pattern: `audit.api_request` for all authenticated requests, with the `action` field distinguishing the operation. This avoids proliferating event names -- there are only 2 authenticated endpoints today.

6. **No admin endpoints to audit yet.** The success criteria mention "Key provisioning and revocation events logged." These admin endpoints do not exist in the codebase. The CLAUDE.local.md describes them as external curl commands, suggesting they may be deployed separately or are part of R12. R13 should define the audit schema for key lifecycle events but cannot wire them up until the endpoints exist. This should be called out explicitly in scope.

### Additional Agents Needed

None. The changes are small (2 log lines in `index.js`), the logging infrastructure already exists, and the Coralogix integration is proven. The main risk is schema design, which is a planning concern already covered by this contribution. No security review is needed beyond confirming that raw tokens are not logged (which the existing `auth.js` comments already enforce).
