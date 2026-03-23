## Meta-Plan (Revised)

### Planning Consultations

#### Consultation 1: Privacy Policy and Refund Policy Content

- **Agent**: security-minion
- **Planning question**: Draft the full legal text for two new pages: (1) a GDPR-compliant Privacy Policy for WRL, and (2) a Refund & Dispute Policy for a usage-based SaaS with pricing tiers (free, usage-based paid, enterprise). For both, consider: What data does WRL collect about its users (not the captured content -- that is covered in TERMS.md)? What does Stripe require seeing in these policies to pass business website verification? What GDPR obligations apply to a sole proprietor based in Germany?

  **Context to provide**:
  - `TERMS.md` -- existing terms of service (contains a "Data Handling" section describing what WRL stores per capture; this is about captured content, NOT about user account data)
  - `CONTENT-POLICY.md` -- existing content moderation policy
  - Business identity: Gerhard Benjamin Peter, Weidenhaeuser Str. 73, 35037 Marburg, Germany, bp@ben-peter.com
  - WRL uses GitHub OAuth for authentication (no email/password accounts)
  - Payment processing will be via Stripe (usage-based billing, monthly)
  - WRL is a Cloudflare Workers service; user request metadata (IP, headers) is transient
  - Pricing tiers: Explore (free, rate-limited), Evidence (usage-based, paid monthly), On-Premise (enterprise, custom)
  - The privacy policy must cover WRL's own data processing (account data, billing, analytics, cookies), not the third-party personal data that may appear in captures (already addressed in TERMS.md "Personal data in captures" section)
  - The refund policy must address: digital services / usage-based model, EU right of withdrawal, dispute resolution via Stripe, no refunds for consumed captures (usage already delivered), prorated handling for subscription cancellations

- **Why this agent**: Security-minion handles GDPR compliance, privacy policy content, and data handling practices. The refund policy intersects with payment security and dispute handling. Both documents need to be legally sound from a data protection and operational security perspective.

#### Consultation 2: HTML Implementation, Layout, and Footer Restructuring

- **Agent**: frontend-minion
- **Planning question**: Plan the HTML implementation for 4 legal/policy pages (`/privacy`, `/refund-policy`, `/terms`, `/content-policy`) that reuse the existing landing page design system. Specifically: (1) What is the optimal page structure for long-form legal content using the existing `design-system.css` and `landing.css` -- does the existing CSS have sufficient typographic styles for prose content (headings, paragraphs, lists, nested lists), or do we need a small `legal.css` addition? (2) How should the footer be restructured to add: operator identity (Gerhard Benjamin Peter, address, email), links to all 4 legal pages, and contact details -- while keeping it clean on mobile? (3) For Cloudflare Workers Static Assets, should the 4 pages live as `privacy/index.html`, `terms/index.html`, etc. (directory-based clean URLs) or `privacy.html`, `terms.html` (flat files)? (4) What updates are needed for `sitemap.xml` and what meta tags should each page have?

  **Context to provide**:
  - `landing/public/index.html` -- current landing page (header/footer structure, meta tags pattern, structured data)
  - `landing/public/css/design-system.css` -- shared design tokens and components
  - `landing/public/css/landing.css` -- landing page styles (footer styles at section 13, button extensions, container, etc.)
  - `landing/public/404.html` -- existing secondary page (shows the pattern for non-index pages: uses `/#how-it-works` prefixed links, inline SVG instead of img for logos)
  - `landing/public/sitemap.xml` -- current sitemap (just the root URL)
  - `landing/public/robots.txt` -- current robots.txt
  - `landing/wrangler.toml` -- Cloudflare Workers Static Assets config (directory = "./public")
  - The footer currently links to Terms and Content Policy on GitHub (raw markdown) -- these must become internal links
  - The footer currently has no operator identity or contact information
  - The 404.html already demonstrates a secondary page pattern (different nav links, inline SVG)
  - CSP is `script-src 'none'` -- no JavaScript allowed on landing pages
  - Existing CSS has no prose/article typography (headings inside content sections use small uppercase `.section h2` style, not suitable for legal document headings)

- **Why this agent**: Frontend-minion owns HTML page creation, CSS architecture decisions (extend vs. new stylesheet), footer layout changes, sitemap/meta tag updates, and ensuring all pages work within the Cloudflare Static Assets deployment model. They determine the file structure, shared layout patterns, and any CSS additions needed for long-form content.

