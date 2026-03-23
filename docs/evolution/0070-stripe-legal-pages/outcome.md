# Outcome: Stripe-Required Legal Pages

## What Was Built

Four static HTML legal pages plus landing page footer updates, all matching the
existing design system. The pages satisfy Stripe's business website verification
requirements for account activation.

### New Files

- **privacy.html** — GDPR-compliant privacy policy covering controller identity,
  data collected (GitHub OAuth, sessions, API keys, IP pseudonymization, capture
  data, usage data), legal basis table, retention table, third-party processor
  table (Cloudflare, GitHub, Coralogix, DigiCert, Stripe), GDPR data subject
  rights, account deletion procedure, Hessian supervisory authority, international
  transfers, children's data.

- **refund-policy.html** — Refund & dispute policy for usage-based API service.
  Covers how billing works (pay-per-capture, free tier), refund eligibility
  (service errors, duplicates, billing errors), how to request a refund, dispute
  process (30-day direct window before Stripe dispute), cancellation (nothing to
  cancel under usage-based model), contact details.

- **terms.html** — Existing TERMS.md converted to HTML. Content unchanged,
  effective date preserved (2026-03-16). Added cross-link to content-policy
  abuse reporting section.

- **content-policy.html** — Existing CONTENT-POLICY.md converted to HTML.
  Content unchanged, effective date preserved (2026-03-16). Added `id="abuse-reporting"`
  anchor for cross-page linking.

### Modified Files

- **index.html** — Footer restructured: single flat nav replaced with two-column
  structure (Product / Legal). Operator identity added: "Gerhard Benjamin Peter ·
  Weidenhäuser Str. 73, 35037 Marburg · bp@ben-peter.com". GitHub link moved to
  Product column.

- **404.html** — Header updated (inline SVG replaced with img element, Sign in
  button added). Footer replaced with full two-column structure matching other pages.

- **landing.css** — Added article/prose layout styles (~80 lines): `.article`,
  headings, paragraphs, lists, tables, links. Changed footer nav from flex-wrap to
  flex-direction column. Added `.site-footer__links`, `.site-footer__heading`,
  `.site-footer__operator` classes.

- **sitemap.xml** — Four new URLs added: /terms, /privacy, /refund-policy,
  /content-policy (yearly changefreq, 0.3 priority). Homepage lastmod updated.

## Success Criteria Status

All 9 success criteria from Issue #131 are met:

1. `/privacy` — serves Privacy Policy ✓
2. `/refund-policy` — serves Refund & Dispute Policy ✓
3. `/terms` — serves Terms of Service ✓
4. `/content-policy` — serves Content Policy ✓
5. Same design system (header, footer, CSS custom properties) ✓
6. Footer links point to hosted pages ✓
7. Footer includes operator identity and contact ✓
8. All pages accessible without auth, robots: index/follow ✓
9. sitemap.xml updated ✓

## Backlog Changes

- Issue #131 (Stripe-required legal pages): completed, no new backlog entry
- No items deferred or added to parking lot
- The security-minion advisory about DPA verification is an operational task
  for Ben, not a backlog item for the codebase
