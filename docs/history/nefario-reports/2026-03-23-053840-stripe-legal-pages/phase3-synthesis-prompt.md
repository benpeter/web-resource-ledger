MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Host Stripe-required legal and policy pages on webresourceledger.com so the
site passes Stripe's business website verification. All pages served as static
HTML under the existing landing site (Cloudflare Workers Static Assets).

Source: GitHub issue #131

Success Criteria:
1. /privacy — Privacy Policy (new content, GDPR)
2. /refund-policy — Refund & Dispute Policy (new content, usage-based)
3. /terms — Terms of Service (convert existing TERMS.md to HTML)
4. /content-policy — Content Policy (convert existing CONTENT-POLICY.md to HTML)
5. All pages use landing page design system
6. Footer updated with links + operator identity + contact
7. All pages publicly accessible, crawlable, in sitemap.xml

## Specialist Contributions

Read these files for full contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-pvuyDB/stripe-legal-pages/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-pvuyDB/stripe-legal-pages/phase2-frontend-minion.md

## Key consensus across specialists:

### security-minion
- Complete Privacy Policy and Refund Policy texts drafted from actual codebase data flows
- Privacy Policy traces GitHub OAuth, IP hashing, session cookies, Cloudflare infra, Coralogix logs
- Refund Policy covers usage-based model with 30-day dispute window, three refund-eligible scenarios
- Risk: DPA verification with Cloudflare/Coralogix (MEDIUM)
- 1 task: legal content review gate

### frontend-minion
- Flat .html files in landing/public/ (privacy.html, terms.html, etc.)
- Cloudflare Static Assets auto-serves clean URLs (/privacy from privacy.html)
- ~80 lines of .article prose styles added to landing.css (not a separate file)
- Copy-paste header/footer across pages (acceptable for 5-6 total pages, matches 404.html pattern)
- Footer restructured: two nav columns (Product, Legal) + operator identity line
- 4 tasks: CSS styles, HTML pages, footer updates, sitemap

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions (read the scratch files)
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. The plan should have these tasks (adjust as needed):
   - Task 1: Add prose/article CSS styles to landing.css + restructure footer markup/CSS
   - Task 2: Create all 4 HTML legal pages with legal content + update footer on index.html + update sitemap.xml
   (Consider: since the legal content is already drafted by security-minion, a single frontend task can create all pages with content included. No separate content review gate needed — the plan approval gate serves this purpose since the content is visible in the scratch files.)
7. Keep the plan SIMPLE. This is static HTML content creation with a $40 budget. Minimize tasks and gates.
8. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-pvuyDB/stripe-legal-pages/phase3-synthesis.md
