# Phase 0096 — Decisions

## Replace Stripe URL with WRL billing page

The `invoice_generated` email template received `hosted_invoice_url` from
Stripe as its `portalUrl`. This caused Resend to flag the email for domain
mismatch (link domain `invoice.stripe.com` doesn't match sending domain
`webresourceledger.com`).

Instead of building a redirect proxy (more infrastructure), we point the
email link to the WRL billing UI (`/ui#billing`) which already shows
invoices and links to Stripe from within the authenticated context. The
user experience is equivalent — they land on their billing page where
they can view and pay invoices.

## Scope was smaller than expected

Audit of all 7 email templates showed only one third-party URL: the
`hosted_invoice_url` in `invoice_generated`. All other templates already
use WRL domain URLs exclusively.