### Cross-Cutting Checklist

- **Testing**: Exclude from planning. Output is static HTML with no executable logic. Verification is visual (pages load, links work) and can be done via `curl` and browser check during execution. Phase 6 post-execution will handle link validation if needed.
- **Security**: Included as Consultation 1. Security-minion drafts both new legal documents and reviews GDPR compliance, data handling disclosures, and Stripe verification requirements.
- **Usability -- Strategy**: Excluded per reviewer direction. Legal content pages have a standard, well-understood format. No journey mapping or cognitive load analysis needed.
- **Usability -- Design**: Excluded from planning. Legal pages follow a simple prose layout. Frontend-minion covers the CSS/layout decisions. No novel interaction patterns.
- **Documentation**: Exclude from planning. The deliverables ARE the documentation (legal pages). No separate architecture or API docs needed. Phase 8 post-execution will assess if evolution log or README updates are warranted.
- **Observability**: Exclude. Static HTML pages served by Cloudflare. No runtime components, no logging, no metrics.

### Notable Exclusions

- **ux-design-minion**: Legal pages are long-form text with a standard layout (header, prose body, footer). No UI components, interaction patterns, or visual design decisions beyond what frontend-minion covers with the existing design system.
- **software-docs-minion**: No architecture or API surface changes. The deliverables are the documents themselves.
- **accessibility-minion**: The existing landing page already has accessibility foundations (skip links, ARIA labels, focus styles, semantic HTML). Frontend-minion will follow the same patterns for the new pages. No novel accessibility challenges in static legal content.

### Anticipated Approval Gates

- **Privacy Policy and Refund Policy content** (security-minion output): MUST gate. These are legal documents with the operator's name and address, GDPR obligations, and Stripe-facing commitments. Hard to reverse once published and linked from Stripe. Multiple valid approaches exist for refund terms and GDPR scope. The user must review the actual legal text before it gets committed to HTML.

- **No gate on HTML implementation**: The HTML/CSS work is additive, easily reversible, and follows established patterns from the existing landing page. Frontend-minion applies the design system to the approved legal content.

### Rationale

Two specialists cover the full scope with clean separation:

**security-minion** handles the content layer -- the words on the page. Both new documents (Privacy Policy, Refund Policy) involve GDPR compliance, payment processing disclosures, and Stripe verification requirements. These are security and compliance domain questions, not frontend questions. The two existing documents (TERMS.md, CONTENT-POLICY.md) already have approved content and just need conversion to HTML.

**frontend-minion** handles the presentation layer -- turning content into HTML pages within the existing site. This includes: page file structure for Cloudflare Static Assets, CSS for long-form prose content, footer restructuring with operator identity and legal links, sitemap updates, and meta tags. The 404.html provides an existing pattern for secondary pages.

The two agents have zero file overlap: security-minion produces markdown/text content; frontend-minion produces HTML, CSS, and XML files under `landing/public/`.

### Scope

**In scope:**
- New page: `/privacy` -- Privacy Policy (new content, GDPR-compliant)
- New page: `/refund-policy` -- Refund & Dispute Policy (new content, usage-based pricing)
- New page: `/terms` -- Terms of Service (convert existing TERMS.md to HTML)
- New page: `/content-policy` -- Content Policy (convert existing CONTENT-POLICY.md to HTML)
- All 4 pages use same header/footer and design system as landing page
- Footer updated with: links to all 4 legal pages, operator identity, contact email
- Footer updates applied to index.html and 404.html as well
- `sitemap.xml` updated with all 4 new URLs
- Standard meta tags on each page (title, description, canonical, robots)

**Out of scope:**
- JavaScript (CSP is `script-src 'none'`)
- Structured data / JSON-LD on legal pages (not needed for Stripe verification)
- Changes to design-system.css (extend in a separate stylesheet if needed)
- Changes to robots.txt (already allows all)
- Wrangler config changes (Static Assets serves the `public/` directory as-is)
- Stripe integration itself (this is just the website content Stripe needs to see)
- Changes to TERMS.md or CONTENT-POLICY.md source files (the HTML pages are the canonical versions going forward, but we do not delete the markdown originals)

### External Skill Integration

No external skills detected in project.
