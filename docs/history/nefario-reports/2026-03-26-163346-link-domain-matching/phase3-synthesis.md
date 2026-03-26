# Delegation Plan

**Team name**: link-domain-matching
**Description**: Replace raw third-party URLs in WRL outbound emails with HMAC-signed redirect URLs through the WRL domain, improving email deliverability by ensuring all clickable links match the sending domain.

## Conflict Resolution

### Domain prefix naming: "redir." vs "inv."

- **security-minion** recommended `"redir."` -- generic prefix suitable for any future redirect use case.
- **api-design-minion** recommended `"inv."` -- specific to invoice redirects, tighter domain separation.

**Chosen: `"inv."`**
Over: `"redir."`
Why: YAGNI. This token is exclusively for invoice redirects. A generic `"redir."` prefix implies future redirect types that don't exist and aren't planned. If a second redirect type is ever needed, it gets its own prefix (just as `"unsub."` and `"emailverify."` each have their own). Tighter domain separation is also better security practice -- if a vulnerability is found in one redirect path, its tokens can't be used in another.

### Route path: `/v1/billing/invoice` vs `/r/:token`

- **api-design-minion** recommended `GET /v1/billing/invoice?token=...` -- follows the `/v1/` prefix convention, matches existing query-parameter-based token patterns (unsubscribe, verify-email).
- **security-minion** recommended `GET /r/:token` -- shorter URL for emails.

**Chosen: `GET /v1/billing/invoice?token=...`**
Over: `GET /r/:token`
Why: Consistency with existing patterns wins. Every unauthenticated token endpoint in the codebase uses `?token=` query parameters (`/v1/notifications/unsubscribe?token=`, `/v1/notifications/verify-email?token=`). The codebase has zero top-level routes outside established prefixes (`/v1/`, `/auth/`, `/.well-known/`, `/ui`, `/admin`, `/health`). The URL length difference (~20 chars) is negligible against the ~300-char token. Consistency reduces cognitive load for anyone reading the route table.

### Stripe domain allowlist scope

- **security-minion** recommended a broader allowlist: `invoice.stripe.com`, `pay.stripe.com`, `checkout.stripe.com`, `billing.stripe.com`.
- **api-design-minion** recommended only `invoice.stripe.com`.

**Chosen: `invoice.stripe.com` only**
Over: broader 4-domain allowlist
Why: YAGNI again. The only URL being redirected is `hosted_invoice_url`, which uses `invoice.stripe.com`. Including domains we don't use widens the attack surface for zero benefit. If Stripe changes the domain, it's a single-line change as api-design-minion noted. The HMAC is the primary defense anyway -- the allowlist is defense-in-depth.

### Error response on invalid token: 302 fallback vs 200 HTML

- **security-minion** recommended `302` redirect to `/ui#billing` on failure -- never expose error details.
- **api-design-minion** recommended `200` HTML error page matching the unsubscribe pattern.

**Chosen: 200 HTML error page**
Over: 302 fallback redirect
Why: Matches the established pattern. Both `handleGetUnsubscribe` and `handleGetVerifyEmail` return 200 HTML for invalid tokens. This is intentional: it prevents information leakage (a 302 vs 200 distinction reveals token validity), and email security scanners handle 200 responses more gracefully. The HTML page provides a fallback link to `/ui#billing`, achieving the same user outcome without breaking pattern consistency.

### Token payload: include tenantId or not

- **api-design-minion** initially recommended URL-only payload, then revised to include `t: tenantId` for audit logging.
- **security-minion** did not include tenantId in the payload.

**Chosen: URL-only payload `{ u: stripeUrl, v: 1 }`**
Over: `{ u: stripeUrl, t: tenantId, v: 1 }`
Why: Minimalism. The tenantId is not needed for the redirect operation. Adding it to the token increases token size and creates a data coupling (if a tenant is transferred/renamed, outstanding tokens contain stale data). The redirect is a pass-through; Stripe tracks invoice views on their side. If audit logging for redirects is ever needed, the Stripe URL itself contains `acct_` identifiers that can be correlated. The `event: 'billing.invoice_redirect'` log entry is sufficient for operational observability.

