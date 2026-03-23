## Outcome

Host Stripe-required legal and policy pages on webresourceledger.com so the
site passes Stripe's business website verification. All pages served as static
HTML under the existing landing site (Cloudflare Workers Static Assets).

## Business Identity

The Stripe account holder is a sole proprietor (Einzelunternehmer):

- **Business name**: Gerhard Benjamin Peter
- **Address**: Weidenhäuser Str. 73, 35037 Marburg, Germany
- **Email**: bp@ben-peter.com

Use this name and address on all legal pages and the landing page footer.

## Stripe Requirements (from support.stripe.com/questions/business-website-for-account-activation-faq)

The business website must include:

- [x] Business name (already on landing page as "Web Resource Ledger" -- add operator identity to footer/legal pages)
- [x] Description of goods/services (already on landing page)
- [ ] Customer service contact details (phone, email, address, contact form, or messaging)
- [ ] Refund and dispute policy
- [ ] Cancelation policy (simplified: usage-based, no subscription to cancel)
- [ ] Privacy policy (not listed by Stripe FAQ but required by Stripe Checkout and GDPR)

## Success Criteria

1. `/privacy` serves a Privacy Policy page explaining what data WRL collects,
   how it's used, retention, GDPR rights, and contact for data requests
2. `/refund-policy` serves a Refund & Dispute Policy page covering
   refund eligibility for usage-based charges and how to dispute charges
   (no subscription cancelation -- usage-based model means tenants simply stop using the service)
3. `/terms` serves the existing Terms of Service (currently only on GitHub)
4. `/content-policy` serves the existing Content Policy (currently only on GitHub)
5. All four pages use the same design system and layout as the landing page
   (header, footer, CSS custom properties from design-system.css)
6. Landing page footer updated: links point to hosted `/terms`, `/privacy`,
   `/refund-policy`, `/content-policy` instead of GitHub
7. Landing page footer includes operator identity and contact details:
   "Gerhard Benjamin Peter · Weidenhäuser Str. 73, 35037 Marburg · bp@ben-peter.com"
   -- satisfies Stripe's "customer service contact details" requirement
8. All pages accessible without authentication, crawlable by search engines
9. `sitemap.xml` updated to include the new pages

## Scope

### In

- Privacy Policy page (new content)
- Refund & Dispute Policy page (new content; cancelation is trivial under usage-based pricing)
- Terms of Service page (render existing TERMS.md as HTML)
- Content Policy page (render existing CONTENT-POLICY.md as HTML)
- Landing page footer updates (links + contact email)
- sitemap.xml update

### Out

- Cookie consent banner (no cookies used currently)
- GDPR consent management platform
- Imprint/Impressum (evaluate later based on German TMG requirements)
- Dynamic legal page CMS -- these are static HTML files

## Constraints

- Depends on 0052 (landing page exists with design system)
- Pure HTML + CSS, no JS framework needed -- these are static content pages
- Pages must match the landing page's visual style (use design-system.css)
- Keep legal language clear and honest -- these are reasonable-effort templates
  for an early-stage project, not attorney-reviewed documents (include disclaimer)
- Budget: $40 -- this is mostly content creation and HTML templating
