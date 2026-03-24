# Security Assessment: Simplify Capture Access Model

## Executive Summary

The proposed change -- making individual capture GET endpoints public, relying on 128-bit capture IDs as capability tokens -- is **acceptable for this use case** with specific mitigations. The residual risk profile is better than the current share token system (which puts secrets in query strings). The change aligns with the existing trust model: `/v1/verify/{id}` and WACZ artifact access are already public, so capture IDs are already leaked to verifiers.

---

## (a) Is 128-bit Entropy Sufficient?

**Yes, with a caveat.**

`crypto.randomUUID()` generates UUID v4, which has **122 bits of randomness** (6 bits are fixed for version/variant fields). The capture ID `cap_` prefix + 32 hex chars represents this 122-bit space.

**Brute-force analysis:**

| Metric | Value |
|--------|-------|
| Effective entropy | 122 bits |
| Keyspace | 5.3 x 10^36 |
| Guesses at 10,000 req/sec (rate-limited) | 1.7 x 10^25 years to 50% probability |
| Guesses at 1M req/sec (no rate limit) | 1.7 x 10^23 years |

For context: 122 bits exceeds the entropy of most session tokens in production systems (which typically target 128 bits but often have less). AWS pre-signed URLs use similar entropy-as-capability patterns.

**The caveat:** ANSSI R18 and NIST SP 800-90A technically require 128+ bits for security tokens. You are at 122 bits. This is a compliance footnote, not a practical vulnerability. If strict compliance ever becomes a concern (e.g., eIDAS qualified timestamp customers with audit requirements), you could migrate to a custom 128-bit random ID format: `cap_` + 32 hex chars from `crypto.getRandomValues(new Uint8Array(16))`. This would be a non-breaking change since the format (`cap_[a-f0-9]{32}`) stays the same -- only the entropy source changes.

**Recommendation:** Document the 122-bit effective entropy in SECURITY.md. Consider switching the ID generation from `crypto.randomUUID().replace(/-/g, '')` to `crypto.getRandomValues(new Uint8Array(16))` → hex to get full 128-bit entropy. This is a one-line change and eliminates the compliance gap entirely.

---

## (b) Residual Risks if Capture IDs Leak

Capture IDs will inevitably leak through multiple channels. This is not a flaw -- it is the explicit design. But you need to enumerate the channels and assess impact.

### Leak channels

| Channel | Current status | Mitigation |
|---------|---------------|------------|
| **Referrer header** | `Referrer-Policy: no-referrer` set globally (index.js:556) | **Already mitigated.** Browser navigations from the verify page will not leak the capture ID to external sites. |
| **Server access logs (Cloudflare)** | Capture IDs appear in URL paths in CF access logs | Operational. Cloudflare logs are within the trust boundary. No action needed. |
| **Coralogix application logs** | Capture IDs are logged in structured events | Already within the logging trust boundary. **Verify** that log retention policies match your data sensitivity classification. |
| **Webhook payloads** | `captureId` + `verificationUrl` are sent to tenant-configured webhook URLs | The tenant chose to receive these. The webhook destination is their own trust boundary. No change needed. |
| **Browser history / URL bar** | Users who visit `/v1/verify/cap_xxx` have the ID in history | This is already the case today. No change in exposure. |
| **Link sharing** | Users copy-paste capture/verify URLs | This is the intended use case. The proposal makes this _simpler_ (no share token query param needed). |
| **Third-party analytics / tracking** | If the verify page loads third-party JS, capture IDs would be visible | **Check:** Does `verify-page.js` load any external resources? If it does (or ever will), CSP must block it. The current `Referrer-Policy: no-referrer` only helps for navigation, not for subresource requests from the same page. |

### Impact if an ID leaks

An attacker with a leaked capture ID can:

1. **View the capture metadata** (URL captured, timestamps, render quality) -- LOW impact. This is the same data visible through the already-public `/v1/verify/{id}` endpoint.
2. **Download artifacts** (screenshot, HTML, headers, WACZ) -- MEDIUM impact depending on content. Screenshots may contain sensitive page content. HTML contains the rendered page source. Headers contain the target site's HTTP response headers.
3. **They cannot** list other captures, create new captures, modify anything, or discover other capture IDs.

**Key insight:** The verify endpoint already returns the captured URL, timestamps, and verification status publicly. The _incremental_ exposure from making artifacts public is the screenshot, HTML source, and response headers. For most captures (public web pages), this is low sensitivity. For captures of authenticated/private pages, this is the content the tenant explicitly chose to archive.

**Recommendation:** Add a `Cache-Control: private, no-store` header on all newly-public capture endpoints (already present in current code -- verify this persists after the change). Consider adding `X-Robots-Tag: noindex` to prevent search engine indexing of capture metadata and artifacts.

---

## (c) Edge Cases and Unexpected Attack Surface

### 1. Status endpoint leaks capture lifecycle (LOW)

Making `GET /v1/captures/{id}/status` public reveals whether a capture is `pending`, `complete`, `failed`, or `quarantined`. The `failed` status includes `error` and `retryable` fields. Review what `error` contains -- if it ever includes internal error messages, stack traces, or infrastructure details, that becomes an information disclosure issue.

**Current code (index.js:1882-1887):**
```javascript
return jsonResponse({
  id: captureId,
  status: 'failed',
  error: record.error,
  retryable: record.retryable,
}, 200, headers);
```

**Recommendation:** Audit all values stored in `captures.error` to ensure they are user-facing messages, not internal error details. If any contain stack traces or infrastructure info, sanitize before returning on the now-public endpoint.

### 2. Quarantine information disclosure (LOW)

The status endpoint reveals `quarantineReason` and `quarantinedAt` for quarantined captures. This tells an attacker which specific content policy was violated. Currently this is behind auth; making it public is a minor information leak.

**Recommendation:** Acceptable. Quarantine reasons are already visible on the public verify endpoint (index.js:1700-1708) which returns 451 with `quarantineReason`. No change in exposure.

### 3. Rate limiting gap (MEDIUM)

The current auth gate for capture GET routes performs rate limiting only for public WACZ access (index.js:1590-1600). If all capture GET endpoints become public, they need rate limiting to prevent:
- Enumeration probing (testing sequential/pattern-based IDs at scale)
- Resource exhaustion (D1 reads + R2 fetches for artifact downloads)

**Recommendation:** Apply the existing `VERIFY_RATE_LIMITER` (per-IP) to all now-public capture GET endpoints, matching the pattern used for `/v1/verify/` and WACZ. This is the most important implementation detail.

### 4. Timing oracle on capture existence (LOW)

A 404 for "capture not found" vs. a valid response confirms whether a guessed ID exists. With 122-bit entropy this is not exploitable for enumeration, but ensure the 404 response time is consistent (no early-return for format validation vs. DB miss). The current code validates format via the route regex (`cap_[a-f0-9]{32}`) before reaching the handler, so malformed IDs get a generic 404 from the router. This is fine.

### 5. Cached responses and CDN behavior (LOW)

Currently capture GET responses use `Cache-Control: private, no-store`. If the change removes the `private` directive (since there is no longer a per-user distinction), ensure that CDN edge caches do not serve one tenant's capture data from cache to a different requester. With capability-based access, this is actually fine -- anyone with the ID is authorized -- but verify the `Cache-Control` headers are intentional.

**Recommendation:** For completed captures, `Cache-Control: public, max-age=31536000, immutable` is appropriate for artifacts (already used for artifact responses). For metadata endpoints (`/status`, `/{id}`), keep `no-store` since status can change (pending -> complete -> quarantined).

### 6. CORS implications (LOW)