### Module location

- **api-design-minion** recommended a new `src/invoice-redirect.js` module.
- **security-minion** suggested extracting shared HMAC helpers to `src/hmac.js`.

**Chosen: New `src/invoice-redirect.js` module, with duplicated HMAC helpers**
Over: shared `src/hmac.js` extraction
Why: The codebase intentionally duplicates HMAC helpers between `unsubscribe.js` and `email-verify.js` (see email-verify.js line 45-46: "duplicated from unsubscribe.js for simplicity -- both modules are self-contained and the duplication is intentional"). This is a deliberate design decision. Following the same pattern keeps the new module self-contained and avoids a refactoring side-quest that touches two existing, tested modules. Three copies is still manageable; if a fourth appears, that's the signal to extract.

---

## Task 1: Implement invoice redirect module and integrate with billing

- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task: Implement HMAC-signed invoice redirect for WRL email links

    ### Context

    All links in WRL outbound emails must use the WRL sending domain instead of
    third-party domains (e.g., `invoice.stripe.com`) so spam filters don't flag
    domain mismatches. You are implementing an HMAC-signed redirect endpoint that
    proxies Stripe invoice links through the WRL domain.

    The codebase has two existing HMAC token patterns you MUST follow exactly:
    - `src/unsubscribe.js` -- uses `"unsub."` domain prefix, no expiry
    - `src/email-verify.js` -- uses `"emailverify."` domain prefix, 24h expiry

    Both duplicate their HMAC helpers (toBase64url, fromBase64url, importHmacKey)
    intentionally for module self-containment. Your new module MUST follow this
    same pattern -- duplicate the helpers, do not extract a shared module.

    ### What to implement

    #### 1. Create `src/invoice-redirect.js`

    This new module contains three exports:

    **`generateInvoiceRedirectUrl(sessionSecret, stripeInvoiceUrl, baseUrl)`**
    - Payload: `JSON.stringify({ u: stripeInvoiceUrl, v: 1 })`
    - HMAC input: `"inv.{base64url(payload)}"` -- the `"inv."` prefix domain-separates
      these tokens from `"unsub."` and `"emailverify."` tokens
    - Token format: `{base64url(payload)}.{base64url(hmac)}`
    - Returns: full URL string `{baseUrl}/v1/billing/invoice?token={token}`
    - No expiry (matches unsubscribe token design -- invoice URLs are long-lived)

    **`verifyInvoiceRedirectToken(sessionSecret, token)`**
    - Same verification pattern as `verifyUnsubscribeToken` in `src/unsubscribe.js`
    - Returns `{ ok: true, url: decodedStripeUrl }` or `{ ok: false, reason: '...' }`
    - After HMAC verification, validate decoded URL hostname against allowlist:
      ```javascript
      const STRIPE_INVOICE_DOMAINS = new Set(['invoice.stripe.com']);
      ```
      Only `invoice.stripe.com` -- nothing else. This is defense-in-depth (HMAC is primary).
    - Use `new URL(decoded.u).hostname` for domain check -- never string operations
    - Must validate `parsed.v === 1` (version check)
    - Never throws -- all errors returned as `{ ok: false, reason }`

    **`handleBillingInvoiceRedirect(request, env, ctx, match)`**
    - Extract token from `url.searchParams.get('token')`
    - Verify via `verifyInvoiceRedirectToken`
    - On success: return 302 with these headers:
      ```javascript
      {
        'Location': verifiedUrl,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      }
      ```
    - On failure: return 200 HTML error page matching the pattern from
      `renderConfirmPage` in `src/unsubscribe.js` for invalid tokens:
      - WRL branding (wordmark header, same CSS from `DESIGN_SYSTEM_CSS`)
      - Heading: "Invalid or expired link"
      - Body: "This invoice link is not valid. You can view your invoices from the billing portal in your dashboard."
      - Link to `/ui#billing` as fallback action
      - Import `escapeHtml` from `./verify-page.js`, `DESIGN_SYSTEM_CSS` from
        `./design-system.js`, `FAVICON_SVG` from `./favicon.js`
    - Logging (via `ctx.waitUntil` + `log()`):
      - Success: `{ event: 'billing.invoice_redirect', responseStatus: 302 }` at severity 3
      - Failure: `{ event: 'billing.invoice_redirect_invalid', reason: result.reason, responseStatus: 200 }` at severity 3
      - NEVER log the decoded URL (contains Stripe account identifiers)
    - Include `// tva` signature in the module header comment

    #### 2. Modify `src/index.js`

    **Add import** (near line 32, with other billing imports):
    ```javascript
    import { handleBillingInvoiceRedirect } from './invoice-redirect.js';
    ```

    **Add route** to the routes array. Place it with the unauthenticated notification
    routes (near line 124-128), NOT with the session-gated billing routes:
    ```javascript
    // Unauthenticated invoice redirect (rate-limited via AUTH_RATE_LIMITER in fetch handler)
    ['GET', /^\/v1\/billing\/invoice$/, handleBillingInvoiceRedirect],
    ```

    **Add rate limit group** in `getRateLimitGroup()` (near line 151-155):
    ```javascript
    if (pathname === '/v1/billing/invoice') return 'auth';
    ```
    Add this BEFORE the existing `if (pathname.startsWith('/v1/account/') || pathname.startsWith('/v1/billing/'))` line.

    **Exempt from session auth gate** (near line 575):
    Change:
    ```javascript
    const isAccountRoute = pathname.startsWith('/v1/account/') || pathname.startsWith('/v1/billing/');
    ```
    To:
    ```javascript
    const isInvoiceRedirect = pathname === '/v1/billing/invoice';
    const isAccountRoute = (pathname.startsWith('/v1/account/') || pathname.startsWith('/v1/billing/')) && !isInvoiceRedirect;
    ```

    **Add to auth rate limiter** (near line 562-566):
    ```javascript
    const isInvoiceRedirectRoute = pathname === '/v1/billing/invoice';
    ```
    And update the condition:
    ```javascript
    if (!response && (isAuthRoute || isUnsubscribeRoute || isVerifyEmailRoute || isInvoiceRedirectRoute) && env.AUTH_RATE_LIMITER) {
    ```

    #### 3. Modify `src/billing.js`

    In `handleInvoiceFinalized` (around line 376-380), change:
    ```javascript
    portalUrl: invoice?.hosted_invoice_url || `${baseUrl}/ui#billing`,
    ```
    To:
    ```javascript
    portalUrl: invoice?.hosted_invoice_url
      ? await generateInvoiceRedirectUrl(env.SESSION_SECRET, invoice.hosted_invoice_url, baseUrl)
      : `${baseUrl}/ui#billing`,
    ```

    Add the import at the top of `src/billing.js`:
    ```javascript
    import { generateInvoiceRedirectUrl } from './invoice-redirect.js';
    ```

    Note: `handleInvoiceFinalized` is an async function (it already awaits other
    calls), so adding `await` here is safe.

    The email template `src/email/templates/invoice-generated.js` does NOT need
    changes -- it already receives `portalUrl` and renders it as a link.

    The `payment-failure.js` template does NOT need changes -- its `portalUrl`
    points to `/ui#billing` (the WRL dashboard), not to a Stripe URL.

    #### 4. Write tests in `test/invoice-redirect.test.js`

    Create a new test file (do NOT add to `test/billing.test.js` -- keep test files
    focused on their module). Test cases:

    **Token generation/verification unit tests:**
    - Valid token round-trips: generate then verify returns `{ ok: true, url: originalUrl }`
    - Tampered payload: modify payload portion, verify returns `{ ok: false }`
    - Tampered HMAC: modify HMAC portion, verify returns `{ ok: false }`
    - Missing token: verify returns `{ ok: false, reason: 'missing_token' }`
    - Malformed token (no dot): verify returns `{ ok: false, reason: 'malformed_token' }`
    - Wrong domain in payload: craft a token with `https://evil.com/invoice` in payload,
      use valid HMAC -- verify returns `{ ok: false, reason: 'invalid_domain' }`
    - Cross-domain token: use an unsubscribe token format (with `"unsub."` prefix) --
      verify returns `{ ok: false }`

    **HTTP handler integration tests (via SELF.fetch):**
    - GET /v1/billing/invoice?token={valid} returns 302 with correct Location header
    - GET /v1/billing/invoice?token={invalid} returns 200 HTML with error page
    - GET /v1/billing/invoice (no token) returns 200 HTML with error page
    - GET /v1/billing/invoice does NOT require session auth (no cookie needed)
    - Verify Cache-Control and Referrer-Policy headers on 302 response
    - Verify the redirect URL is NOT logged (assert log call args)

    **Integration with billing webhook:**
    - Trigger invoice.finalized webhook, verify the dispatched email contains a
      `/v1/billing/invoice?token=` URL instead of `invoice.stripe.com`
      (this may require mocking `dispatchNotification` or inspecting its args)

    Follow the test style in `test/billing.test.js` -- use `cloudflare:test` imports,
    `cleanDb` fixture, `computeStripeSignature` helper.

    ### What NOT to do

    - Do NOT extract shared HMAC helpers into a common module
    - Do NOT modify `src/unsubscribe.js` or `src/email-verify.js`
    - Do NOT modify the email template files
    - Do NOT add expiry to the token
    - Do NOT add tenantId to the token payload
    - Do NOT use path parameters (`:token`) -- use query parameter (`?token=`)
    - Do NOT add domains beyond `invoice.stripe.com` to the allowlist
    - Do NOT log the decoded Stripe URL
    - Do NOT return non-200 status codes for invalid tokens in the HTML handler

    ### Files you will create or modify

    | File | Action |
    |------|--------|
    | `src/invoice-redirect.js` | CREATE -- new module |
    | `src/index.js` | MODIFY -- import, route, rate limit, auth exemption |
    | `src/billing.js` | MODIFY -- import, replace `portalUrl` in `handleInvoiceFinalized` |
    | `test/invoice-redirect.test.js` | CREATE -- new test file |

    ### Success criteria

    - `npm test` passes (all existing tests plus new ones)
    - A valid HMAC token redirects to the Stripe URL with 302
    - A tampered/missing/malformed token shows a 200 HTML error page
    - A token with a non-Stripe domain is rejected even with valid HMAC
    - The invoice email contains a WRL domain URL, not a Stripe domain URL
    - The redirect endpoint works without session authentication
    - The redirect endpoint is rate-limited via AUTH_RATE_LIMITER

