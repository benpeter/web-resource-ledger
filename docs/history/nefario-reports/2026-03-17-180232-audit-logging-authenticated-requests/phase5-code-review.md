# Phase 5: Code Review — audit-logging-for-authenticated-requests

Reviewer: code-review agent
Date: 2026-03-17

---

## Summary

The implementation is well-structured. keyId derivation is correct and well-documented. Audit events are emitted at all authenticated handler boundaries. The INVARIANT in log.js is properly updated. No security regressions found. Two ADVISE-level findings and two NITs below.

---

VERDICT: APPROVE

FINDINGS:

- [ADVISE] src/index.js:177-185 -- SSRF reason enum silently maps three distinct validateUrl() failure categories to `ssrf_blocked_other`: (1) URL exceeds 2048 chars, (2) URL not parseable, (3) double-encoded characters. Cases 1 and 2 are input validation rejections, not SSRF blocks. The current label is technically imprecise and makes alert tuning harder — an operator filtering on `reason:"ssrf_blocked_other"` gets three different failure modes with different security implications.
  FIX: Introduce two additional enum values — `url_invalid` (covers URL not parseable and URL too long) and `double_encoding_blocked` (covers double-encoded characters). Update the keyword matching:
  ```js
  const ssrfReason = result.detail.includes('scheme')        ? 'url_scheme_not_allowed'
    : result.detail.includes('private')                      ? 'private_ip_blocked'
    : result.detail.includes('credentials')                  ? 'credentials_not_allowed'
    : result.detail.includes('resolve')                      ? 'dns_resolution_failed'
    : result.detail.includes('double-encoded')               ? 'double_encoding_blocked'
    : result.detail.includes('valid') || result.detail.includes('exceeds') ? 'url_invalid'
    : 'ssrf_blocked_other';
  ```
  This also makes the catch-all a true "should never happen" sentinel rather than a multi-purpose bucket.

- [ADVISE] src/index.js:135 -- The auth_fail security log does not include `keyId` (it cannot — auth failed). This is correct. However, it also lacks `tenantId` which is intentional per the comment. Consider whether the absence of both is explicitly noted in the decisions doc as a deliberate data minimization choice — it is (decisions.md section on error results not including tenantId or keyId). The finding is that the `status` field in the auth_fail log captures the HTTP response code, but the event does not distinguish between 503 (misconfigured), 401 (bad scheme), and 401 (wrong key). For abuse investigation, misconfigured deployments (503) generating noise vs. brute-force attempts (401) are operationally very different.
  FIX: Add a `reason` enum field mirroring the failure type:
  ```js
  const authReason = auth.response.status === 503 ? 'misconfigured'
    : /* existing 401s */ 'bad_credential';
  ```
  The `status` field already carries the HTTP code; the `reason` field makes alert logic unambiguous without adding attacker-controlled data.

- [NIT] src/auth.js:101 -- Variable `b` (the map callback parameter) shadows the outer `b` defined at line 68 (`const b = enc.encode(env.CAPTURE_API_KEY)`). It works correctly because the outer `b` is only used in `timingSafeEqual` above, but shadowing makes the code harder to scan quickly.
  FIX: Rename the map callback parameter:
  ```js
  .map(byte => byte.toString(16).padStart(2, '0'))
  ```

- [NIT] src/index.js:311 -- `handleListCaptures` error log at line 311 includes `keyId` in the list operational event (`list.error`) but not in the success log at line 349 (`list.success`). This is inconsistent — `keyId` is in scope for both paths.
  FIX: Add `keyId` to the `list.success` log payload at line 349 for parity with the error path and for consistent correlation queries.

---

## Security assessment

- No raw keys, bearer tokens, or raw IPs appear in any log payload. keyId is correctly derived as SHA-256 prefix of the operator-managed secret, not the caller-supplied token.
- The INVARIANT in log.js is correctly updated: keyId is listed as a permitted identifier alongside captureId, with the rationale documented.
- No injection vectors introduced: all audit event fields are either static strings, server-generated identifiers (captureId via crypto.randomUUID), HMAC-derived values (cip), or the SHA-256 prefix (keyId).
- The audit subsystem correctly uses severity 3 (info) for success paths and severity 5 (error) for failure/error paths, consistent with the log.js severity scale documented in the JSDoc.
- Rate-limit and capacity-limit events in the authenticated handlers correctly do not include `keyId` (auth has already succeeded but the log is in the security subsystem for those cases — minor inconsistency but not a bug; the audit event with outcome:'denied' is not emitted for rate limits, which is also correct since rate limit is not an audit-relevant rejection in the same sense as SSRF/auth).
- `performCapture` call site at line 228 is unchanged. Confirmed.

## Cross-file integration

- `verifyApiKey` returns `{ ok: true, tenantId, keyId }` and callers correctly destructure both at lines 138 and 261.
- `keyId` from auth flows directly into audit log payloads without any intermediate transformation. No risk of stale or incorrect value.
- The `cip` value is computed before auth in all authenticated handlers, which is correct — it must be available for the auth_fail log even when auth fails.

## Test coverage

- `test/auth.test.js` correctly tests keyId format (`/^[0-9a-f]{8}$/`), determinism, and absence from error results. Coverage is complete for the auth.js changes.
- No new tests for the index.js audit log calls, which is consistent with the project's integration-test philosophy — unit-testing ctx.waitUntil side effects would require mocking. The audit events are integration-testable via Coralogix queries once deployed.
