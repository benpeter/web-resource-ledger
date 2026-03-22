# Decisions: R19 Documentation Site

## Static Site Generator: 11ty v3

**Chosen**: 11ty v3 (ESM-native, zero client-side JS output)
**Over**: Plain HTML (too much duplication), Redocly build-docs (ships ~250KB client-side JS via ReDoc)
**Why**: 11ty produces zero client-side JS by default, has first-class markdown/Nunjucks support, and lets us use design system tokens directly in CSS without fighting a third-party rendering engine. The spec is small enough (14 operations) that custom templates are feasible.

## OpenAPI Rendering: Build-Time Parsing vs ReDoc

**Chosen**: 11ty build-time parsing with `@apidevtools/swagger-parser` for $ref resolution
**Over**: `redocly build-docs` with Handlebars template (api-spec-minion recommendation)
**Why**: ReDoc ships ~250KB of client-side JS which violates the "no JS framework" constraint and the project's performance philosophy. ReDoc's styled-components with generated class names make brand-consistent theming fragile. 11ty templates produce plain HTML/CSS with full control. Redocly CLI is still used for linting.

**Margo advisory (not adopted)**: Suggested using `redocly bundle --dereferenced` instead of `@apidevtools/swagger-parser` to eliminate a dependency. Valid point but swagger-parser provides programmatic access to the dereferenced spec object which is needed for the 11ty data pipeline. Redocly bundle outputs a file that would need a second parse step.

## Deployment: Workers Static Assets vs Cloudflare Pages

**Chosen**: Workers Static Assets with `[assets]` block in `wrangler.toml`
**Over**: Cloudflare Pages (specified in original issue, deprecated April 2025)
**Why**: iac-minion discovered Pages was deprecated. Workers Static Assets uses the same deployment tooling as the existing WRL Worker, keeps infrastructure consistent, and is the forward-looking platform. This is a scope deviation from the original issue that was explicitly approved at the gate.

## Directory Name: `site/` vs `docs-site/`

**Chosen**: `site/`
**Over**: `docs-site/` (frontend-minion recommendation)
**Why**: Shorter, clearer. Avoids collision with `docs/` (which contains evolution logs and internal docs). Purpose is obvious from contents.

## Homepage: Getting Started vs Hub Page

**Chosen**: Getting Started IS the homepage (no interstitial landing page)
**Over**: Minimal hub/landing page (user-docs-minion recommendation)
**Why**: ux-strategy-minion's JTBD analysis -- a hub page is a zero-value interstitial for a 6-page site. Getting Started opens with a one-sentence product description and "What's next" at the bottom provides wayfinding.

## Sidebar Navigation Order

**Chosen**: Getting Started > Auth > Verification > Batch > MCP > API Reference
**Over**: Getting Started > Auth > API Reference > Verification > Batch > MCP (ux-strategy recommendation)
**Why**: API Reference is a lookup resource, not a learning step. Placing it last follows the Divio framework: tutorials and how-tos precede reference material. Verification is a natural progression from auth.

## Client-Side JavaScript: Zero vs Minimal

**Chosen**: Copy-to-clipboard as single progressive enhancement (~15 lines)
**Over**: Zero JS (frontend-minion), copy-to-clipboard + hamburger toggle (ux-strategy)
**Why**: Copy-to-clipboard is a must-have for developer docs (friction point developers notice). Mobile sidebar uses CSS-only `<details>/<summary>` instead of JS hamburger.

## WCAG AA Contrast Overrides

**Chosen**: Docs-local CSS overrides (`--color-text-muted-docs: #5a5650`, `--color-link-docs: #2f6a85`)
**Over**: Modifying the shared design system
**Why**: accessibility-minion identified two additional contrast failures beyond the known muted text issue: link color (#3d7c9a achieves only ~4.1:1) and badge variants using the muted token. Local overrides fix docs without affecting the design system used by other surfaces.

## Security Headers

**Chosen**: Strict CSP (`script-src 'self'; style-src 'self'`) with HSTS
**Over**: No CSP (original plan), permissive CSP with `'unsafe-inline'` (Task 1 initial implementation)
**Why**: security-minion advisory. Lucy gate review caught that `'unsafe-inline'` negates XSS protection entirely. Since the site ships no inline scripts or styles initially, strict CSP is correct. The copy-to-clipboard script (Task 5) must be an external file to comply.
