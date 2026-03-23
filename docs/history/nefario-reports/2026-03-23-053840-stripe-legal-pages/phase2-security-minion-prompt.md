You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Host Stripe-required legal and policy pages on webresourceledger.com so the
site passes Stripe's business website verification. All pages served as static
HTML under the existing landing site (Cloudflare Workers Static Assets).

Business Identity: Gerhard Benjamin Peter (sole proprietor / Einzelunternehmer),
Weidenhäuser Str. 73, 35037 Marburg, Germany, bp@ben-peter.com

## Your Planning Question

Draft the actual legal text for two new pages:

1. **Privacy Policy** (`/privacy`): What must it cover for a GDPR-compliant service
   operated by a sole proprietor in Germany that processes web captures via API?
   The service uses:
   - GitHub OAuth for authentication (user login)
   - API keys for programmatic access
   - IP-based rate limiting (IP hashed, not stored long-term)
   - Cloudflare Workers + KV + D1 for infrastructure
   - RFC 3161 timestamps from a third-party TSA (Sectigo)
   - Ed25519 signing for capture integrity

   The Privacy Policy must satisfy both EU GDPR requirements and Stripe's
   business verification. Include: what data is collected, legal basis,
   data retention, data subject rights (access, deletion, portability),
   controller identity, contact for data requests.

2. **Refund & Dispute Policy** (`/refund-policy`): Draft a clear, honest policy
   for a usage-based API service where:
   - Captures consume resources immediately and are non-reversible
   - Pricing is usage-based (pay per capture), no subscriptions
   - Free tier exists (no payment = no refunds)
   - Cancelation is trivial: stop using the service (no subscription to cancel)
   - Stripe handles payment processing

   Cover: refund eligibility, dispute process, how to contact for billing issues.

## Context

Read these files for existing legal content and data handling details:
- `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvety-sparking-mist/TERMS.md` (existing Terms of Service — see "Data Handling" section)
- `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvety-sparking-mist/CONTENT-POLICY.md` (existing Content Policy — see abuse reporting contact)

## Constraints

- Keep legal language clear, plain-English, and honest
- These are reasonable-effort templates for a small, early-stage project, NOT attorney-reviewed
- Include a disclaimer stating this is not professional legal advice
- Stay consistent with existing terms and content policy tone/style
- Do NOT expand into cookie consent banners, GDPR CMP, or Impressum (all out of scope)
- Do NOT add sections for features that don't exist yet

## Instructions

1. Read the existing TERMS.md and CONTENT-POLICY.md
2. Draft the complete Privacy Policy text (markdown format)
3. Draft the complete Refund & Dispute Policy text (markdown format)
4. Identify any risks or concerns about the legal content
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
<expert recommendations for legal content>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

### Deliverable: Privacy Policy Text
<complete privacy policy in markdown>

### Deliverable: Refund & Dispute Policy Text
<complete refund policy in markdown>

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-pvuyDB/stripe-legal-pages/phase2-security-minion.md`
