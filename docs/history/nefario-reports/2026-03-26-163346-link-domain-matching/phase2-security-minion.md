# Domain Plan Contribution: Security Assessment

**Specialist**: security-minion
**Planning question**: Redirect endpoint design -- open redirect prevention, authentication requirements, and abuse scenarios

---

## Recommendation: HMAC-Signed URL (Option 2)

After reviewing the codebase, the HMAC-signed URL approach is the clear winner. Here is the full analysis.

---

## Option Analysis

### Option 1: KV-Stored URL Lookup

Store the Stripe URL in KV keyed by an opaque token at webhook time; redirect handler looks up the token.

**Pros**: No URL in the redirect path at all; the target is server-side only. Strongest open-redirect defense -- nothing to tamper with.

**Cons**:
- **Operational fragility**: KV entries can expire, be evicted, or be purged (`handleAdminCachePurge` exists). If the KV entry is lost, the email link is permanently dead. For an invoice payment link, a dead link means a tenant cannot pay, which directly impacts revenue.
- **TTL sizing problem**: Stripe `hosted_invoice_url` remains valid for the life of the invoice (30+ days). KV TTL must be set long enough (90+ days minimum) to cover the full invoice lifecycle plus email forwarding delay. This is storage cost with no cleanup signal.
- **Adds a write dependency to the webhook path**: `handleInvoiceFinalized` currently uses `ctx.waitUntil` for non-critical work (email dispatch, logging). Adding a KV write makes the redirect URL dependent on a side effect that could silently fail without failing the webhook response.
- **Unnecessary complexity**: The target URL domain is known in advance (Stripe). Allowlisting is sufficient to prevent open redirect.

**Verdict**: Overengineered for this use case. The security benefit over HMAC is marginal, and the operational risk (dead links) is real.

### Option 2: HMAC-Signed URL (Recommended)

Encode the Stripe URL in the redirect path, signed with HMAC to prevent tampering. The codebase already has this exact pattern in `unsubscribe.js`.

**Pros**:
- **Proven pattern**: `generateUnsubscribeToken` / `verifyUnsubscribeToken` in `unsubscribe.js` does exactly this -- HMAC-SHA256 with domain-separated prefix, timing-safe verification, base64url encoding. The redirect token can reuse the same primitives.
- **No storage dependency**: The token is self-contained. No KV/D1 lookup, no TTL management, no dead links from cache eviction.
- **Stateless**: Works across edge locations without replication delay.
- **Tamper-proof**: An attacker cannot forge a valid redirect URL without the `SESSION_SECRET`. The HMAC binds the target URL to the server's secret.
- **Domain allowlist as defense-in-depth**: Even with a valid HMAC, the handler should still validate the decoded URL's domain against an allowlist. This guards against the (extremely unlikely) scenario of a compromised `SESSION_SECRET`.

**Cons**:
- **URL length**: The encoded Stripe URL makes the email link longer. Stripe `hosted_invoice_url` is roughly 80-120 characters; base64url doubles that, plus the HMAC. Total redirect URL is ~300 characters. This is well within email client limits (2083 char URL limit in older Outlook, effectively unlimited in modern clients).
- **SESSION_SECRET is a single point of failure**: If the secret rotates, outstanding email links break. This is the same risk the unsubscribe links already carry, and the project has chosen to accept it (unsubscribe tokens have no expiry specifically for this reason).

**Verdict**: Correct approach. Matches existing codebase patterns, minimal new code, no operational risk.

### Option 3: Domain-Allowlisted Redirect

Accept a URL parameter, validate it against a domain allowlist (e.g., `invoice.stripe.com`).

**Pros**: Simple to implement. No crypto, no storage.

**Cons**:
- **Textbook open redirect risk (CWE-601)**: Domain allowlisting is notoriously fragile. Subdomain matching bugs, URL parsing differentials, and future Stripe domain changes all create bypass opportunities. Examples:
  - `invoice.stripe.com.attacker.com` passes naive suffix matching
  - `invoice.stripe.com@attacker.com` passes if the parser doesn't handle userinfo
  - Stripe could change their invoice URL domain tomorrow (they have done this before -- `pay.stripe.com` vs `invoice.stripe.com` vs `checkout.stripe.com`)
