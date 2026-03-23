Host Stripe-required legal and policy pages on webresourceledger.com so the
site passes Stripe's business website verification. All pages served as static
HTML under the existing landing site (Cloudflare Workers Static Assets).

Source: GitHub issue #131 — LEGAL: Stripe-required legal pages

## Business Identity

- Business name: Gerhard Benjamin Peter
- Address: Weidenhäuser Str. 73, 35037 Marburg, Germany
- Email: bp@ben-peter.com

## Success Criteria

1. /privacy — Privacy Policy page
2. /refund-policy — Refund & Dispute Policy page
3. /terms — Terms of Service (existing TERMS.md as HTML)
4. /content-policy — Content Policy (existing CONTENT-POLICY.md as HTML)
5. All pages use landing page design system
6. Landing page footer links updated + operator identity added
7. All pages publicly accessible, crawlable
8. sitemap.xml updated

## Scope

In: Privacy Policy, Refund Policy, Terms, Content Policy, footer updates, sitemap
Out: Cookie consent, GDPR CMP, Impressum, dynamic CMS

## Constraints

- Pure HTML + CSS, no JS framework
- Match landing page visual style (design-system.css)
- Budget: $40
