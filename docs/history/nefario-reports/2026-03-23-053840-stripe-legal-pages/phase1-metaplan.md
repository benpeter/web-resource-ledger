# Meta-Plan: Stripe Legal Pages for webresourceledger.com

## Planning Consultations

### Consultation 1: Legal Content Strategy and GDPR Compliance
- **Agent**: security-minion
- **Planning question**: What must the Privacy Policy cover for a GDPR-compliant service operated by a sole proprietor in Germany that processes web captures via API (GitHub OAuth login, API keys, IP-based rate limiting, Cloudflare Workers + KV storage)? What are the minimum viable sections for Stripe's business verification? Are there GDPR obligations triggered by adding these pages that we should address now vs. defer (e.g., data subject access request procedures, DPA references)?
- **Context to provide**: TERMS.md (existing "Data Handling" section describes what WRL stores), CONTENT-POLICY.md (existing abuse reporting contact), the business identity (sole proprietor in Germany), the fact that WRL uses GitHub OAuth, Cloudflare Workers, Cloudflare KV, and a third-party RFC 3161 timestamp authority.
- **Why this agent**: Security-minion covers GDPR compliance, data protection assessment, and can identify what a Privacy Policy must contain to satisfy both Stripe verification and EU data protection law. This is the highest-risk content decision -- getting the Privacy Policy wrong has legal consequences.

### Consultation 2: Refund Policy Design for Usage-Based Pricing
- **Agent**: ux-strategy-minion
- **Planning question**: The pricing page shows "usage-based" pricing that isn't live yet (all tiers say "Coming soon"). The Refund Policy needs to cover a service that (a) is currently free, (b) will move to usage-based billing. What should the Refund/Dispute Policy communicate about refund eligibility for usage-based API consumption? What's the simplest honest policy that satisfies Stripe while being fair to users? Should the policy distinguish between the free tier (no refunds because no payment) and the paid tier (partial refund scenarios)?
- **Context to provide**: Pricing section from index.html (Explore=free, Evidence=usage-based, On-Premise=enterprise), the fact that the product captures web pages on-demand (each capture consumes resources immediately).
- **Why this agent**: UX Strategy owns "what should we communicate and why" -- this is a user journey question about setting expectations for payment disputes, not a visual design question. The policy wording directly affects user trust and Stripe's evaluation.

### Consultation 3: Page Layout and Footer Restructuring
- **Agent**: frontend-minion
- **Planning question**: We need to create 4 new HTML pages (`/privacy`, `/refund-policy`, `/terms`, `/content-policy`) that share the landing page's header, footer, and design system. The current site is pure static HTML with no templating. What's the simplest approach for creating these pages while keeping the header/footer consistent? Should we extract a shared CSS file for the legal page layout (since all 4 share a "prose content" pattern not in the current design system)? The footer needs restructuring: current single `<nav>` becomes organized groups (Product links, Legal links, contact info). How should the footer markup and CSS be restructured?
- **Context to provide**: index.html (header and footer markup), design-system.css (existing tokens and components), landing.css (landing-specific styles), wrangler.toml (static assets deployment from `landing/public/`).
- **Why this agent**: Frontend-minion understands HTML/CSS architecture, can recommend whether to add a `legal.css` or extend landing.css, and how to structure the footer into grouped navigation without introducing unnecessary complexity.

### Consultation 4: SEO and Crawlability for Legal Pages
- **Agent**: seo-minion
- **Planning question**: The current sitemap.xml has only the homepage. We need to add 4 legal pages. Beyond sitemap updates, what structured data (schema.org) should each legal page include? Should the legal pages have `noindex` (since they exist for Stripe verification, not organic traffic) or should they be indexed (since they build trust and Stripe may check crawlability)? What meta tags and canonical URLs are needed? Should the existing Organization structured data be updated (e.g., add `contactPoint` email, add legal page references)?
- **Context to provide**: Current sitemap.xml, existing structured data from index.html (Organization and SoftwareApplication schemas), the requirement that pages must be "publicly accessible, crawlable."
- **Why this agent**: SEO-minion can determine the right indexing strategy for legal pages and ensure structured data supports Stripe's verification crawl.

## Cross-Cutting Checklist

