# Phase 0096: Align Email Link Domains with Sending Domain

## Source

GitHub Issue #216: "Align email link domains with sending domain to avoid spam filters"

## Task

All links in outbound WRL emails (sent via Resend) use the WRL sending domain
instead of third-party domains like invoice.stripe.com, so that spam filters
don't flag domain mismatches and deliverability stays high.

## Success Criteria

- No outbound email contains raw third-party URLs (e.g., invoice.stripe.com) as clickable links
- Stripe invoice links are proxied or redirected through the WRL domain (e.g., webresourceledger.com/invoice/...)
- Resend deliverability check no longer flags "link URLs match sending domain"
- Existing email tests pass

## Scope

- In: Email templates/content that include outbound links, link rewriting or proxy mechanism
- Out: Resend configuration, DNS/SPF/DKIM setup, email content copy, Stripe billing logic

## Constraints

- Resend (email provider)
- Stripe invoice URLs must remain functional for recipients

## Context

Resend flagged "Ensure link URLs match sending domain" with a Stripe invoice
URL as the offending link. Mismatched link domains can trigger spam filters
and reduce deliverability.
