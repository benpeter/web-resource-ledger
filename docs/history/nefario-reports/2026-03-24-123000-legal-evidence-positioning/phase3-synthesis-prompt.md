MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
R42: Legal-evidence positioning (landing + docs) — Update WRL's landing page and docs with precise FRE 901/902 and eIDAS legal-evidence framing instead of vague compliance claims. Includes landing page copy update, new "Legal Evidence" docs guide page, competitor integrity comparison, precise legal-rule references.

Success criteria:
- Landing page hero or feature section includes evidence-grade positioning with FRE 901(b)(9), 902(14), eIDAS Art 41(2)
- Docs site has a dedicated "Legal Evidence" guide page
- Landing page avoids vague terms like "FRCP compliant" or "legally admissible"
- Competitor comparison table on docs site includes integrity approach column
- Copy reviewed for accuracy: no overclaiming, every legal reference is to an actual rule/article
- R41 (certification document) NOT shipped — 902(13) must be deferred

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MyvylP/legal-evidence-positioning/phase2-gru.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MyvylP/legal-evidence-positioning/phase2-product-marketing-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MyvylP/legal-evidence-positioning/phase2-user-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MyvylP/legal-evidence-positioning/phase2-ux-strategy-minion.md

## Key consensus across specialists:

### gru
- FRE 901(b)(9): SUPPORTIVE — WRL provides cryptographic foundation, but authentication is ultimately about the proponent describing the system to the court
- FRE 902(14): STRONG — SHA-256 hashes are the canonical "digital identification process" under this rule
- FRE 902(13): FUTURE — omit until R41 ships
- eIDAS Art 41(2): STRONG if qualified TSA is deployed — use exact statutory language "presumption of accuracy of the date and time"
- Critical risk: eIDAS qualified timestamps may not be live in production (Sectigo endpoint unverified)
- Current hero "prove" is medium overclaiming risk
- Language: "designed to support authentication" not "legally admissible"

### product-marketing-minion
- Hero: keep general, make minor tweaks only ("evidence bundle" not "bundle")
- Legal Evidence use-case card: upgrade with specific FRE rule numbers, link to docs guide
- 902(13): omit from landing page entirely (not even "coming soon")
- Competitor comparison: frame as "How Verification Works" not "Integrity Approach"
- Language discipline throughout

### user-docs-minion
- Single page (not sub-pages), matches existing docs pattern
- Section order: what a capture proves → FRE 901/902 mapping → eIDAS → traditional comparison → competitor comparison → disclaimer
- Disclaimer at bottom as styled blockquote, not at top
- Nav placement: after Verification, before Batch Captures
- Cross-reference verification.md rather than duplicating trust model

### ux-strategy-minion
- Legal depth on docs site, landing page card gets one layer of specificity
- ALL four use-case cards should get comparable link treatment (parity)
- Docs guide must work as standalone entry point (lawyers arrive via search)
- Competitor comparison inside guide, not standalone page
- Legal professionals evaluate by reading, not by trying the API

## External Skills Context
No external skills detected.

## Codebase Context

### Files to modify:
- `landing/public/index.html` — landing page (hero lines 101-113, use-case cards lines 148-175)
- `site/_data/site.js` — docs navigation
- `site/content/verification.md` — add cross-reference to new legal evidence page

### Files to create:
- `site/content/legal-evidence.md` — new legal evidence guide page

### Tech stack:
- Landing page: static HTML/CSS, no JS
- Docs site: 11ty v3 with Markdown + Nunjucks templates
- Design system: shared CSS via design-system.css
- Deployment: Cloudflare Workers Static Assets

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MyvylP/legal-evidence-positioning/phase3-synthesis.md