- **Testing**: Exclude from planning. The deliverables are static HTML pages -- no code logic, no API endpoints, no configuration that could break. Post-execution Phase 6 can verify that pages load correctly via a simple HTTP check, but test-minion's planning input is not needed.
- **Security**: INCLUDE (Consultation 1). The Privacy Policy content has GDPR compliance implications. Security-minion's planning input on what the privacy policy must contain is critical.
- **Usability -- Strategy**: INCLUDE (Consultation 2). Refund policy framing is a user expectations question. Also, ux-strategy-minion should review the overall information architecture of the footer restructuring (what links go where, what information is surfaced).
- **Usability -- Design**: Exclude from planning. The visual design is constrained to match the existing design system. There are no new interaction patterns or novel UI components -- just prose pages with the existing header/footer. Design decisions are limited to "add a prose content layout." The mandatory Phase 3.5 review by ux-design-minion will catch any visual hierarchy issues.
- **Documentation**: Exclude from planning. The deliverables ARE the documentation (legal pages). No architecture changes, no API changes, no user-facing feature changes that need separate documentation. Phase 8 assessment will confirm.
- **Observability**: Exclude from planning. Static HTML pages served by Cloudflare Workers Static Assets. No new runtime components, no logging, no metrics beyond what Cloudflare already provides.

## Notable Exclusions

- **accessibility-minion**: Legal pages are prose-heavy HTML with the existing design system's accessibility features (skip links, focus styles, semantic markup). The mandatory Phase 3.5 review will catch any a11y issues. Planning input is not needed -- the accessibility patterns are already established in the existing codebase.
- **iac-minion**: Deployment is already configured (Cloudflare Workers Static Assets from `landing/public/`). New HTML files placed in the directory are automatically deployed. No infrastructure changes needed.
- **api-design-minion**: No API surface changes. The legal pages are static content served alongside the existing landing page.

## Anticipated Approval Gates

1. **Privacy Policy content** (MUST gate): Hard to reverse once published and referenced by Stripe. GDPR compliance implications. All other pages are lower risk (Terms and Content Policy already exist as markdown; Refund Policy is simpler). The Privacy Policy is new content with legal obligations -- user must review before it goes live.
2. **Footer restructuring** (OPTIONAL gate): The footer changes affect the landing page's only navigation area. Easy to reverse (it's HTML/CSS), but the business identity and contact details being added are personally identifiable information that the user should verify. Likely consolidate with execution plan approval rather than a separate gate.

## Rationale

This task is primarily a frontend implementation job (4 HTML pages + CSS + footer update) with two domain-specific planning questions that benefit from specialist input:

1. **What should the Privacy Policy contain?** -- This is a compliance question that security-minion can inform, since getting it wrong has legal consequences under GDPR.
2. **How should the Refund Policy frame usage-based pricing?** -- This is a user expectations question that ux-strategy-minion can inform, since the policy wording affects trust and Stripe evaluation.
3. **How should the pages be structured?** -- Frontend-minion can recommend the simplest HTML/CSS architecture that keeps the 4 new pages consistent with the existing landing page without introducing a build system or templating.
4. **How should crawlability be handled?** -- SEO-minion can determine the right indexing/sitemap strategy for pages that exist primarily for Stripe verification but should also be discoverable.

The existing TERMS.md and CONTENT-POLICY.md are complete -- they just need conversion to HTML with the site's design. The Privacy Policy and Refund Policy need new content, which is where specialist planning input adds value.

## Scope

**In scope:**
- 4 new HTML pages at `/privacy`, `/refund-policy`, `/terms`, `/content-policy`
- Privacy Policy content (new, GDPR-compliant)
- Refund & Dispute Policy content (new, usage-based pricing)
- Terms of Service page (convert TERMS.md to HTML)
- Content Policy page (convert CONTENT-POLICY.md to HTML)
- Footer restructuring with legal links, operator identity, contact details
- Sitemap.xml update with all 4 new pages
- Consistent visual design using existing design system

**Out of scope:**
- Cookie consent banner / GDPR CMP
- Impressum (German legal requirement -- explicitly excluded by user)
- Dynamic CMS or templating system
- JavaScript functionality
- Changes to the main landing page content (only footer changes)
- Privacy Policy for cookies (no cookies are set by the static site)
- Changes to the API worker or any backend code

## External Skill Integration

No external skills detected in project.
