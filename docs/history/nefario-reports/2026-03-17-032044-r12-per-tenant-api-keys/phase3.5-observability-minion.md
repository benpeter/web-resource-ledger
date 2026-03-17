# Observability Review -- R12 Per-Tenant API Keys

**Verdict: ADVISE**

The plan is well-instrumented overall. The event schema is coherent, the
severity mapping is consistent with existing patterns, and the decision to
fold `scope_violation` into `security.auth_fail` (Conflict 2) is the right
call -- it preserves Coralogix query compatibility and avoids a new event
type for what is structurally the same failure. The items below are not
blockers; they are gaps that will create operational friction in production if
left unaddressed.

---

## Findings

### 1. `handleAdminListKeys` -- no log on success or error (MEDIUM)

Task 2 defines `admin.key_create` and `admin.key_revoke` log events but
specifies no log for `handleAdminListKeys`. List operations are a common
reconnaissance vector: an attacker with a leaked admin key will enumerate all
tenant keys before attempting anything else. Without a log, that pattern is
invisible.

The two existing authenticated endpoints (`handleCreateCapture`,
`handleListCaptures`) both emit post-auth log events. The admin list handler
should follow the same pattern.

**Recommended addition** -- emit at severity 3 (info), subsystem `admin`:
```js
{ event: 'admin.key_list', tenantId: targetTenantId, keyCount: data.length, cip }
```

Also: no log is specified for KV read failures inside the list handler (the
`env.KV.get()` calls per hash in step 5). These should log at severity 4 with
the orphaned hash truncated to 16 chars, consistent with the truncation policy
in `admin.key_create`.

### 2. Auth fail log in `handleAdminRevokeKey` -- not specified (MEDIUM)

Task 2 specifies auth fail logging for `handleAdminCreateKey` (step 3) but
the equivalent logging block is absent from `handleAdminRevokeKey`'s
processing order. The pattern must be consistent: every admin handler that
calls `verifyApiKey` + `requireScope` must emit `security.auth_fail` on
failure, including the revoke handler.

The missing log would cover cases like:
- A revoked key attempting to revoke another key
- A tenant-scoped key attempting to call the revoke endpoint without admin scope
- A raw Bearer token with no match in KV or env-vars

**Recommended fix**: add auth fail and scope fail logging to step 2 of
`handleAdminRevokeKey`, identical to the pattern in `handleAdminCreateKey`
step 3.

### 3. Scope violation log responsibility gap -- handler vs. `requireScope` (LOW but must be explicit)

The synthesis correctly notes that scope enforcement logs must be emitted from
the call site (not from inside `requireScope`), because `requireScope` returns
a Response without calling `log()`. This is the right design.

However, the Task 3 prompt specifies scope violation logging only for
`handleCreateCapture` and `handleListCaptures`. There is no explicit reminder
that the three admin handlers in Task 2 must also emit the scope fail log at
their call sites. Because Task 2 and Task 3 are assigned to the same agent in
the same batch, the risk is that the agent handles it once and omits it in the
others.

The synthesis already contains the correct log shape for `handleAdminCreateKey`
step 3. The Task 2 prompt must also include explicit scope fail log
instructions for `handleAdminListKeys` step 2 and `handleAdminRevokeKey`
step 2, or the implementing agent will likely miss them.

### 4. `reason` field missing from existing `security.auth_fail` events (LOW)

The current `handleCreateCapture` emits:
```js
{ event: 'security.auth_fail', status: auth.response.status, cip }
```

Task 3 enriches this with `keyName` and `reason`, but the `reason` field only
works if the new `auth.ok === false` return shape (which adds `auth.reason`)
is consistently used. Task 3's specified log block for `handleCreateCapture`
correctly includes `reason: auth.reason`. The same enrichment must be applied
to `handleListCaptures` -- Task 3 does list this handler but only calls out
specific line numbers for rate limit and capacity events, not the auth fail
event. Confirm the auth fail log at line 212 of the current `index.js` also
gets `reason: auth.reason` added.

### 5. Forward-compatibility for R13 audit logging (LOW -- advisory only)

The plan notes `performCapture` already has 8 positional parameters and flags
this as a known smell. For R13 audit logging, the path of least resistance
will be to bundle `{ tenantId, keyName, authMethod, keyHash }` into an
`authContext` object that flows through the capture pipeline. Recommend adding
a backlog item for this refactor explicitly, so R13 does not inherit the
sprawl.

The current `keyHash: keyHash.slice(0, 16)` truncation in `admin.key_create`
and `admin.key_revoke` is appropriate for log readability. If R13 needs a
full hash for audit trail correlation, that should use a separate audit event
at a higher severity, not extend the existing truncated fields.

---

## What the plan gets right

- Severity mapping is consistent: admin key lifecycle events at 4 (warn),
  security failures at 5 (error), info-tier capture events at 3.
- Subsystem naming (`admin`, `security`, `capture`) maps to existing Coralogix
  query patterns.
- Rate limit events on admin endpoints correctly omit `tenantId` (auth has not
  run yet -- this is an important schema invariant).
- The `cip` field is present on every admin event.
- The `// tva` comment preservation requirement is explicit in Task 1.
- Log.js requires zero changes -- the existing structured log shape absorbs
  all new fields naturally.
- The `keyHash.slice(0, 16)` truncation in log events is correct -- the full
  hash is not needed for log correlation and is too long for human scanning.

---

## Required changes before execution

1. Add `admin.key_list` success event to Task 2 `handleAdminListKeys`.
2. Add auth fail and scope fail logging to Task 2 `handleAdminRevokeKey`
   step 2, matching the `handleAdminCreateKey` pattern.
3. Confirm Task 3 also enriches the existing auth fail log in
   `handleListCaptures` (line 212) with `reason: auth.reason`, not just the
   events explicitly called out by line number.

Items 1-3 are small additions that the implementing agent can handle inline.
None require rework of the plan's architecture. The plan may proceed once
these are acknowledged by the synthesis author.
