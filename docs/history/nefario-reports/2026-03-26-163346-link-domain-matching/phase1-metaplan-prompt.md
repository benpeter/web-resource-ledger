MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task

<github-issue>
**Outcome**: All links in outbound WRL emails (sent via Resend) use the WRL sending domain instead of third-party domains like invoice.stripe.com, so that spam filters don't flag domain mismatches and deliverability stays high.

**Success criteria**:
- No outbound email contains raw third-party URLs (e.g., invoice.stripe.com) as clickable links
- Stripe invoice links are proxied or redirected through the WRL domain (e.g., webresourceledger.com/invoice/...)
- Resend deliverability check no longer flags "link URLs match sending domain"
- Existing email tests pass

**Scope**:
- In: Email templates/content that include outbound links, link rewriting or proxy mechanism
- Out: Resend configuration, DNS/SPF/DKIM setup, email content copy, Stripe billing logic

**Constraints**:
- Resend (email provider)
- Stripe invoice URLs must remain functional for recipients
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/link-domain-matching

## Codebase Context

### The Problem
In `src/billing.js:380`, the `invoice.finalized` webhook handler passes Stripe's `hosted_invoice_url` directly to the email template:
```javascript
portalUrl: invoice?.hosted_invoice_url || `${baseUrl}/ui#billing`,
```
This URL is like `https://invoice.stripe.com/i/acct_xxx/xxx` -- a third-party domain that Resend flags.

### All Email Links Audit
Only ONE link in all 7 email templates uses a third-party domain:
- `invoice_generated` email: `portalUrl` = Stripe's `hosted_invoice_url` (PROBLEM)
- `payment_failure` email: `portalUrl` = `${baseUrl}/ui#billing` (OK -- WRL domain)
- `limit_reached` email: `addPaymentUrl` = `${baseUrl}/v1/billing/checkout` (OK)
- `approaching_limit` email: `addPaymentUrl` = `${baseUrl}/v1/billing/checkout` (OK)
- `capture_failure` email: all links are WRL domain (OK)
- `weekly_digest` email: all links are WRL domain (OK)
- `email_verification` email: all links are WRL domain (OK)
- All unsubscribe links: WRL domain via HMAC tokens (OK)

### Architecture
- Cloudflare Worker with routes defined in `src/index.js`
- Email sent via Resend API through a queue system (`EMAIL_QUEUE`)
- Sending domain: `notifications@webresourceledger.com`
- API domain: `api.webresourceledger.com`
- KV namespace available for key-value storage
- D1 database available

### Key Constraint
The fix must ensure the Stripe invoice URL remains functional for recipients while appearing to come from the WRL domain. A redirect/proxy endpoint is the likely approach.

## External Skill Discovery
One external skill found: `ops-runbook` (operational procedures). Classification: LEAF -- not relevant to this planning task.

## Instructions
1. Read relevant files to understand the codebase context
2. Analyze the task against your delegation table
3. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning). These are agents whose domain expertise is needed to create a good plan.
4. For each specialist, write a specific planning question that draws on their unique expertise.
5. Return the meta-plan in the structured format.
6. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-d2Z9HP/link-domain-matching/phase1-metaplan.md`