- **Deliverables**: `src/invoice-redirect.js`, modifications to `src/index.js` and `src/billing.js`, `test/invoice-redirect.test.js`
- **Success criteria**: All existing tests pass, new tests pass, redirect endpoint works unauthenticated with HMAC tokens, invalid tokens show HTML error page, rate limiting applies

---

## Cross-Cutting Coverage

- **Testing**: Covered in Task 1 -- test file is part of the implementation task. Phase 6 runs the full test suite post-execution.
- **Security**: security-minion is the executing agent for Task 1 and designed the HMAC token approach. The implementation follows their threat model (HMAC-SHA256, domain allowlist, timing-safe verification, rate limiting, no URL logging).
- **Usability -- Strategy**: Not applicable. This change is invisible to users -- they click a link in an email and arrive at the same Stripe invoice page. The only UX difference is the URL in the email, which users don't inspect. No journey change, no cognitive load change.
- **Usability -- Design**: Not applicable. No new UI is introduced. The error page for invalid tokens reuses the existing unsubscribe error page pattern (same branding, same layout).
- **Documentation**: Phase 8 handles documentation assessment. The change is internal (redirect plumbing) with no API surface for external consumers. No user-facing documentation needed. If ARCHITECTURE.md exists, the redirect module could be noted, but this is a single self-contained module -- not an architectural change.
- **Observability**: Covered in Task 1 -- logging is specified in the prompt (success/failure events at severity 3, never log decoded URLs). No new metrics or tracing needed -- this is a stateless redirect, not a service.

