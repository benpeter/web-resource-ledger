MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Build a static landing page for WRL at webresourceledger.com. Plain HTML/CSS, no JS frameworks. Uses the WRL brand design system. Deployed on Cloudflare Pages/Workers Static Assets. Sections: hero, how-it-works, use cases, pricing, footer. Lighthouse perf >= 95, a11y >= 90. Responsive. Deploy via CI on push to main.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase2-ux-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase2-product-marketing-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase2-seo-minion.md

## Key consensus across specialists:

## Summary: iac-minion
Phase: planning
Recommendation: Separate Workers Static Assets project in landing/wrangler.toml with custom_domain for webresourceledger.com. CI copies design-system.css and logo into place before deploy. No build step.
Tasks: 8 -- wrangler.toml; _headers; public/ structure; gitignore; deploy-landing.yml; manual deploy; DNS/SSL verify; www redirect
Risks: DNS conflict; API token scope; design system coupling; no preview deploys
Conflicts: ux-design-minion recommends 11ty integration; iac-minion recommends standalone static
Full output: phase2-iac-minion.md

## Summary: ux-design-minion
Phase: planning
Recommendation: landing.css as consuming module for design-system.css. Dark hero/footer bookends, alternating section backgrounds, fluid clamp() typography, 3 breakpoints (768/1024/1120px). No decorative illustrations.
Tasks: 7 -- landing.css; landing.html; layout template; btn--lg and btn--inverse; contrast verification; responsive testing; heading hierarchy validation
Risks: Type scale gap; CSS-only nav; thin font weight on dark bg; 11ty vs standalone decision
Conflicts: Recommends 11ty integration vs iac-minion standalone
Full output: phase2-ux-design-minion.md

## Summary: product-marketing-minion
Phase: planning
Recommendation: Tagline "Web evidence you can prove." CTA "Read the docs" + secondary "Verify a capture". Tiers: Explore (free), Evidence (pro), On-Premise (enterprise). Heading "Built for teams who need proof, not promises."
Tasks: 6 -- hero; how-it-works; use cases; pricing; footer; copy review
Risks: Mixed audience tension; pricing placeholder expectations; "evidence" legal implications; pre-1.0 honesty; docs site health
Conflicts: none
Full output: phase2-product-marketing-minion.md

## Summary: seo-minion
Phase: planning
Recommendation: 3 JSON-LD blocks (Organization, WebSite, SoftwareApplication). Full OG/Twitter meta tags. 1200x630 OG image. robots.txt + sitemap.xml. Omit pricing Offers from JSON-LD if placeholder.
Tasks: 6 -- meta tags; JSON-LD; OG image; robots.txt + sitemap; heading hierarchy; post-deploy validation
Risks: Pricing data mismatch; missing OG image; docs sitemap (follow-up); indexing delay
Conflicts: seo-minion and product-marketing need alignment on whether pricing numbers are specific enough for structured data
Full output: phase2-seo-minion.md

## Conflicts to Resolve

1. **Deployment: standalone vs 11ty integration**
   - iac-minion: Standalone landing/ directory, no build step, CI copies shared assets
   - ux-design-minion: 11ty integration with landing.njk template
   - Resolution needed: This is the key architectural decision

2. **Pricing structured data**
   - seo-minion: Include Offers if specific prices; omit if vague/placeholder
   - product-marketing: Tiers use "Coming soon" badges; no specific prices
   - Resolution: Omit Offers from JSON-LD (follow seo-minion guidance)

3. **File locations depend on deployment decision**
   - Standalone: landing/public/index.html, landing/public/css/landing.css
   - 11ty: site/content/landing.html, site/css/landing.css

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions (read the full files)
2. Resolve the conflicts above -- especially the deployment architecture
3. Create the final execution plan with self-contained task prompts
4. Consider: CLAUDE.md says "KISS" and "minimize code and dependencies actively". A standalone HTML file with no build step is simpler than integrating into 11ty.
5. Consider: The landing page is on a DIFFERENT domain (webresourceledger.com) than the docs site (docs.webresourceledger.com). This argues for separate deployment.
6. Keep task count minimal -- this is a static HTML/CSS page, not a complex application.
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase3-synthesis.md
