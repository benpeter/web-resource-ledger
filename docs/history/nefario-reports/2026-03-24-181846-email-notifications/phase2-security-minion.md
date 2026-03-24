## Domain Plan Contribution: security-minion

### Summary

The email notification system introduces the first PII storage in WRL (email addresses), an unauthenticated endpoint (unsubscribe), and an outbound channel that can leak operational details. The attack surface is moderate but the compliance implications are significant. Below is a systematic security analysis covering all seven areas from the planning question, with concrete recommendations grounded in the existing codebase patterns.

---

### Recommendations

#### 1. Signed Unsubscribe URL Design: HMAC with Scoped Claims

**Recommendation: HMAC-SHA256 signed tokens, reusing the SESSION_SECRET key infrastructure.**

The codebase already has two HMAC-SHA256 patterns: session cookies (`src/session.js` -- `importHmacKey` + `crypto.subtle.sign`) and webhook signing (`src/webhook-signing.js`). A third pattern for unsubscribe tokens would be wasteful. Reuse the session HMAC key with a distinct purpose prefix to prevent cross-domain token reuse.

**Token design:**

```
unsubscribe/{base64url(payload)}.{base64url(hmac)}
```

Where payload is:

```json
{
  "t": "tenantId",
  "c": "category",       // e.g., "capture_failure", "billing", "all"
  "iat": 1711234567,     // issued-at (unix seconds)
  "v": 1                 // version -- allows future migration
}
```

**Why HMAC, not opaque DB-stored tokens:**

- Opaque tokens require a DB lookup on every unsubscribe request. That makes the unauthenticated endpoint a D1 amplification vector -- an attacker can generate millions of garbage tokens and force D1 reads.
- HMAC tokens are self-validating. The Worker rejects invalid signatures without touching D1. Only valid tokens reach the database.
- The `SESSION_SECRET` is already deployed and provisioned in both environments. No new secret infrastructure needed.

**Critical implementation details:**

- **Purpose separation**: The HMAC signed payload MUST include a fixed purpose discriminator (e.g., `"p":"unsub"` in the payload, or a prefix `unsub.` before the payload in the signed message). This prevents session cookie values from being replayed as unsubscribe tokens or vice versa. The session module signs raw `sessionId`; unsubscribe signs `unsub.{payload}`. Different input domains = no cross-use.
- **No expiry on unsubscribe tokens**: CAN-SPAM requires unsubscribe links to work for at least 30 days after sending. In practice, there is no business reason to expire them. An old email's unsubscribe link should always work. Do not add an `exp` claim.
- **Category-scoped unsubscribe**: The token encodes which notification category to unsubscribe from. The unsubscribe endpoint should also offer "unsubscribe from all" (with a separate confirmation page). The `c` field in the token enables per-category unsubscribe without auth.
- **Timing-safe HMAC verification**: Use `crypto.subtle.verify` (which is inherently constant-time in WebCrypto) rather than comparing hex strings. The session module already does this correctly at line ~203.

**Rejected alternative -- opaque tokens stored in D1:**

Would require an `unsubscribe_tokens` table, garbage collection of expired tokens, and every unsubscribe click hits D1 regardless of validity. The HMAC approach is simpler, faster, and more resistant to abuse.

#### 2. PII Risks of Storing Email Addresses in D1

**Current state: WRL stores zero PII.** The `github_users` table has `github_id` (numeric) and `github_login` (public username). IP addresses are hashed (`computeCip` in `src/ip-hash.js`). Email addresses are the first actual PII entering the system.

**Storage recommendations:**

- **Store in a dedicated `notification_preferences` table**, not in the `tenants` or `github_users` tables. Isolation simplifies deletion and audit. Schema:

  ```sql
  CREATE TABLE notification_preferences (
    tenant_id       TEXT NOT NULL PRIMARY KEY REFERENCES tenants(id),
    email           TEXT NOT NULL,
    categories      TEXT NOT NULL DEFAULT '["all"]',  -- JSON array of opted-in categories
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT,
    unsubscribed_at TEXT   -- NULL = active; set on unsubscribe
  );
  ```

- **Do not encrypt email at rest in D1.** D1 is Cloudflare-managed SQLite with encryption at rest at the infrastructure layer. Application-level encryption would prevent querying (you need to find the email to send to it) and adds complexity without meaningful security gain since the Worker has the decryption key in memory anyway. The threat model for D1 at-rest encryption is Cloudflare-as-adversary, which is out of scope (they already have your worker code and secrets).