---

## Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None. The plan has a single task producing a single module with no UI, no multi-service coordination, no user-facing documentation changes, and no web-facing pages (the HTML error page is a fallback for invalid tokens, not a web application page).
- **Not selected**:
  - ux-design-minion: No UI components or visual layouts are produced. The error page reuses the existing unsubscribe page pattern verbatim.
  - accessibility-minion: The HTML error page is a simple static page with a heading, paragraph, and link -- the same accessible pattern already established in unsubscribe.js. No new interaction patterns.
  - observability-minion: Single stateless redirect endpoint with inline logging. No coordinated observability strategy needed.
  - sitespeed-minion: No web-facing runtime pages. The redirect is a 302 response with no body.
  - user-docs-minion: No user-facing behavior change. Users click a link, arrive at Stripe. The URL in the middle is transparent.

---

## Decisions

- **Domain prefix naming**
  Chosen: `"inv."` (specific to invoice redirects)
  Over: `"redir."` (generic redirect prefix, per security-minion)
  Why: YAGNI -- no other redirect types exist or are planned. Tighter domain separation is better security practice.

- **Route path**
  Chosen: `GET /v1/billing/invoice?token=...` (api-design-minion)
  Over: `GET /r/:token` (security-minion)
  Why: Consistency with existing token endpoint patterns (`?token=` query params) and route namespace conventions (all routes under `/v1/`).

