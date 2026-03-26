## Security Review: link-domain-matching delegation plan

**Verdict: APPROVE**

The plan is security-sound. My review of the existing HMAC implementations in `src/unsubscribe.js` and `src/email-verify.js` confirms the pattern being replicated is correct: `crypto.subtle.verify` for timing-safe comparison, domain-prefixed HMAC input (`"inv.{payload}"`), base64url encoding throughout, no-throw verification returning structured `{ ok, reason }` results. The implementation spec follows this exactly.

### What I verified

**HMAC correctness** -- The existing implementations use `crypto.subtle.verify` (timing-safe), HMAC-SHA256 with the SESSION_SECRET imported as a hex key. The `"inv."` domain prefix in the HMAC input correctly prevents cross-domain token reuse against `"unsub."` and `"emailverify."` tokens. This is the same key reuse/separation model already in production.

**Open redirect** -- The allowlist check (`new Set(['invoice.stripe.com'])` against `new URL(decoded.u).hostname`) is defense-in-depth after HMAC verification. Using `URL.hostname` rather than string operations correctly handles port stripping and case normalization. The `"inv."` HMAC prefix means a valid HMAC from another token type cannot be repurposed here even with a matching domain.

**Domain allowlist bypass** -- Tested mentally: crafting a token with `https://evil.com` in the payload requires generating a valid HMAC for `"inv.{payload}"` using SESSION_SECRET, which is infeasible without the key. The test spec includes `wrong domain in payload: craft a token with https://evil.com/invoice in payload, use valid HMAC` -- this correctly exercises the allowlist as a second layer. `new URL().hostname` handles `https://invoice.stripe.com.evil.com` correctly (returns `invoice.stripe.com.evil.com`, fails the set check).

**Token forgery / cross-domain token reuse** -- The `"inv."` prefix domain-separation is the correct mitigation. An unsubscribe token with `"unsub."` prefix will produce a different HMAC over the same payload, so cross-use is cryptographically blocked. The test spec includes a cross-domain token test case to verify this at runtime.

**Rate limiting** -- Assigning `/v1/billing/invoice` to the `'auth'` rate limit group (10 req/min per IP based on unsubscribe.js comments) is appropriate. This endpoint is unauthenticated and performs a cryptographic operation on attacker-controlled input, so rate limiting is the correct control.

**Auth gate exemption** -- Exact pathname match (`pathname === '/v1/billing/invoice'`) before the `startsWith('/v1/billing/')` check is the correct implementation. No other `/v1/billing/` routes are exposed unauthenticated.

**Information leakage** -- The plan correctly prohibits logging the decoded Stripe URL (Stripe URLs contain `acct_` identifiers). The 200 HTML error response for invalid tokens matches the existing pattern and avoids leaking token validity via status code differentiation.

**No-expiry decision** -- Acceptable for this use case. Stripe invoice URLs are long-lived (Stripe keeps them valid for months). The trade-off (SESSION_SECRET rotation invalidates outstanding links) is documented and accepted, consistent with the unsubscribe token design. Users retain dashboard access as a fallback.

**Missing token payload fields** -- The spec requires validating `parsed.v === 1` and rejecting if `new URL(decoded.u)` throws (malformed URL). The instruction to use `new URL()` for hostname extraction inherently catches malformed URLs -- the spec says "never throws", so the URL parse must be inside a try/catch. The implementing agent should ensure the URL parse is guarded; this is implied by the pattern but not made explicit. Flag for implementation attention: the `verifyInvoiceRedirectToken` function must wrap `new URL(decoded.u)` in a try/catch and return `{ ok: false, reason: 'invalid_url' }` on failure, or the handler will throw on a crafted payload containing a non-URL string in `u`.

### One implementation-level note (not a blocker)

The spec says `verifyInvoiceRedirectToken` "never throws -- all errors returned as `{ ok: false, reason }`". The domain check uses `new URL(decoded.u).hostname`. If `decoded.u` is not a valid URL string, `new URL()` throws a `TypeError`. The implementing agent must place the domain check inside the existing try/catch or a dedicated try/catch. This is an obvious implication of the "never throws" contract but worth stating explicitly given it is the only place in the verify function that can throw after the HMAC verification step.

No other gaps found.