- **Phishing amplifier**: If the allowlist is ever expanded (e.g., to include a Stripe checkout domain for another feature), the redirect endpoint becomes a credible phishing vector on WRL's domain. `api.webresourceledger.com/redirect?url=https://invoice.stripe.com/...` looks legitimate.
- **No integrity guarantee**: Anyone can craft redirect URLs. Even if the domain check is correct today, the endpoint can be abused to redirect to any page on the allowed domains, not just the specific invoice URL that was intended.

**Verdict**: Insufficient. A signed token prevents all of the above.

---

## Authentication Requirement

**The redirect endpoint MUST work for unauthenticated recipients.** This is non-negotiable:

1. Email recipients click links from their email client. They are not logged into WRL.
2. The existing `unsubscribe` and `verify-email` endpoints follow this exact pattern -- unauthenticated, token-authenticated via HMAC.
3. Requiring a WRL session would add friction that prevents invoice payment. A tenant who cannot pay is worse than any redirect risk.

The HMAC signature is the authentication: possession of a valid token proves the link was generated by WRL's server. This is the same trust model as the unsubscribe links.

---

## Abuse Scenarios and Defenses

### 1. Token Forgery (Redirect to Attacker Domain)

**Attack**: Attacker crafts a redirect URL with a malicious target, guesses/brutes the HMAC.
**Defense**: HMAC-SHA256 with a 256-bit `SESSION_SECRET` makes forgery computationally infeasible. The existing `importHmacKey` and `crypto.subtle.verify` implementation is timing-safe.

### 2. Token Replay (Using a Legitimate Link for Phishing)

**Attack**: Attacker obtains a legitimate redirect URL (e.g., from a compromised email) and distributes it in a phishing campaign.
**Defense**: The token redirects to a Stripe-hosted page, not an attacker-controlled page. Even replayed, the worst case is that someone sees a legitimate Stripe invoice page. No account takeover, no credential theft. Acceptable residual risk.

### 3. Open Redirect via HMAC Bypass

**Attack**: Attacker finds a way to make the handler redirect to a non-Stripe URL.
**Defense**: Defense-in-depth domain check. After HMAC verification and URL decoding, the handler MUST validate that the decoded URL's hostname is in the Stripe domain allowlist. This is not the primary defense (HMAC is), but it stops redirect abuse even if the HMAC key is compromised.

### 4. Redirect to Malicious Stripe-Lookalike

**Attack**: Attacker registers `invoice.stripe.com.evil.com` and tries to get it through the domain check.
**Defense**: The domain check must use exact hostname comparison (`url.hostname === 'invoice.stripe.com'`), not substring or suffix matching. Use the `URL` constructor's parsed `hostname` property, never string operations on the raw URL.

### 5. Link Scanning / Click Tracking Amplification

**Attack**: Email security scanners (Barracuda, Mimecast, etc.) pre-fetch email links. A 302 redirect causes the scanner to also fetch the Stripe URL, potentially triggering Stripe rate limits or marking the invoice as "viewed."
**Defense**: This is an existing problem with any email link, not specific to the redirect. No special mitigation needed. Stripe handles scanner traffic gracefully.

### 6. Enumeration / Timing Side Channel

**Attack**: Attacker sends many requests with guessed tokens to enumerate valid redirect URLs via timing differences.
**Defense**: `crypto.subtle.verify` is constant-time. The handler should return the same HTTP response (e.g., `302` to a fallback or `400`) for both invalid and expired tokens. No information leakage via response timing or body.

### 7. Parameter Pollution / URL Injection

**Attack**: Attacker appends extra parameters to the redirect URL to inject content into the Stripe page.
**Defense**: The HMAC covers the entire URL. Any modification to the URL (including query parameters) invalidates the signature. The decoded URL is used verbatim -- no parameter merging.

### 8. Volume Abuse / Resource Exhaustion

**Attack**: Attacker floods the redirect endpoint with invalid tokens to consume Worker compute.
**Defense**: The redirect endpoint should be covered by the `AUTH_RATE_LIMITER` (same as unsubscribe and verify-email routes). The rate limiter check in `index.js` at line 562-572 shows the pattern. Add the redirect route to the `isUnsubscribeRoute || isVerifyEmailRoute` check.

---

## Implementation Requirements

### Token Design

Follow the exact pattern from `unsubscribe.js`:

```
Payload: JSON { u: stripeUrl, v: 1 }
HMAC input: "redir.{base64url(payload)}"
Token format: {base64url(payload)}.{base64url(hmac)}
```