- **Stripe domain allowlist scope**
  Chosen: `invoice.stripe.com` only (api-design-minion)
  Over: 4-domain allowlist including `pay.stripe.com`, `checkout.stripe.com`, `billing.stripe.com` (security-minion)
  Why: YAGNI. Only `hosted_invoice_url` is redirected, and it uses `invoice.stripe.com`. Narrower allowlist = smaller attack surface.

- **Error response format**
  Chosen: 200 HTML error page (api-design-minion, matches unsubscribe/verify-email pattern)
  Over: 302 redirect to `/ui#billing` (security-minion)
  Why: Pattern consistency. Both existing token endpoints return 200 for invalid tokens. This prevents information leakage via status code differentiation.

- **Module HMAC helper strategy**
  Chosen: Duplicate helpers in new module (follows email-verify.js precedent)
  Over: Extract shared `src/hmac.js` module (security-minion suggestion)
  Why: The codebase intentionally duplicates helpers for module self-containment (documented in email-verify.js comments). Following established convention avoids a refactoring side-quest.

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| SESSION_SECRET rotation breaks outstanding email links | Medium | Same accepted risk as unsubscribe/verify-email tokens. Users can still access invoices via the WRL dashboard. |
| Stripe changes `hosted_invoice_url` domain | Low | Allowlist is defense-in-depth (HMAC is primary). Single-line change to add new domain. Log `invalid_domain` failures to detect changes early. |
| Token length exceeds email client URL limits | Low | ~360 chars total; email clients support 2000+. Verified by test. |
| Auth gate exemption introduces bypass | Low | Exact path match (`pathname === '/v1/billing/invoice'`) prevents matching other `/v1/billing/` routes. The redirect handler only performs HMAC verification -- no session data is accessed. |

---

## Execution Order

```
Batch 1: Task 1 (single task -- no parallelism needed)
```

This is a single-task plan. The task is self-contained: create the module, wire the route, update the webhook handler, write tests.

---

## Verification Steps

After Task 1 completes:

1. **All tests pass**: `npm test` exits 0 (existing + new tests)
2. **Manual verification**: Generate a test token and confirm 302 redirect works
3. **Negative verification**: Confirm tampered tokens return 200 HTML error page
4. **Email content verification**: Trigger an invoice.finalized webhook in tests and verify the email contains a WRL domain URL
5. **Auth verification**: Confirm the endpoint works without session cookies
6. **Rate limit verification**: Confirm the endpoint is in the `'auth'` rate limit group
