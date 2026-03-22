# Meta-Plan: R19 Documentation Site

## Task Summary

Build a static documentation site deployed on Cloudflare Pages at
`docs.webresourceledger.com`, providing comprehensive guides for all WRL
features. The site is generated from the repo's existing `openapi.yaml`
(2,868 lines) and hand-written markdown content, styled with the WRL brand
design system (`src/design-system.css`), and auto-deployed on push to main.

Content pages: Getting Started, API Reference (from openapi.yaml),
Authentication, Verification/Cryptography, MCP Server, Batch Captures.

Constraints: 11ty or plain HTML only (no JS frameworks), openapi.yaml is
single source of truth for API reference, brand design system must be applied.

---

## Planning Consultations

### Consultation 1: Static Site Architecture

- **Agent**: frontend-minion
- **Planning question**: What is the best approach for building a docs site
  with 11ty (or plain HTML) that can (a) render the openapi.yaml into an API
  reference page at build time without Swagger UI, (b) reuse the existing
  WRL design system tokens from `src/design-system.css`, and (c) stay within
  the project's "no JS framework" constraint? Consider: 11ty with Nunjucks
  templates vs. a build script that generates plain HTML pages. How should
  the docs site's CSS extend the design system for documentation-specific
  patterns (nav, sidebar, code highlighting, anchor links) without
  duplicating tokens? What's the right directory structure (`site/` or
  `docs-site/` at repo root)?
- **Context to provide**: `src/design-system.css` (the full token set and
  component library), `package.json` (current deps -- no frameworks),
  CLAUDE.md engineering philosophy (YAGNI, KISS, vanilla JS/CSS/HTML
  preferred, Helix Manifesto), the constraint that 11ty or plain HTML are
  the only options.
- **Why this agent**: frontend-minion owns build tooling decisions, CSS
  architecture, and static site structure. The openapi.yaml-to-HTML
  rendering pipeline is a build tooling problem.

### Consultation 2: API Reference Generation Strategy

- **Agent**: api-spec-minion
- **Planning question**: How should the 2,868-line `openapi.yaml` be rendered
  into a static HTML API reference page without Swagger UI? Options include:
  (a) Redocly build (already a devDependency via `@redocly/cli`), (b) 11ty
  plugin that parses YAML at build time, (c) a custom build script using the
  `yaml` package (also already a devDependency). The output must stay in sync
  via CI -- what CI check ensures the rendered HTML matches the current
  openapi.yaml? Should the API reference be a single long page or split by
  tag (health, captures, verification, signing, admin)? Consider that
  `redocly.yaml` exists with `extends: recommended` but is currently only
  used for linting.
- **Context to provide**: `openapi.yaml` structure (tags: health, captures,
  verification, signing, admin; securitySchemes: bearerAuth, adminAuth),
  `redocly.yaml`, `package.json` (has `@redocly/cli` as devDep), the
  constraint that Swagger UI is explicitly out of scope.
- **Why this agent**: api-spec-minion is the authority on OpenAPI rendering
  tooling and contract-first workflows. Choosing the right rendering
  approach is a key architectural decision.

### Consultation 3: Cloudflare Pages Deployment and DNS

