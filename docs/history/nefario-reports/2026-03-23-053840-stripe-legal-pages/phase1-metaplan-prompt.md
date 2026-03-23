MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
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
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvety-sparking-mist

## Codebase Context

The landing page is at `landing/public/`:
- `index.html` — main landing page with header, hero, sections, footer
- `css/design-system.css` — design tokens and base components
- `css/landing.css` — landing-specific styles (header, footer, hero, sections)
- `sitemap.xml` — currently lists only the homepage
- `robots.txt`, `404.html` — standard static files
- `assets/` — favicon.svg, logo SVGs

The landing site is deployed via Cloudflare Workers Static Assets (`landing/wrangler.toml`):
- Name: wrl-landing
- Routes: webresourceledger.com, www.webresourceledger.com
- Assets from `./public` directory

Existing legal docs in repo root:
- `TERMS.md` — Terms of Service (complete, needs HTML rendering)
- `CONTENT-POLICY.md` — Content Moderation Policy (complete, needs HTML rendering)

Footer currently links to GitHub for Terms and Content Policy.
No Privacy Policy or Refund Policy exists yet.

## External Skill Discovery
No external skills found in .claude/skills/ or .skills/ directories.

## Instructions
1. Read relevant files to understand the codebase context (already provided above)
2. No external skills discovered.
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-pvuyDB/stripe-legal-pages/phase1-metaplan.md`