The `"redir."` prefix domain-separates redirect tokens from unsubscribe tokens and session cookies, all of which use the same `SESSION_SECRET`. This is the same design decision documented in `unsubscribe.js` lines 7-8.

### Token Generation

In `handleInvoiceFinalized` (billing.js:376-381), replace the raw `hosted_invoice_url` with a redirect URL:

```javascript
const redirectUrl = await generateRedirectToken(env.SESSION_SECRET, invoice.hosted_invoice_url);
portalUrl: `${baseUrl}/r/${redirectUrl}`
```

### Redirect Handler

New route: `GET /r/:token` (short path -- email links should be concise).

Handler logic:
1. Extract token from path
2. Verify HMAC (timing-safe, via `crypto.subtle.verify`)
3. Decode payload, extract URL
4. **Defense-in-depth**: Validate decoded URL hostname against Stripe domain allowlist
5. Return `302` with `Location` header
6. On any failure: return `302` to fallback (`/ui#billing`) -- never expose error details

### Stripe Domain Allowlist (Defense-in-Depth Only)

```javascript
const STRIPE_REDIRECT_DOMAINS = new Set([
  'invoice.stripe.com',
  'pay.stripe.com',
  'checkout.stripe.com',
  'billing.stripe.com',
]);
```

This allowlist is the second layer, not the primary defense. The HMAC is the primary defense. The allowlist catches the scenario where `SESSION_SECRET` is compromised.

### Security Headers on Redirect Response

```javascript
return new Response(null, {
  status: 302,
  headers: {
    'Location': decodedUrl,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  },
});
```

- `Cache-Control: no-store` prevents proxies from caching the redirect
- `Referrer-Policy: no-referrer` prevents WRL session info from leaking to Stripe via the Referer header (defense-in-depth; Stripe is trusted, but principle of least information)

### Rate Limiting

Add the redirect route to the existing auth rate limiter block in `index.js`. Pattern to match:

```javascript
const isRedirectRoute = pathname.startsWith('/r/');
if (!response && (isAuthRoute || isUnsubscribeRoute || isVerifyEmailRoute || isRedirectRoute) && env.AUTH_RATE_LIMITER) {
```

### Logging

Log redirect attempts at severity 3 (info). Never log the full target URL (it contains Stripe account identifiers). Log only:
- `event: 'redirect.success'` or `event: 'redirect.invalid_token'`
- Token validity (boolean)
- Request IP hash (cip)

---

## Risks and Dependencies

| Risk | Severity | Mitigation |
|------|----------|------------|
| SESSION_SECRET rotation breaks outstanding email links | Medium | Same risk as unsubscribe links; accepted. Document in runbook. |
| Stripe changes invoice URL domain | Low | Allowlist is defense-in-depth; HMAC is primary. Add new domains as discovered. Log domain check failures to detect changes early. |
| Email link length exceeds client limits | Low | ~300 chars total; well within limits. Monitor bounce rates after deployment. |
| Token reuse across environments (staging/production) | Low | SESSION_SECRET differs per environment; tokens are not cross-environment valid. |

### Dependencies

- `SESSION_SECRET` must be available in the worker environment (already is -- used by session.js and unsubscribe.js)
- The HMAC helper functions (`importHmacKey`, `toBase64url`, `fromBase64url`) should be extracted from `unsubscribe.js` into a shared module (e.g., `hmac.js`) rather than duplicated. Both unsubscribe and redirect tokens need them.
- Route registration in `index.js` route table
- Rate limiter inclusion in `index.js` auth rate limit block

---

## What NOT to Do

1. **Do not use a raw URL parameter** (Option 3). Domain allowlisting without signing is CWE-601.
2. **Do not require authentication**. Email recipients must be able to click through without logging in.
3. **Do not add TTL/expiry to the token**. Stripe invoices are valid for 30+ days. Email forwarding adds unbounded delay. Match the unsubscribe token design (no expiry).
4. **Do not log the decoded URL**. It contains Stripe account identifiers (`acct_xxx`).
5. **Do not redirect on HMAC failure**. Return a static fallback redirect to `/ui#billing`, not a 4xx error page. Invalid tokens should not leak information about the expected format.

---

## Scope Boundary

This assessment covers the redirect endpoint design only. Implementation of the HMAC token generation/verification code, route registration, and email template changes should be handled by the implementing agent. Test coverage (that forged tokens are rejected, that valid tokens redirect correctly, that the domain allowlist is enforced) should be specified by the test minion.
