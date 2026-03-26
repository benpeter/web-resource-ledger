# Delegation Plan: Fix TOCTOU gap in swapVerifiedEmail()

## Summary

Fix a TOCTOU race condition in `swapVerifiedEmail()` by adding `AND pending_email = ?` to the SQL WHERE clause and passing the expected email from the caller. Update JSDoc, caller, and test comment.

## Tasks

### Task 1: Fix swapVerifiedEmail() and caller

**Agent**: security-minion (sonnet, mode: bypassPermissions)
**Depends on**: none
**Gate**: none

**Deliverables**:
- Modified `src/db.js`: add `expectedEmail` parameter, add `AND pending_email = ?` to WHERE clause, update JSDoc
- Modified `src/email-verify.js`: pass `email` as third argument to `swapVerifiedEmail()`
- Modified `test/email-verify.test.js`: update TOCTOU comment to note the fix is in place

**Prompt**:

You are fixing a TOCTOU race condition in `swapVerifiedEmail()`. The issue is fully specified — make exactly these changes:

### 1. `src/db.js` — `swapVerifiedEmail()` (line ~1400)

Current signature:
```js
export async function swapVerifiedEmail(db, tenantId)
```

Change to:
```js
export async function swapVerifiedEmail(db, tenantId, expectedEmail)
```

Update JSDoc to add `@param {string} expectedEmail` — the email address that must match `pending_email` for the swap to proceed.

Current WHERE clause:
```sql
WHERE tenant_id = ?
  AND pending_email IS NOT NULL
```

Change to:
```sql
WHERE tenant_id = ?
  AND pending_email = ?
```

Note: `AND pending_email = ?` implicitly excludes NULL (NULL != any value in SQL), so the separate `IS NOT NULL` check is no longer needed.

Current bind:
```js
.bind(now, tenantId).run()
```

Change to:
```js
.bind(now, tenantId, expectedEmail).run()
```

### 2. `src/email-verify.js` — caller (line ~441)

Current:
```js
const swapResult = await swapVerifiedEmail(env.DB, tenantId);
```

Change to:
```js
const swapResult = await swapVerifiedEmail(env.DB, tenantId, email);
```

The `email` variable is already in scope (line 407: `const { tenantId, email } = result;`).

### 3. `test/email-verify.test.js` — TOCTOU comment (lines ~344-348)

Replace the existing comment block:
```js
// NOTE: The existing pending_email cross-check (prefs.pendingEmail !== email)
// catches the common case, but swapVerifiedEmail() does not include
// AND pending_email = ? in its WHERE clause. A concurrent request could
// change pending_email between the check and the swap. See security review
// notes in docs/evolution/ for details. The fix is tracked separately.
```

With:
```js
// The pending_email cross-check (prefs.pendingEmail !== email) catches the
// common case. swapVerifiedEmail() also pins pending_email = ? in its WHERE
// clause as defense-in-depth against TOCTOU races. See #222.
```

### Verification

After making the changes, read back all three files to confirm the edits are correct. Do NOT run tests — the orchestrator handles that.

## Execution Order

1. Task 1 (no dependencies, no gates)

## Conflict Resolutions

None — single-task plan with no specialist disagreements.

## Risks

- **Risk**: Existing callers of `swapVerifiedEmail()` break if other call sites exist.
  **Mitigation**: Grep confirms only one call site (`src/email-verify.js:441`).

## Cross-Cutting

- **Testing**: Existing test at line 343 of `email-verify.test.js` covers stale-token scenario. The test already passes (the application-level cross-check catches mismatch). The DB-level guard is defense-in-depth. Only the comment needs updating.
- **OpenAPI**: No API surface changes.
- **Documentation**: Evolution log entry (handled by orchestrator).
