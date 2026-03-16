## Verdict: ADVISE

The plan is sound. No blocking gaps. Two issues worth addressing before implementation begins.

---

### Issue 1: `list.error` schema is underspecified (medium)

Task 2 Step 6 specifies `list.success` in detail:

```
{ event: 'list.success', tenantId, resultCount, cursor: 'present'|'absent', durationMs }
```

The error path says only "log `list.error` with tenantId and errorClass." That is incomplete. To be useful in Coralogix, `list.error` should mirror the success schema where possible:

```
{ event: 'list.error', tenantId, errorClass, durationMs }
```

`durationMs` on the error path matters: a slow KV failure (e.g., timeout) looks the same as a fast one without it. Without this, you cannot tell from logs whether the <300ms SLO was at risk before the error occurred.

**Recommendation**: Add `durationMs` to the `list.error` log call. The `start = Date.now()` is already captured at Step 3; the catch block should use it. One line:

```js
log(env, 5, 'capture', { event: 'list.error', tenantId, errorClass: e.constructor.name, durationMs: Date.now() - start });
```

---

### Issue 2: `security.ssrf_block` tenantId threading gap (low)

Task 1, instruction 3 says to add `tenantId` to the `security.ssrf_block` log at line 115. However, the SSRF block occurs at Step 6 (URL validation), which runs after auth at Step 2. `tenantId` is available in scope at that point, so this is correct in principle.

The risk is that the instruction for Task 1 specifically says:

> Do NOT add tenantId to pre-auth/unauthenticated log calls (`security.auth_fail`, `security.rate_limit`, `security.capacity_limit`).

`security.ssrf_block` is a post-auth event -- the call at line 115 is inside the handler after `auth.ok` is confirmed. The plan correctly identifies this as a site to add `tenantId`. This is consistent and correct.

No change needed here -- confirming the plan's reasoning is sound.

---

### What the plan gets right

- `durationMs` on `list.success` satisfies the <300ms SLO: you can alert in Coralogix when `durationMs > 300` on `event: list.success`.
- `cursor: 'present'|'absent'` (not the raw cursor value) is the right choice -- it avoids logging an opaque token that adds no diagnostic value and could confuse correlation queries.
- `resultCount` enables detection of empty-result anomalies (e.g., sudden drop to zero after a KV index write regression).
- tenantId threading rules (post-auth only) are correctly scoped.
- No changes to `log.js` are needed -- confirmed by the plan and the current implementation (transport-layer log.js takes a free-form `data` object).

---

### Summary

Fix: add `durationMs` to `list.error`. Everything else is approved.
