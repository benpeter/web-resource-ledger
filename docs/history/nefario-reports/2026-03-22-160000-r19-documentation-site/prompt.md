<github-issue>
**Outcome**: A static documentation site deployed on Cloudflare Pages at a custom docs subdomain, providing comprehensive guides for all WRL features. The site is generated from the repo's existing openapi.yaml and markdown content, styled with the WRL brand design system, and automatically deployed on push to main.

**Success criteria**:
- Getting Started guide walks a new user from API key to first verified capture in under 5 minutes
- API reference is generated from openapi.yaml (not hand-written) and stays in sync via CI
- Auth guide covers per-tenant API keys, admin keys, scopes, and the legacy single-key mode
- Verification guide explains the cryptographic chain: Ed25519 signature, RFC 3161 timestamp, WACZ bundle structure, and `npx @w-r-l/verify` usage
- MCP guide documents the MCP server tool interface, setup, and example agent workflows
- Batch guide covers the batch capture endpoint request/response format and polling pattern
- Site uses the WRL brand design system (colors, typography, layout)
- Custom domain configured (e.g., docs.wrl.example.com) with HTTPS
- Lighthouse accessibility score >= 90
- Build and deploy runs in Cloudflare Pages CI on push to main

**Scope**:
- In: Static site generator (11ty or plain HTML), content pages listed above, openapi.yaml rendering, Cloudflare Pages deployment, custom domain DNS
- Out: Interactive API explorer (Swagger UI), user authentication on the docs site, search functionality (can be added later), localization

**Constraints**:
- Depends on R15 (MCP server) and R18 (batch endpoint) being implemented so those guides reflect real behavior
- openapi.yaml is the single source of truth for API reference -- no manual endpoint docs
- Must not introduce a JS framework; 11ty or plain HTML only
- Brand design system (BRAND phase) should be available before this ships
</github-issue>
