You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise to help build a comprehensive plan.

## Project Task

All links in outbound WRL emails (sent via Resend) use the WRL sending domain instead of third-party domains like invoice.stripe.com, so that spam filters don't flag domain mismatches and deliverability stays high. This requires adding a redirect endpoint that redirects to Stripe invoice URLs.

## Your Planning Question

What should the redirect path look like? Options: (a) GET /v1/billing/invoice/:token with KV-stored URL, (b) GET /invoice/:id as a vanity path, (c) signed URL with Stripe URL encoded in the path. Which fits WRL's existing route conventions (/v1/ resource paths, billing routes under /v1/billing/)? 301 or 302? Cache headers? What error response should the endpoint return for invalid/expired tokens?

## Context

### Existing Route Conventions (src/index.js)
```
POST /v1/billing/checkout   -- create Stripe Checkout session (session auth)
POST /v1/billing/portal     -- create Stripe Portal session (session auth)
POST /v1/stripe/webhook     -- Stripe webhook (public, signature-verified)
```
All API routes use /v1/ prefix. Billing routes use /v1/billing/. Routes array in src/index.js lines 66-134.

### Architecture
- Cloudflare Worker with KV and D1 bindings
- Rate limiters available (AUTH_RATE_LIMITER: 10/60s for public auth endpoints)
- Email links must work for unauthenticated recipients
- Stripe hosted_invoice_url format: https://invoice.stripe.com/i/acct_xxx/xxx

### Email Template (invoice-generated.js)
The template currently receives `portalUrl` and renders it as a CTA button:
```html
<a href="${safePortalUrl}">View Invoice</a>
```
And in plaintext:
```
Billing portal: ${portalUrl || ''}
```

### The Redirect Must
- Work without authentication (clicked from email)
- Point to a WRL domain (api.webresourceledger.com)
- Redirect to the correct Stripe invoice URL
- Handle expired/invalid tokens gracefully

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

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

Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-d2Z9HP/link-domain-matching/phase2-api-design-minion.md`
