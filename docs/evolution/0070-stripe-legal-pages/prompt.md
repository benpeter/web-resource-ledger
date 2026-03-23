Host Stripe-required legal and policy pages on webresourceledger.com so the
site passes Stripe's business website verification. All pages served as static
HTML under the existing landing site (Cloudflare Workers Static Assets).

## Business Identity

The Stripe account holder is a sole proprietor (Einzelunternehmer):

- **Business name**: Gerhard Benjamin Peter
- **Address**: Weidenhäuser Str. 73, 35037 Marburg, Germany
- **Email**: bp@ben-peter.com

Use this name and address on all legal pages and the landing page footer.

## Stripe Requirements

The business website must include:

- Business name (already on landing page as "Web Resource Ledger" -- add operator identity to footer/legal pages)
- Description of goods/services (already on landing page)
- Customer service contact details (phone, email, address, contact form, or messaging)
- Refund and dispute policy
- Cancelation policy (simplified: usage-based, no subscription to cancel)
- Privacy policy (not listed by Stripe FAQ but required by Stripe Checkout and GDPR)

## Success Criteria

1. `/privacy` serves a Privacy Policy page
2. `/refund-policy` serves a Refund & Dispute Policy page
3. `/terms` serves the existing Terms of Service (currently only on GitHub)
4. `/content-policy` serves the existing Content Policy (currently only on GitHub)
5. All four pages use the same design system and layout as the landing page
6. Landing page footer updated: links point to hosted pages instead of GitHub
7. Landing page footer includes operator identity and contact details
8. All pages accessible without authentication, crawlable by search engines
9. `sitemap.xml` updated to include the new pages

## Scope

### In

- Privacy Policy page (new content)
- Refund & Dispute Policy page (new content)
- Terms of Service page (render existing TERMS.md as HTML)
- Content Policy page (render existing CONTENT-POLICY.md as HTML)
- Landing page footer updates (links + contact email)
- sitemap.xml update

### Out

- Cookie consent banner
- GDPR consent management platform
- Imprint/Impressum
- Dynamic legal page CMS

## Constraints

- Depends on 0052 (landing page exists with design system)
- Pure HTML + CSS, no JS framework needed
- Pages must match the landing page's visual style (use design-system.css)
- Keep legal language clear and honest
- Budget: $40
