MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Build a static documentation site deployed on Cloudflare Pages at a custom docs subdomain, providing comprehensive guides for all WRL features. The site is generated from the repo's existing openapi.yaml and markdown content, styled with the WRL brand design system, and automatically deployed on push to main.

Success criteria:
- Getting Started guide walks a new user from API key to first verified capture in under 5 minutes
- API reference is generated from openapi.yaml (not hand-written) and stays in sync via CI
- Auth guide covers per-tenant API keys, admin keys, scopes, and the legacy single-key mode
- Verification guide explains the cryptographic chain: Ed25519 signature, RFC 3161 timestamp, WACZ bundle structure, and npx @w-r-l/verify usage
- MCP guide documents the MCP server tool interface, setup, and example agent workflows
- Batch guide covers the batch capture endpoint request/response format and polling pattern
- Site uses the WRL brand design system (colors, typography, layout)
- Custom domain configured (e.g., docs.webresourceledger.com) with HTTPS
- Lighthouse accessibility score >= 90
- Build and deploy runs in Cloudflare Pages CI on push to main

Constraints: No JS framework (11ty or plain HTML only), openapi.yaml is single source of truth, brand design system should be used.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase2-api-spec-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase2-user-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase2-ux-strategy-minion.md

## Key consensus across specialists:

### frontend-minion
Recommendation: Use 11ty v3 in docs-site/ with build-time OpenAPI parsing, extending WRL design system via docs.css for sidebar, prose, code highlighting, method badges.
Tasks: 6 -- Scaffold 11ty; CSS layer; OpenAPI data pipeline; Content pages; Accessibility audit; CI/CD
Risks: $ref resolution complexity; design system CSS/JS drift; mobile sidebar without JS
Conflicts: Proposes build-time OpenAPI parsing with 11ty templates (vs api-spec-minion's redocly build-docs)

### api-spec-minion
Recommendation: Use redocly build-docs (already devDep) with custom Handlebars template; single page with ReDoc sidebar; don't commit generated HTML.
Tasks: 5 -- Redocly theming; Handlebars template; build:api-docs script; CI freshness; Fix servers block
Risks: ReDoc theming limits; disableGoogleFont essential; placeholder server URLs; CI docs-skip needs updating
Conflicts: redocly build-docs vs frontend-minion's 11ty OpenAPI parsing

### iac-minion
Recommendation: Workers Static Assets (not deprecated Pages) with separate wrangler.toml, deploy-docs.yml, docs.webresourceledger.com custom domain.
Tasks: 5 -- Docs Worker config; deploy-docs.yml; CI docs-skip update; Custom domain; build:docs script
Risks: Workers Static Assets is new; custom domain may need dashboard; API token scope; path filter gaps
Conflicts: none

### user-docs-minion
Recommendation: Task-first IA ordered by user journey; 3-step Getting Started; three-persona auth guide; two-layer verification depth.
Tasks: 8 -- Content architecture; Getting Started; Auth; Verification; MCP; Batch; Landing page; README update
Risks: Content duplication drift; prerequisites assumption; crypto depth calibration
Conflicts: none

### ux-strategy-minion
Recommendation: Sidebar-only nav (no top nav); Getting Started IS the homepage; request/response pairs vertically stacked; copy-to-clipboard as only JS.
Tasks: 7 -- Info architecture; Layout components; HTML template; Getting Started; API Ref; Remaining guides; Accessibility audit
Risks: --color-text-muted contrast ~3.5:1 fails WCAG AA (needs 4.5:1); mobile sidebar needs JS
Conflicts: Minor sidebar order difference vs user-docs-minion

## Key conflicts to resolve:
1. OpenAPI rendering: frontend-minion proposes 11ty build-time parsing with custom templates vs api-spec-minion proposes redocly build-docs with Handlebars template. Both have merit.
2. Sidebar order: ux-strategy (Getting Started → Auth → API Ref → Verification → Batch → MCP) vs user-docs (Getting Started → Auth → Verification → Batch → MCP → API Ref)
3. Homepage: ux-strategy says Getting Started IS the homepage vs user-docs suggests a minimal landing/hub page

## External Skills Context
No external skills detected

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. No external skills to incorporate
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase3-synthesis.md
