**Outcome**: A static landing page deployed on Cloudflare Pages at a custom domain, presenting WRL to prospective users with clear value propositions, use cases, and pricing. Built with plain HTML/CSS (no framework), using the WRL brand design system.

**Success criteria**:
- Hero section with tagline, one-sentence value prop, and primary CTA (link to docs or signup)
- How-it-works section: 3-step visual flow (capture, sign, verify)
- Use cases section covering: legal evidence, compliance archiving, AI agent web grounding, journalism source preservation
- Pricing section with tier cards showing usage-based pricing (free tier, pro tier, enterprise contact)
- Footer with links to: documentation site, web UI app, GitHub repo, terms of service, privacy
- Custom domain configured with HTTPS
- Page loads in <1s on 3G (no JS frameworks, minimal assets)
- Lighthouse performance score >= 95, accessibility score >= 90
- Responsive: works on mobile, tablet, desktop
- Deployed via Cloudflare Pages on push to main

**Scope**:
- In: Single-page static HTML/CSS, hero, how-it-works, use cases, pricing, footer, Cloudflare Pages deployment, custom domain
- Out: Blog, changelog page, interactive demos, signup form (links to the web UI instead), analytics/tracking

**Constraints**:
- No JavaScript frameworks -- plain HTML and CSS only
- Brand design system (BRAND phase) and Web UI (R17) should be available so the page can link to them
- Pricing tiers are illustrative placeholders until billing (R29) ships -- must be easy to update
- Must not duplicate content from the docs site; link to it instead