- **Do not log email addresses.** The `log.js` INVARIANT comment (lines 9-27) already establishes that PII must not appear in logs. Email addresses must follow the same rule. Log `tenantId` only -- never the email. Add `email` to the NEVER LOG list in the `log.js` header comment.

- **Validate email format strictly.** Use a restrictive regex (no comments, no quoted local parts, no IP-literal domains -- just `localpart@domain.tld`). This prevents header injection via crafted email addresses (more in section 4). Maximum length: 254 characters (RFC 5321).

- **D1 backup exposure**: Cloudflare D1 backups contain all data. This is acceptable for now but should be documented as a residual risk. If WRL scales to thousands of tenants, consider whether backup retention policies need adjustment.

#### 3. GDPR Implications

**Legal basis: Legitimate interest for transactional/operational emails; explicit consent for marketing (not in scope).**

Capture failure alerts, billing notifications, and payment failure warnings are transactional -- they relate directly to the service the tenant is using. Under GDPR Article 6(1)(f), legitimate interest is the correct legal basis. The tenant provided their email specifically to receive these. No separate consent checkbox is needed for operational notifications.

**However, the weekly schedule digest is a gray area.** It is not triggered by a specific user action (like a failed capture or invoice). It is a periodic summary. This sits closer to marketing than transactional. Two options:

1. **Treat it as operational** (recommended for simplicity) -- the tenant opted into schedules; the digest is the operational report on those schedules. Document this rationale.
2. **Require separate opt-in** -- add `digest` as a distinct category in `notification_preferences.categories` that is NOT included by default.

**Recommendation: include `digest` in the default categories array, but make it independently unsubscribable. Document the legitimate interest basis.**

**Right to deletion (Article 17):**

- When a tenant deletes their account (or requests data deletion), the `notification_preferences` row must be deleted.
- The unsubscribe endpoint (which only sets `unsubscribed_at`) is NOT sufficient for right-to-erasure. A separate account deletion flow must `DELETE FROM notification_preferences WHERE tenant_id = ?`.
- Currently there is no account deletion endpoint. This is a pre-existing gap. The notification system does not create this gap, but it makes it more urgent because now there is actual PII to delete.

**Consent tracking:**

- Store `created_at` on the preferences row as the consent timestamp.
- Store `updated_at` on category changes.
- The `categories` JSON array serves as the consent record (what they opted into).
- `unsubscribed_at` is the withdrawal timestamp.
- This is sufficient for GDPR's accountability principle. No separate consent log table needed at current scale.

**Data minimization:**

- Store only: email address, category preferences, timestamps. No name, no phone, no address.
- The email is necessary and sufficient for the stated purpose.

#### 4. Email Injection Prevention

**Attack vector: header injection via crafted email addresses or notification content.**

If the email address or any interpolated content contains newline characters (`\r\n`), an attacker could inject additional SMTP headers (BCC to themselves, altered From, etc.). This is CWE-93 (Improper Neutralization of CRLF Sequences in HTTP Headers), applied to SMTP.

**Mitigations:**

1. **Email address validation at storage time.** Reject any address containing `\r`, `\n`, `\0`, or characters outside the printable ASCII + international range expected in email. The regex should reject these structurally:

   ```javascript
   // Strict email validation -- rejects header injection vectors
   const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
   ```

   Additionally check: `email.length <= 254`, no `\r` or `\n` anywhere, no null bytes.

2. **Use the Resend SDK, not raw SMTP.** Resend's API accepts structured JSON (`{ to, subject, html, text }`), not raw SMTP envelopes. The SDK handles header construction. This eliminates the header injection vector entirely -- the attacker cannot inject raw SMTP headers through a JSON API. This is the single most important architectural decision for email injection prevention.

3. **Template interpolation safety.** Notification content includes URLs, timestamps, error categories, and usage numbers. These are all controlled data from D1 (validated at write time). The risk is low, but:
   - Never interpolate raw `url` values from captures into email subjects or headers.
   - In HTML templates, HTML-encode all interpolated values (`&`, `<`, `>`, `"`, `'`).
   - In plain text templates, no encoding needed (plain text has no injection grammar), but still strip `\r\n` from interpolated values used in any structured position.

