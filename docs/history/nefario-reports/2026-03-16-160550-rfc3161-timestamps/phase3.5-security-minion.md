# Security Review: RFC 3161 Timestamp Integration

**Verdict: ADVISE**

The plan is well-considered and embeds most of my earlier recommendations correctly. The issues below are not blockers but require explicit attention before merge.

---

## Findings

### [HIGH] TSA URL configured as HTTP in wrangler.toml (Conflict 2 resolution)

The plan resolves the HTTP vs HTTPS conflict in favor of `http://timestamp.digicert.com` with no transport validation, citing that "the TSA response is self-authenticating." This is factually correct for the cryptographic trust of the token itself -- the TSA signature over the TSTInfo is what matters for verification. However, HTTP still exposes:

- **Response substitution during capture**: An active MitM on the outbound TSA request can drop the response (forcing a graceful-degradation path and silently removing the timestamp) or substitute a response from a different TSA session without the operator noticing until verification.
- **SSRF amplification surface**: `TSA_URL` flows from `env` directly into a `fetch()` call inside Cloudflare Workers. If `TSA_URL` is ever manipulated (e.g., a misconfiguration or future operator error), `http://` widens the attack surface compared to `https://`.

The YAGNI argument holds for the TSA_ALLOW_HTTP flag. It does not hold for the default URL itself -- DigiCert's `https://timestamp.digicert.com` is equally stable and tested. The single-character change from `http://` to `https://` in wrangler.toml costs nothing.

**Required change**: Change `TSA_URL = "http://timestamp.digicert.com"` to `TSA_URL = "https://timestamp.digicert.com"` in both `[vars]` and `[env.staging.vars]`. Propagate to vitest.config.js bindings. No flag, no validation code -- just the correct default.

---

### [MEDIUM] `verifyTimestamp()` verifies messageImprint but not the nonce -- and that is architecturally sound, but must be documented

At capture time, `requestTimestamp()` validates nonce and messageImprint. At verification time, `verifyTimestamp()` only validates messageImprint against `expectedBundleHash`. The nonce is not stored in the `signatures` array and cannot be re-checked. This is correct -- the nonce is a replay-prevention mechanism for the capture request, not a property of the stored token.

However, `verifyTimestamp()` as specified does NOT verify the TSA's cryptographic signature (explicitly deferred). This means `verifyTimestamp()` only checks that the token's embedded hash matches the expected hash -- it does not prove the token came from any TSA at all. A token could be fabricated with a matching hash and would pass `verifyTimestamp()`.

The plan documents this deferral correctly in the file header (`@security: Certificate chain validation is deferred`). The risk is accepted. The concern is that the verification page and API response present the timestamp check as `pass` with `tsa: "http://timestamp.digicert.com"` even though the TSA identity has not been verified -- a relying party could misread this as a stronger guarantee than it is.

**Required action**: The `detail` field on the `pass` status in Check 4 should clarify this scope, or the verification page description should read "Confirms capture time was recorded by the capture service using a third-party timestamp token" rather than "Confirms capture time was certified by an independent authority." The latter overstates the current verification strength. This is a documentation/UX text fix, not a code change.

Specifically in Task 5's prompt:
```js
timestamp: 'Confirms capture time was certified by an independent authority.',
```
should be:
```js
timestamp: 'Records capture time using an independent timestamp token.',
```

---

### [MEDIUM] DER integer handling for nonce comparison

The plan specifies nonce as `INTEGER <16 random bytes>` in the request and mandates matching in the response. DER INTEGER encoding has a leading-zero-byte rule: if the high bit of the first byte is set, a `0x00` byte is prepended to preserve positive sign. A 16-byte nonce could therefore be encoded as 17 bytes in the response when the first byte has the high bit set.

The nonce comparison in `requestTimestamp()` must strip any leading zero byte from the parsed DER INTEGER value before comparing it to the original 16 random bytes. Failure to do this would cause spurious validation failures for ~50% of nonces (when the high bit is set).

The plan mentions this implicitly ("Extract messageImprint hash and genTime ... nonce in response matches request nonce") but does not specify this edge case. The iac-minion prompt for Task 1 should be updated to note the leading-zero normalization requirement explicitly.

**Required action**: Add to the Task 1 prompt under "Security guardrails" or the nonce section: "When comparing nonces, strip any DER INTEGER leading zero byte (the sign-extension byte prepended when the high bit of the first content byte is set) before comparing to the original 16-byte random value."

---

### [LOW] Error messages must not disclose TSA URL or token structure

The plan specifies that check `detail` messages must not include hash values (correctly). However, the error paths in `requestTimestamp()` may include exception messages that contain TSA URL or raw DER bytes. These should not propagate to the `detail` fields in verification results.

The current design throws from `requestTimestamp()` (caller catches), and `verifyTimestamp()` returns `{ valid: false, reason: string }`. In Task 3, the catch block sets `detail: 'Independent timestamp verification failed'` -- this is correct and safe.

The `reason` field from `verifyTimestamp()` is logged internally but does NOT flow to `detail` in the verification response (the plan uses a fixed string). Confirm this is enforced in Task 3's implementation.

**Required action**: Confirm (in code review, Phase 5) that `result.reason` from `verifyTimestamp()` is never surfaced in the API response or verification page. It should only appear in server-side logs.

---

### [LOW] `skip` tolerance creates an ambiguous API contract

The plan changes `verified` from `checks.every(c => c.status === 'pass')` to `checks.every(c => c.status === 'pass' || c.status === 'skip')`. The plan argues (correctly) that in practice only the timestamp check can produce `skip`, and that this occurs only when TSA was unavailable at capture time, which is an intentional neutral outcome.

The risk is well-analyzed in the plan's risk table. The implementation note in Task 3 ("IMPORTANT: Verify that skip tolerance does not create a security hole") is the right safeguard. Ensure this verification step is explicitly checked during Phase 5 code review -- not left to chance.

**Required action**: Phase 5 code review must explicitly validate that no code path in the existing three checks (`artifactHashes`, `bundleHash`, `signature`) can produce `status: 'skip'` independently. The existing `artifactHashes skip` case (when `digestRaw` is missing) always co-occurs with `bundleHash: fail` and `signature: fail`, keeping `verified: false`. This must be confirmed in code, not documentation.

---

### [INFORMATIONAL] Certificate chain validation deferral is acceptable for MVP

Deferring full CMS certificate chain validation is justified: Cloudflare Workers does not provide native X.509 chain building, the TSA token is stored for third-party verification by tools that do support chain validation (e.g., openssl ts), and the nonce + messageImprint validation at capture time provides meaningful integrity guarantees.

The `@security` comment in the file header and backlog entry are the correct documentation artifacts. No additional action required for MVP.

---

## Summary of Required Changes

1. **wrangler.toml + vitest.config.js**: Change `http://timestamp.digicert.com` to `https://timestamp.digicert.com` everywhere the default TSA URL appears.

2. **Task 1 prompt (rfc3161.js)**: Add explicit instruction that DER INTEGER nonce comparison must strip the leading zero byte before comparing.

3. **Task 5 prompt (verify-page.js)**: Change the `timestamp` CHECK_DESCS text from "Confirms capture time was certified by an independent authority" to wording that does not overstate the current (no chain validation) verification strength.

4. **Phase 5 code review**: Explicitly verify that `skip` tolerance in the `verified` predicate cannot be exploited via existing check paths, and that `verifyTimestamp()` reason strings never reach the API response.

None of these require restructuring the plan. Items 1-3 are direct prompt/config edits before execution begins. Item 4 is a code review gate instruction.
