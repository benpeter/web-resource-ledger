## Security Minion Review -- email-verify-tests

**Verdict: ADVISE**

The plan is fundamentally sound. Token security properties are well-covered. One tracking gap and one minor test-design note follow.

---

### What is covered (well)

- **Domain separation**: three cross-domain tests (unsubscribe token rejected by verify, verify token rejected by unsubscribe, session-style HMAC rejected by verify). This is the right set -- the domain prefix `emailverify.` is the only thing separating these from the same key.
- **Expiry boundary**: exact 24h boundary test correctly notes the `> 86400` vs `>= 86400` distinction.
- **Tampered payload and HMAC**: separate tests, correct.
- **Stale token (pending_email changed)**: covered by "stale token after second email change" test.
- **Double-verification replay**: covered. The second POST finds `pendingEmail = NULL`, fails the cross-check.
- **Cache-Control: no-store**: asserted on both GET and POST responses. Required -- these pages must not be cached by proxies or scanners.
- **CSRF enforcement on resend**: `Missing CSRF header -> 403` test is present.
- **Rate limiting on resend**: two-call-within-60s test is present.
- **GET does not mutate DB**: read-before/read-after assertion is present and important (scanner pre-fetch must not verify).
- **Malformed token edge cases**: dot-only, no-dot, empty, null. Good set.
- **Version mismatch**: v: 2 rejection is covered.
- **Missing fields**: `e` field only (one representative test). Acceptable -- the parse path is identical for all fields.

---

### ADVISE items

#### 1. TOCTOU deferral: acceptable, but the follow-up issue must be tracked

The confirmed SQL: `WHERE tenant_id = ? AND pending_email IS NOT NULL` with no `AND pending_email = ?` clause. The plan defers the fix correctly -- the TOCTOU window requires a concurrent request between the cross-check (line 427) and the swap (line 441), and D1's request-scoped isolation makes this extremely unlikely in practice.

The deferral is acceptable **on condition** that a GitHub issue is created before this PR merges. The plan says "Do NOT create a GitHub issue for the TOCTOU fix (the human will handle that)." That is the right call for test-minion, but someone must own creating the issue. If that issue is not tracked, this will be forgotten -- the code comment alone is not enough.

**Recommendation**: nefario or the human must create the tracking issue as part of the evolution log phase, not after. The comment in the test file should reference the issue number once created.

The fix itself is two lines:
```sql
AND pending_email = ?
```
added to the `swapVerifiedEmail` WHERE clause, with the expected email passed as a bind parameter from the caller. This should be the first thing in the follow-on PR.

#### 2. Token-in-body test: assert form submission path only (minor)

The "Token in form body" test sends `application/x-www-form-urlencoded`. The plan covers this correctly. One clarification for test-minion: the test should verify that the token is NOT in the query string, to confirm it is exercising the body-parsing path and not the query param fallback. Otherwise the test could silently pass via the wrong code path.

#### 3. No-session-secret path not explicitly tested

The GET and POST handlers both gate on `env.SESSION_SECRET`. If `SESSION_SECRET` is absent, GET renders the invalid-token page and POST renders the failure page. This is fail-closed behavior. It is not tested. This is low priority -- the test environment always has the secret -- but worth noting as a gap in the production hardening coverage. Out of scope for #199 is fine; noting it for completeness.

---

### What was considered and rejected

- **Static-analysis "no email logging" test**: the decision to skip this is correct. The invariant is enforced at line 456 of email-verify.js where only `tenantId` (not email) appears in the success log. A regex scan of source would be fragile. Code review is the right enforcement mechanism.
- **Timing-safe HMAC verification test**: correctly excluded. `crypto.subtle.verify` is a platform guarantee, not testable from test code.

---

### Summary

The test plan covers all meaningful token security properties. The TOCTOU deferral is the only item that needs a concrete owner before this PR ships -- everything else is fine to proceed as written.