4. **Resend API key security.** The Resend API key (`RESEND_API_KEY`) must be stored as a Wrangler secret (like `STRIPE_SECRET_KEY`), never in `[vars]`. Add to 1Password WRL vault.

#### 5. Rate Limiting on Notification Dispatch

**Two distinct rate limiting concerns:**

**A. Outbound rate limiting (WRL sending too many emails):**

- Resend free tier: 100 emails/day, 1 email/second.
- A bug or runaway loop could exhaust the daily quota or get the API key suspended.
- **Implement an application-level daily send counter** in KV (same pattern as existing rate limit counters in `src/kv.js`). Key: `email_daily:{YYYY-MM-DD}`, increment on each send, reject when >= threshold (e.g., 80, leaving 20 as buffer).
- **Per-tenant per-category cooldown.** Prevent the same notification type from firing more than once per hour for the same tenant. Example: if a tenant has 50 captures fail in a minute, they should get ONE failure notification, not 50. Key: `email_cd:{tenantId}:{category}`, TTL 3600s.
- The capture failure notification specifically needs **batching/deduplication**: accumulate failures over a short window (e.g., 5 minutes) and send a single digest of failures rather than one email per failure.

**B. Inbound abuse on the unsubscribe endpoint:**

- The unsubscribe endpoint is unauthenticated and public. Without rate limiting, it is a target for:
  - Enumeration (trying tokens to discover valid tenant IDs -- but HMAC tokens are not enumerable, so this is low risk)
  - DDoS amplification (each request triggers a D1 write)
  - Logging noise

- **Rate limit the unsubscribe endpoint** using the existing `VERIFY_RATE_LIMITER` binding pattern (per-IP, unauthenticated). 10 requests per minute per IP is generous for legitimate use.
- The HMAC validation happens BEFORE any D1 write. Invalid tokens are rejected with zero database cost. This is the primary defense.

#### 6. Information Leakage in Notification Content

**Principle: emails transit unencrypted SMTP relays. Assume every email is readable by third parties.**

**Safe to include in emails:**
- Tenant ID (it is already in every API response and URL)
- Capture ID (`cap_` prefix -- opaque identifier, no information leakage)
- The captured URL (the tenant chose to capture it; it is in their own records)
- Timestamp of the event
- Usage numbers (capture count, percentage of quota)
- Invoice amount (the tenant is the billing party)
- Links to the WRL dashboard (which require authentication to access)
- Error category strings (e.g., "browser_timeout", "dns_error") -- these are enum values, not stack traces

**NEVER include in emails:**
- API keys or key hashes (even prefixes)
- Session tokens
- Stack traces or internal error messages
- IP addresses (captured or requester)
- R2 bucket URLs or direct artifact links (these should go through the authenticated API)
- Internal infrastructure details (worker names, D1 database IDs, queue names)
- Webhook secrets
- Other tenants' data (obviously -- but ensure notification dispatch queries are tenant-scoped)

**Specific risk -- capture failure notification:**
The spec says "URL, timestamp, error category, link to capture detail." This is safe. But ensure the "error category" is the sanitized enum value from `captures.error`, not the raw error message. Raw Playwright/browser errors sometimes include the captured page's content or response headers.

**Specific risk -- weekly schedule digest:**
Lists URLs that were captured. This is safe if the email recipient IS the tenant. But if the email is forwarded or the recipient's mailbox is compromised, the list of monitored URLs is exposed. This is an acceptable residual risk -- the tenant chose those URLs and the digest is the operational purpose.

#### 7. Unauthenticated Unsubscribe Endpoint -- Surface Area Analysis

**The unsubscribe endpoint is unauthenticated by design.** RFC 8058 (`List-Unsubscribe-Post`) requires a one-click mechanism that works without the user being logged in. This is a hard requirement for CAN-SPAM compliance and email client integration (Gmail, Apple Mail show unsubscribe buttons that POST to this URL).

**Endpoint design:**

```
POST /v1/notifications/unsubscribe
Content-Type: application/x-www-form-urlencoded

List-Unsubscribe=One-Click&token={signed_token}
```