The current capture GET responses include `Access-Control-Allow-Origin: *`. Making these public with wildcard CORS means any website can fetch capture data via JavaScript. This is consistent with the capability model (ID = authorization) and matches the existing verify endpoint behavior. No change needed.

---

## (d) D1 Migration Strategy for Removing share_tokens

### Foreign key constraints

The `share_tokens` table (migration 0010) has two FK constraints:
- `capture_id TEXT NOT NULL REFERENCES captures(id)`
- `tenant_id TEXT NOT NULL REFERENCES tenants(id)`

These are outbound FKs from `share_tokens` to other tables. No other table references `share_tokens`. This means:

**Dropping `share_tokens` is safe from an FK perspective.** No cascade or dependency chain is affected.

### Migration approach

D1 supports `DROP TABLE IF EXISTS` and `DROP INDEX IF EXISTS`. The migration should:

```sql
-- Migration: remove share_tokens (superseded by public capture access)
DROP INDEX IF EXISTS idx_share_tokens_expires_at;
DROP INDEX IF EXISTS idx_share_tokens_tenant;
DROP INDEX IF EXISTS idx_share_tokens_capture;
DROP TABLE IF EXISTS share_tokens;
```

**Order matters:** Drop indexes before the table to avoid any engine-level issues with dangling index references during the drop sequence (SQLite handles this, but being explicit is cleaner).

### Rollback consideration

Once the table is dropped, existing share token data is gone. If any share tokens are in circulation (shared URLs with `?token=wrl_share_...`), they will break. The migration should be coordinated with:

1. **Code change first:** Remove the share token auth path from the fetch handler (index.js:467-492). Make capture GET endpoints public.
2. **Deploy code.** At this point, share tokens still work (code still checks them) but are no longer necessary.
3. **Wait period:** Optional. If any share URLs are in active use, the old `?token=` param will be silently ignored (the endpoint is now public). No breakage.
4. **Migration second:** Drop the table in a subsequent deployment or the same one. Since the code no longer reads from the table, the drop is safe.

**Actually, the simpler approach:** Deploy code + migration together. After the code change, the share token query parameter path is removed. Any old URLs with `?token=` will work because the endpoint is now public and the token param is simply ignored by the router. The only scenario that breaks is if someone relies on the 410 Gone response for expired tokens as a signal -- unlikely.

### Code removal checklist

Files to modify/remove:
- `src/share-tokens.js` -- delete entirely
- `src/index.js` -- remove import, remove share token auth path (lines ~467-492), remove `handleCreateShare` handler, remove route for `POST /v1/captures/{id}/share`, remove `deleteExpiredShareTokens` from cron
- `test/share-token.test.js` -- delete entirely
- `SECURITY.md` -- update access model documentation
- `migrations/` -- add new migration to drop the table

---

## Summary of Recommendations (Priority Order)

| Priority | Recommendation | Rationale |
|----------|---------------|-----------|
| **HIGH** | Add per-IP rate limiting to all newly-public capture GET endpoints | Prevents enumeration probing and resource exhaustion |
| **HIGH** | Audit `captures.error` field values for information disclosure | Error details become publicly visible |
| **MEDIUM** | Switch ID generation to `crypto.getRandomValues(16)` → hex for full 128-bit entropy | Closes NIST/ANSSI compliance gap; one-line change |
| **MEDIUM** | Add `X-Robots-Tag: noindex` to capture GET responses | Prevents search engine indexing of archived content |
| **LOW** | Update SECURITY.md to document the capability-based access model | Document the security invariants for future contributors |
| **LOW** | Verify the public verify page loads zero external resources (CSP audit) | Prevents capture ID leakage via third-party subresource requests |

## Specialist Dependencies

No additional specialists needed for the security aspects. The implementation is straightforward -- removing code is easier to secure than adding code. The **database minion** (if one exists) should review the migration ordering, and the **test minion** should ensure the share token test deletion does not leave coverage gaps for the new public access paths.