- **Agent**: iac-minion
- **Planning question**: What is the simplest Cloudflare Pages setup for a
  docs site that (a) deploys on push to main via GitHub Actions (not
  Cloudflare's own CI), (b) uses a custom domain
  `docs.webresourceledger.com` with HTTPS, and (c) coexists with the
  existing Worker deployment (wrl.benpeter.workers.dev) without conflicts?
  Should we use `wrangler pages deploy` or the Cloudflare Pages GitHub
  integration? How do we configure the CNAME record for the docs subdomain
  given the Cloudflare zone ID (`9b1b321a3921da4741063f25d6935a74`) and
  account ID (`fdff9098bf43cc29335eee17a740677c`)? What's the CI workflow
  structure -- a new `deploy-docs.yml` or integrated into the existing CI?
- **Context to provide**: Existing CI workflows (`ci.yml`,
  `deploy-production.yml`, `deploy-staging.yml`), `wrangler.toml` (current
  Worker config), the domain and Cloudflare IDs from memory, the constraint
  that this is Cloudflare Pages (not Workers Sites).
- **Why this agent**: iac-minion owns CI/CD pipelines, deployment
  configuration, and DNS/infrastructure setup. The Pages + custom domain +
  GitHub Actions integration is an infrastructure decision.

### Consultation 4: Content Structure and User Journey

- **Agent**: user-docs-minion
- **Planning question**: Given the six content pages (Getting Started, API
  Reference, Auth, Verification, MCP, Batch), what is the optimal
  information architecture for a new WRL user? The Getting Started guide
  must walk a user from API key to first verified capture in under 5
  minutes. Consider: (a) what prerequisite knowledge to assume (the user
  has a WRL instance deployed, or not?), (b) whether the Getting Started
  guide should cover self-deployment or assume a hosted instance, (c) how
  to structure the auth guide given three auth modes (per-tenant API keys,
  admin keys, legacy single-key), (d) how deep the verification guide should
  go into Ed25519/RFC 3161 cryptography vs. just showing `npx @w-r-l/verify`
  usage. The README already has a step-by-step usage section -- how does the
  docs site relate to and not duplicate the README?
- **Context to provide**: `README.md` (current usage section with 4-step
  flow), `openapi.yaml` (securitySchemes showing bearerAuth and adminAuth),
  `server.json` (MCP server registry entry), `packages/verify/README.md`
  (CLI verify tool docs), the success criterion that Getting Started takes
  < 5 minutes.
- **Why this agent**: user-docs-minion specializes in user guides, tutorials,
  and information architecture for end-user documentation. The content
  structure decision drives every page.

### Consultation 5: Documentation-Specific UX Patterns

- **Agent**: ux-strategy-minion
- **Planning question**: For a technical documentation site with 6 pages
  targeting developers (API consumers and self-deployers), what navigation
  and reading patterns reduce cognitive load? Consider: (a) sidebar nav vs.
  top nav vs. both, (b) whether a homepage/landing is needed or if Getting
  Started should be the default, (c) code example presentation (copy
  buttons, language tabs, or just fenced blocks), (d) how to handle the
  API reference -- inline with guides or as a separate reference section,
  (e) mobile responsiveness priorities for a developer docs site. The
  existing WRL design system has components (cards, badges, alerts, code
  blocks, data grids, tables) but no nav or sidebar components -- what
  minimal additions are needed?
- **Context to provide**: `src/design-system.css` (existing components),
  the 6 content pages and their relationships, the constraint that this is
  plain HTML/CSS (no JS framework), Lighthouse accessibility score >= 90
  target.
- **Why this agent**: ux-strategy-minion evaluates journey coherence and
  cognitive load. A docs site's navigation architecture is a UX decision
  that affects whether users find what they need.

---

## Cross-Cutting Checklist

- **Testing** (test-minion): Exclude from planning. The docs site is static
  HTML with no runtime logic. CI will validate the build succeeds and
  openapi.yaml linting passes (already exists). No unit/integration tests
  needed for static content. Phase 6 will verify the build pipeline works.

- **Security** (security-minion): Exclude from planning. The docs site is
  static HTML served from Cloudflare Pages CDN. No user input, no auth, no
  secrets, no APIs. Security headers (CSP, X-Frame-Options) are handled by
  Cloudflare Pages defaults. No meaningful attack surface.

- **Usability -- Strategy**: INCLUDED (Consultation 5). ux-strategy-minion
  will advise on navigation architecture, reading flow, and cognitive load
  for a 6-page developer docs site.

- **Usability -- Design** (ux-design-minion, accessibility-minion): Include
  ux-design-minion in planning -- skip. The design system already exists and
  the site uses it directly. accessibility-minion: include in execution (not
  planning). The Lighthouse >= 90 accessibility target means accessibility
  review is needed on the built output, but accessibility-minion's planning
  input would be generic WCAG advice that doesn't require specialist
  consultation at this stage.

- **Documentation** (software-docs-minion, user-docs-minion): INCLUDED.
  user-docs-minion is Consultation 4 (content structure). software-docs-minion:
  exclude from planning -- this task IS the documentation. No separate
  architecture documentation is needed for a static site.

- **Observability** (observability-minion, sitespeed-minion): Exclude
  observability-minion -- no runtime services. sitespeed-minion: include in
  execution (not planning) for Lighthouse audit of the built site against
  Core Web Vitals targets. Planning input not needed -- performance
  constraints for a static HTML site are standard.

---

## Notable Exclusions

- **edge-minion**: Cloudflare Pages handles CDN/caching natively; no custom
  edge worker configuration or caching strategy is needed for a static site.
- **seo-minion**: The docs site is developer-facing technical documentation,
  not a marketing page. SEO optimization (structured data, meta tags) adds
  complexity with minimal value for this audience. Can revisit if organic
  search traffic becomes a goal.
- **data-minion**: No database, no data modeling. The site is purely static
  files.

---

## Anticipated Approval Gates

1. **Site architecture and rendering approach** (after Consultation 1 + 2
   synthesis): The choice between 11ty vs. plain HTML build script AND the
   openapi.yaml rendering strategy (Redocly vs. custom) are hard-to-reverse
   decisions that every content page depends on. MUST gate.

2. **Content structure and information architecture** (after Consultation 4
   synthesis): The page hierarchy, Getting Started flow, and relationship to
   the README determine what every content author writes. MUST gate (high
   blast radius, moderate reversibility).

3. **CI/CD and domain configuration** (iac-minion task output): The
   Cloudflare Pages project name, custom domain CNAME, and GitHub Actions
   workflow are infrastructure decisions. OPTIONAL gate -- easy to change
   but affects deployment pipeline.

---

## Rationale

This task is primarily a **content + build tooling + infrastructure** problem.
The five consultations cover:

- **How to build it** (frontend-minion: site structure, CSS, build pipeline)
- **How to render the API spec** (api-spec-minion: openapi.yaml to HTML)
- **How to deploy it** (iac-minion: Cloudflare Pages, DNS, CI)
- **What to write** (user-docs-minion: content structure, user journey)
- **How users navigate it** (ux-strategy-minion: navigation, reading flow)

These five domains have genuine interdependencies: the content structure
influences the build pipeline, the rendering approach constrains the design,
and the deployment model shapes the CI workflow. Getting these aligned in
planning prevents rework during execution.

---

## Scope

**In scope**:
- Static site generator setup (11ty or plain HTML build)
- 6 content pages: Getting Started, API Reference, Auth, Verification, MCP, Batch
- API reference generated from openapi.yaml (not hand-written)
- WRL brand design system applied (colors, typography, layout)
- Cloudflare Pages deployment with GitHub Actions CI
- Custom domain `docs.webresourceledger.com` with HTTPS
- Lighthouse accessibility score >= 90
- Navigation and site chrome (header, sidebar/nav, footer)

**Out of scope**:
- Interactive API explorer (Swagger UI)
- User authentication on the docs site
- Search functionality
- Localization
- Blog or changelog section
- Custom analytics

---

## External Skill Integration

No external skills detected in project. No `.claude/skills/` or `.skills/`
directories exist in the working directory. User-global skills at
`~/.claude/skills/` are all despicable-agents agents (nefario, despicable-prompter,
etc.) and are not project-specific extensions.