Plus a GET handler that renders a confirmation page (for users who click the link in the email body rather than using the email client's built-in button):

```
GET /v1/notifications/unsubscribe?token={signed_token}
```

**Attack surface analysis:**

| Attack | Risk | Mitigation |
|--------|------|------------|
| Token forgery | None (HMAC-SHA256 with 256-bit key) | Cryptographic verification before any action |
| Token enumeration | None (tokens are not sequential or guessable) | HMAC output is indistinguishable from random |
| Mass unsubscribe via stolen token | Low (attacker needs access to the email) | Acceptable -- if they have the email, they could unsubscribe manually anyway |
| D1 write amplification | Low | HMAC check gates all DB writes; rate limit per IP |
| Cross-tenant unsubscribe | None | Token encodes tenant ID; no tenant parameter in the request |
| Token replay after re-subscribe | Acceptable | Idempotent -- unsubscribing twice is a no-op. If user re-subscribes and the old link is clicked, they get unsubscribed again. This is standard behavior. |
| CSRF on unsubscribe POST | N/A | No session to hijack. The token IS the authorization. RFC 8058 requires this to work without cookies. |
| Information disclosure via error messages | Low | Return the same "unsubscribed successfully" page for both valid and invalid tokens. Never reveal whether a token was valid. Actually: return 200 with a generic page for ALL requests (valid, invalid, already unsubscribed). The user sees "you have been unsubscribed" regardless. |

**Critical design decision: make the GET endpoint render a confirmation page with a form, not auto-unsubscribe on GET.** Email security scanners and link previewers (Outlook SafeLinks, Google URL proxy) make GET requests to links in emails. If GET auto-unsubscribes, every email scanner would unsubscribe the user. The GET handler must only render a page; the actual unsubscribe happens on POST (via a form submission from that page, or via the email client's RFC 8058 mechanism).

**Route placement:** The unsubscribe routes should be added to the router in `src/index.js` with a new rate limit group (e.g., `'unsubscribe'`). Do NOT reuse the `verify` group -- different threat profile.

---

### Proposed Tasks

#### Task 1: HMAC Unsubscribe Token Module
**Deliverable:** `src/unsubscribe-token.js` -- functions to generate and verify unsubscribe tokens using `SESSION_SECRET` with purpose-prefixed HMAC.
**Dependencies:** None (uses existing `SESSION_SECRET` infrastructure from `src/session.js`).
**Acceptance criteria:**
- `generateUnsubscribeToken(env, tenantId, category)` returns a URL-safe signed token
- `verifyUnsubscribeToken(env, token)` returns `{ ok: true, tenantId, category }` or `{ ok: false }`
- Purpose prefix (`unsub.`) prevents cross-use with session cookies
- No expiry claim
- Unit tests covering: valid round-trip, tampered payload, tampered signature, wrong purpose prefix, session cookie rejected

#### Task 2: Notification Preferences Schema and Data Access
**Deliverable:** D1 migration for `notification_preferences` table + data access functions in `src/db.js`.
**Dependencies:** None.
**Acceptance criteria:**
- Email validated at write time (regex + length + no CRLF)
- `getNotificationPreferences(db, tenantId)` / `setNotificationPreferences(db, tenantId, email, categories)` / `unsubscribeCategory(db, tenantId, category)` / `deleteNotificationPreferences(db, tenantId)` (for right-to-erasure)
- `unsubscribed_at` set on unsubscribe, cleared on re-subscribe

#### Task 3: Unsubscribe Endpoint
**Deliverable:** Route handlers for `GET /v1/notifications/unsubscribe` and `POST /v1/notifications/unsubscribe`.
**Dependencies:** Task 1 (token module), Task 2 (preferences table).
**Acceptance criteria:**
- GET renders confirmation page (does NOT unsubscribe)
- POST verifies HMAC token, then updates preferences
- Rate limited per-IP (new rate limit group)
- Returns identical 200 response for valid, invalid, and already-unsubscribed tokens
- Integration test confirming email scanners (GET requests) do not trigger unsubscribe

#### Task 4: Email Dispatch Rate Limiting
**Deliverable:** KV-based daily send counter and per-tenant per-category cooldown in the notification dispatch module.
**Dependencies:** Existing KV counter infrastructure (`src/kv.js`).
**Acceptance criteria:**
- Daily global send counter with configurable threshold
- Per-tenant per-category cooldown (1 hour default)
- Capture failure batching (accumulate over 5-minute window)
- Counter checked BEFORE calling Resend API

#### Task 5: Resend API Key Provisioning
**Deliverable:** `RESEND_API_KEY` stored in 1Password WRL vault and deployed as Wrangler secret.
**Dependencies:** Resend account setup (external).
**Acceptance criteria:**
- Secret in 1Password (both Production and Staging items)
- Deployed via `wrangler secret put RESEND_API_KEY`
- Never in `[vars]`, never logged
- Add to 1Password field mapping table in `CLAUDE.local.md`

#### Task 6: Log Module PII Guard Update
**Deliverable:** Update `src/log.js` header comment to add `email` to NEVER LOG list. Audit all notification-related log statements.
**Dependencies:** None (can be done first).
**Acceptance criteria:**
- `email` added to the NEVER LOG inventory in log.js
- All notification log statements log tenantId only, never email address
- Delivery failures logged with: tenantId, category, HTTP status from Resend, Resend error code -- never the email address

#### Task 7: Email Template Output Encoding
**Deliverable:** HTML encoding utility for template interpolation. Applied to all HTML email templates.
**Dependencies:** Template implementation (parallel work).
**Acceptance criteria:**
- `htmlEncode(str)` escapes `& < > " '` to HTML entities
- All interpolated values in HTML templates pass through `htmlEncode`
- URLs in `href` attributes are validated (scheme check: only `https://`)
- Plain text templates strip `\r\n` from interpolated values in structured positions (subject line)

---

### Risks and Concerns

1. **No account deletion endpoint exists.** Storing email addresses creates a GDPR right-to-erasure obligation that currently has no implementation path. The `notification_preferences` table can be deleted, but there is no user-facing "delete my account" flow. This is a pre-existing gap that becomes legally actionable with PII storage. **Severity: Medium.** Mitigate by documenting a manual deletion procedure (admin API) and tracking an account deletion endpoint as a near-term backlog item.

2. **SESSION_SECRET rotation invalidates unsubscribe tokens.** If `SESSION_SECRET` is rotated (e.g., after a suspected compromise), all previously issued unsubscribe links in sent emails become invalid. Users clicking old links would see "unsubscribed" (because we return success regardless) but no DB update occurs. **Severity: Low.** Acceptable: the user can re-unsubscribe via the dashboard, and secret rotation is a rare emergency event. If this becomes a concern, support previous-secret verification (similar to Stripe's multi-v1 signature pattern).

3. **Resend as a single point of failure.** If Resend is down, notifications are silently dropped. The spec says "email delivery failures logged" -- but there is no retry queue for failed email sends (unlike webhook dispatch which has a DLQ). **Severity: Low.** At current scale (free tier, <100 tenants), this is acceptable. If a notification fails to send, log it and move on. Do not build an email retry queue -- YAGNI.

4. **Capture failure notification spam.** A tenant with a misconfigured schedule capturing a broken URL every minute would generate 1,440 failure events per day. Without the per-category cooldown (Task 4), this exhausts the Resend daily quota for ALL tenants. **Severity: High if cooldown is not implemented.** The cooldown is not optional -- it is a hard requirement for the notification system to be safe at any scale.

5. **Email forwarding breaks unsubscribe.** If a tenant forwards the notification email to a colleague, the colleague can unsubscribe the tenant. This is inherent to the email-based unsubscribe model and is standard across the industry. **Severity: Informational.** Not fixable without requiring authentication, which would violate CAN-SPAM/RFC 8058.

6. **Cloudflare D1 availability.** The unsubscribe endpoint depends on D1 for the preferences update. If D1 is temporarily unavailable, unsubscribe fails. The endpoint returns a generic success page (to avoid information leakage), so the user thinks they unsubscribed but they did not. **Severity: Low.** Mitigate by returning a 503 page (not generic success) on D1 errors, with a "try again later" message. The user's next attempt will work.

---

### Additional Agents Needed

- **oauth-minion**: Not needed. No OAuth flows in the notification system.
- **iac-minion**: Needed for Resend API key provisioning (wrangler secret), the D1 migration file, and any new rate limiter bindings in wrangler.toml.
- **test-minion**: Needed to implement security-specific tests: HMAC token forgery rejection, email validation edge cases (CRLF injection attempts), rate limit enforcement on unsubscribe endpoint, and template XSS resistance.
