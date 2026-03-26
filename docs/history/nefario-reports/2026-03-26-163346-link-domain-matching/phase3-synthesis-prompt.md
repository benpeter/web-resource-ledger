MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

All links in outbound WRL emails (sent via Resend) use the WRL sending domain instead of third-party domains like invoice.stripe.com, so that spam filters don't flag domain mismatches and deliverability stays high.

Success criteria:
- No outbound email contains raw third-party URLs (e.g., invoice.stripe.com) as clickable links
- Stripe invoice links are proxied or redirected through the WRL domain
- Resend deliverability check no longer flags "link URLs match sending domain"
- Existing email tests pass

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-d2Z9HP/link-domain-matching/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-d2Z9HP/link-domain-matching/phase2-api-design-minion.md

## Key consensus across specialists:

### security-minion
- Recommends HMAC-signed URLs following existing unsubscribe token pattern
- Domain prefix "redir." over SESSION_SECRET as defense-in-depth
- Unauthenticated endpoint (HMAC is the auth)
- Domain allowlist of Stripe domains
- Rate limiting via AUTH_RATE_LIMITER
- No KV storage needed (avoids dead link risk from TTL/eviction)
- No token expiry (matches unsubscribe design)
- Extract shared HMAC helpers from unsubscribe.js

### api-design-minion
- Route: GET /v1/billing/invoice?token=... with query parameter pattern
- HMAC-signed token with "inv." domain prefix
- 302 Found redirect, Cache-Control: private, no-store
- Error handling: 200 HTML pages for invalid tokens (matching unsubscribe pattern)
- CRITICAL: Must exempt from /v1/billing/ session auth gate in index.js
- Rate limiting: AUTH_RATE_LIMITER group

### Convergence
Both specialists converge on HMAC-signed approach (no KV storage). Minor disagreement on domain prefix naming ("redir." vs "inv.").

## External Skills Context
No external skills detected relevant to this task.

## Codebase Context

### Key files to modify:
- src/billing.js:380 -- replace hosted_invoice_url with signed redirect URL
- src/index.js -- add GET /v1/billing/invoice route, exempt from session auth
- src/unsubscribe.js -- has existing HMAC token pattern to follow/extract

### Existing patterns to follow:
- Unsubscribe tokens: generateUnsubscribeToken/verifyUnsubscribeToken in src/unsubscribe.js
- Email verify tokens: generateVerifyEmailToken/verifyEmailToken in src/email-verify.js
- Both use HMAC-SHA256 with SESSION_SECRET and domain-separated prefixes
- Both have GET handler (render HTML form) and POST handler (process action)
- The redirect only needs a GET handler (no confirmation form needed)

## Instructions
1. Review all specialist contributions
2. Resolve the domain prefix naming conflict
3. Create the final execution plan in structured format
4. Ensure every task has a complete, self-contained prompt
5. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-d2Z9HP/link-domain-matching/phase3-synthesis.md`
