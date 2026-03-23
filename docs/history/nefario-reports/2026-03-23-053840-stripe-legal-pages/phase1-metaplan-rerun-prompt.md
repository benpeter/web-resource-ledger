MODE: META-PLAN

You are creating a revised meta-plan after a team adjustment.

## Task

Host Stripe-required legal and policy pages on webresourceledger.com so the
site passes Stripe's business website verification. All pages served as static
HTML under the existing landing site (Cloudflare Workers Static Assets).

Business Identity: Gerhard Benjamin Peter, Weidenhäuser Str. 73, 35037 Marburg, Germany, bp@ben-peter.com

Success Criteria:
1. `/privacy` — Privacy Policy (new content, GDPR-compliant)
2. `/refund-policy` — Refund & Dispute Policy (new content, usage-based pricing)
3. `/terms` — Terms of Service (convert existing TERMS.md to HTML)
4. `/content-policy` — Content Policy (convert existing CONTENT-POLICY.md to HTML)
5. All pages use the same design system/layout as the landing page
6. Landing page footer updated with links + operator identity + contact details
7. All pages publicly accessible, crawlable, in sitemap.xml

Scope In: Privacy Policy, Refund Policy, Terms page, Content Policy page, footer updates, sitemap
Scope Out: Cookie consent, GDPR CMP, Impressum, dynamic CMS
Constraints: Pure HTML + CSS, no JS framework, match landing page visual style, $40 budget

## Original Meta-Plan
Read from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-pvuyDB/stripe-legal-pages/phase1-metaplan.md

The following meta-plan was produced for the original team. Use it as context
for the revised plan, not as a template to minimally edit.

## Team Adjustment
Added: (none)
Removed: ux-strategy-minion, seo-minion

Rationale for removal:
- ux-strategy-minion: Refund policy is simple legal content (usage-based, no subscription), not a UX strategy question. Security-minion can cover both privacy and refund policy content.
- seo-minion: Static HTML is crawlable by default. Sitemap update is a trivial XML edit. Meta tags are within frontend-minion's capability.

Revised team: security-minion, frontend-minion

## Instructions
- Keep the same scope and task description
- Preserve external skill integration decisions (none detected)
- Generate planning consultations for ALL agents in the revised team
- Re-evaluate the cross-cutting checklist against the new team
- Produce output at the same depth and format as the original
- Do NOT change the fundamental scope of the task
- Do NOT add agents the user did not request
- Design planning questions as a coherent set -- each question should address aspects that no other agent on the team covers

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvety-sparking-mist

## Codebase Context

Landing page at `landing/public/`:
- `index.html` — main page with header, hero, sections, footer
- `css/design-system.css` — design tokens and base components
- `css/landing.css` — landing-specific styles
- `sitemap.xml` — currently homepage only
- Deployed via Cloudflare Workers Static Assets (wrangler.toml)

Existing legal docs at repo root:
- `TERMS.md` — complete Terms of Service
- `CONTENT-POLICY.md` — complete Content Moderation Policy

Write your complete revised meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-pvuyDB/stripe-legal-pages/phase1-metaplan-rerun.md`
