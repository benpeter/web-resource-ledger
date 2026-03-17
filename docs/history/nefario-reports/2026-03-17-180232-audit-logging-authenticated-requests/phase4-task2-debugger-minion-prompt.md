## Task: Add audit log events to authenticated handlers

You are adding structured audit log events at every authenticated API request
boundary to create a full audit trail. This is the core R13 implementation.

### Context

After Task 1, `verifyApiKey()` returns `{ ok: true, tenantId, keyId }`. You
need to emit audit events using the existing `log()` helper with a new
`audit` subsystem. The audit events are lean -- they record WHO did WHAT and
WHEN, not the operational details (those stay in existing `capture`/`list`
events).

**IMPORTANT: NO capture.js changes.** The architecture review deferred keyId
threading through `performCapture()` to R12 (50+ test call sites would break).
All audit events are emitted in `src/index.js` only.

### Audit event schema

Every audit event uses this flat envelope:

```javascript
{
  event: 'audit.<resource>.<action>',  // e.g., 'audit.capture.create'
  tenantId: string,                     // from auth result
  keyId: string,                        // from auth result (8-char hex)
  action: string,                       // 'create' | 'list'
  resource: string,                     // 'capture'
  resourceId: string | null,            // captureId when available, null for list
  outcome: string,                      // 'success' | 'denied' | 'error'
  cip: string,                          // hashed client IP (already computed)
}
```

### What to do

1. **`src/index.js` -- `handleCreateCapture()`**: After line 138
   (`const { tenantId } = auth;`), destructure `keyId` too:
   `const { tenantId, keyId } = auth;`

   Add ONE audit event AFTER the KV record is created (line 186) and the
   performCapture is triggered (line 199), right before the `return jsonResponse(...)` at line 205:
   ```javascript
   ctx.waitUntil(log(env, 3, 'audit', {
     event: 'audit.capture.create',
     tenantId,
     keyId,
     action: 'create',
     resource: 'capture',
     resourceId: captureId,
     outcome: 'success',
     cip,
   }) ?? Promise.resolve());
   ```

2. **`src/index.js` -- `handleCreateCapture()` KV failure**: In the KV
   write catch block (lines 187-196), AFTER the existing `capture.kv_create_fail`
   log call and BEFORE the `return problemResponse(500, ...)`, add an audit
   event recording the failure:
   ```javascript
   ctx.waitUntil(log(env, 5, 'audit', {
     event: 'audit.capture.create',
     tenantId,
     keyId,
     action: 'create',
     resource: 'capture',
     resourceId: null,
     outcome: 'error',
     cip,
   }) ?? Promise.resolve());
   ```
   This closes the audit trail gap for post-auth KV failures.

3. **`src/index.js` -- `handleCreateCapture()` SSRF block**: At line 177
   (the `security.ssrf_block` log call), the current code uses
   `result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail`
   for the reason field. **This is an INVARIANT violation** -- `result.detail`
   contains attacker-controlled content (URL, hostname).

   Fix the existing `security.ssrf_block` log call AND add an audit event.
   Replace the reason with a closed enum:
   ```javascript
   const ssrfReason = result.detail.includes('scheme')
     ? 'url_scheme_not_allowed'
     : result.detail.includes('private')
       ? 'private_ip_blocked'
       : result.detail.includes('credentials')
         ? 'credentials_not_allowed'
         : result.detail.includes('resolve')
           ? 'dns_resolution_failed'
           : 'ssrf_blocked_other';
   ```

   Then update the existing security log call to use the closed enum:
   ```javascript
   ctx.waitUntil(log(env, 5, 'security', {
     event: 'security.ssrf_block',
     tenantId, keyId,
     reason: ssrfReason,
     outcome: 'denied',
     cip,
   }) ?? Promise.resolve());
   ```

   And add an audit event for the SSRF block (authenticated request was denied):
   ```javascript
   ctx.waitUntil(log(env, 5, 'audit', {
     event: 'audit.capture.create',
     tenantId,
     keyId,
     action: 'create',
     resource: 'capture',
     resourceId: null,
     outcome: 'denied',
     cip,
   }) ?? Promise.resolve());
   ```

4. **`src/index.js` -- `handleListCaptures()`**: After auth (line 221),
   destructure `keyId`: `const { tenantId, keyId } = auth;`

   Add ONE audit event right before the final `return jsonResponse(...)` at
   line 310:
   ```javascript
   ctx.waitUntil(log(env, 3, 'audit', {
     event: 'audit.capture.list',
     tenantId,
     keyId,
     action: 'list',
     resource: 'capture',
     resourceId: null,
     outcome: 'success',
     cip,
   }) ?? Promise.resolve());
   ```

5. **`src/index.js` -- `handleCreateCapture()` auth failure**: Update the
   `security.auth_fail` log call at line 135 to include `outcome: 'denied'`:
   ```javascript
   ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', status: auth.response.status, cip, outcome: 'denied' }) ?? Promise.resolve());
   ```

6. **`src/index.js` -- `handleListCaptures()` auth failure**: Update the
   `security.auth_fail` log call at line 219 to include `outcome: 'denied'`:
   ```javascript
   ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', status: auth.response.status, cip, outcome: 'denied' }) ?? Promise.resolve());
   ```

7. **`src/index.js` -- `handleListCaptures()` error**: Update the `list.error`
   log call at line 270 to include audit fields:
   ```javascript
   ctx.waitUntil(log(env, 5, 'list', {
     event: 'list.error',
     tenantId: auth.tenantId,
     keyId: auth.keyId,
     errorClass: err.constructor.name,
     durationMs,
     cip,
     outcome: 'error',
   }) ?? Promise.resolve());
   ```

   Also emit a separate audit event:
   ```javascript
   ctx.waitUntil(log(env, 5, 'audit', {
     event: 'audit.capture.list',
     tenantId: auth.tenantId,
     keyId: auth.keyId,
     action: 'list',
     resource: 'capture',
     resourceId: null,
     outcome: 'error',
     cip,
   }) ?? Promise.resolve());
   ```

### What NOT to do

- Do NOT modify `src/capture.js` or `performCapture()` in any way.
- Do NOT create new files (no `src/audit.js`).
- Do NOT create an audit event builder function or helper.
- Do NOT modify `src/log.js`.
- Do NOT add request-start events. Completion events only.
- Do NOT log the capture URL in audit events.
- Do NOT touch unauthenticated endpoints (verify, signing-key, status, get).
- Do NOT change the performCapture() call site -- leave it exactly as is.

### Files to modify
- `src/index.js` -- add audit log calls, destructure keyId, update existing
  log calls with outcome field, fix SSRF reason to closed enum

### Tests

No test file changes needed. The audit events are fire-and-forget log calls
that do not affect request/response behavior. Existing tests should continue
to pass without modification since we are NOT changing performCapture().

### After completing
When you finish, mark task #2 completed with TaskUpdate and send a message to
the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
- The approach you chose for the SSRF reason enum, what alternatives you
  considered but rejected, and a brief reason for each rejection
