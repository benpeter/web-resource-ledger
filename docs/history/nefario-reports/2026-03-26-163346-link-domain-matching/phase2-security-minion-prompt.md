You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise to help build a comprehensive plan.

## Project Task

All links in outbound WRL emails (sent via Resend) use the WRL sending domain instead of third-party domains like invoice.stripe.com, so that spam filters don't flag domain mismatches and deliverability stays high. This requires adding a redirect endpoint that redirects to Stripe invoice URLs.

## Your Planning Question

This fix adds a redirect endpoint that 302s to a Stripe hosted_invoice_url. This is textbook open-redirect territory (CWE-601). Should the endpoint store the target URL server-side (KV/D1) and look it up by opaque token, or is domain-allowlisting sufficient? Should the redirect require authentication, or must it work for unauthenticated email recipients? What abuse scenarios must the design defend against?

## Context

### The Problem (billing.js:380)
```javascript
portalUrl: invoice?.hosted_invoice_url || `${baseUrl}/ui#billing`,
```
This passes Stripe's `hosted_invoice_url` directly to the `invoice_generated` email template.

### Existing Open Redirect Prevention
The billing checkout handler already has same-origin validation for returnUrl:
```javascript
// billing.js:75 area
const returnUrl = url.searchParams.get('returnUrl') || '/ui#billing';
if (!returnUrl.startsWith('/')) return problemResponse(400, ...);
```

### Architecture
- Cloudflare Worker with routes in src/index.js
- KV namespace available for key-value storage
- D1 database available
- Email recipients click the link unauthenticated (from their email client)
- Stripe hosted_invoice_url format: https://invoice.stripe.com/i/acct_xxx/xxx

### Design Options to Evaluate
1. **KV-stored URL lookup**: Store the Stripe URL in KV keyed by opaque token when the webhook fires, redirect by looking up the token
2. **HMAC-signed URL**: Encode the Stripe URL in the redirect URL itself, signed with HMAC to prevent tampering
3. **Domain-allowlisted redirect**: Accept any URL parameter but validate against an allowlist of Stripe domains

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-d2Z9HP/link-domain-matching/phase2-security-minion.md`
