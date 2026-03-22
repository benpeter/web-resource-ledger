# Outcome: R19 Documentation Site

## What Was Produced

A complete static documentation site for WRL, built with 11ty v3 and deployed
via Cloudflare Workers Static Assets at `docs.webresourceledger.com`.

### Site Structure

Six pages in a two-column layout with sticky sidebar navigation:

1. **Getting Started** (homepage) -- three-step tutorial: Capture, Check, Verify.
   Walks a new user from API key to first verified capture.
2. **Authentication** -- three-persona guide: Using API keys, Managing keys
   (operators), Legacy single-key mode (collapsible).
3. **Verification** -- progressive disclosure: "How to verify" up front,
   "Under the hood" cryptographic details in collapsible sections.
4. **Batch Captures** -- end-to-end 2-URL example with partial failure handling.
5. **MCP Server** -- rewritten from internal docs, 4 client setups, 5 tool
   parameter tables.
6. **API Reference** -- generated from openapi.yaml at build time via
   `@apidevtools/swagger-parser` for $ref resolution. Grouped by tag with
   method badges, schema tables, and request/response examples.

### Technical Stack

- **11ty v3** (ESM-native) with Nunjucks templates
- **Zero client-side JS** except ~19 lines of progressive-enhancement
  copy-to-clipboard (external file for CSP compliance)
- **WRL design system** tokens consumed via CSS custom properties
- **Prism.js** syntax highlighting with custom WRL theme
- **Mobile nav** via CSS-only `<details>/<summary>` (no JS hamburger)
- **Strict CSP**: `script-src 'self'; style-src 'self'` (no unsafe-inline)
- **WCAG AA** contrast overrides for muted text and link colors

### Deployment

- `site/wrangler.toml` with `[assets]` block pointing to `_output/`
- Custom domain route: `docs.webresourceledger.com`
- GitHub Actions workflow (`deploy-docs.yml`) triggers on push to main
  with path filter (`site/**`, `openapi.yaml`, `src/design-system.css`)
- CI integration: `ci.yml` updated to skip docs paths in test jobs

### Files Created/Modified

- 22 new files in `site/` (config, templates, content, CSS, JS, assets)
- `.github/workflows/deploy-docs.yml` (new)
- `.github/workflows/ci.yml` (modified -- docs path skip)
- `openapi.yaml` (modified -- real server URLs)
- `README.md` (modified -- 3 cross-links to docs site)
- `vitest.config.js` (modified -- exclude `site/**`)
- `docs/evolution/0051-documentation-site/decisions.md` (new)

## What Deviated from the Plan

1. **Cloudflare Pages → Workers Static Assets**: The original issue specified
   Cloudflare Pages. iac-minion discovered Pages was deprecated (April 2025).
   Switched to Workers Static Assets. Explicitly approved at gate.

2. **ReDoc → build-time OpenAPI rendering**: The original issue implied
   rendering from openapi.yaml. api-spec-minion recommended Redocly build-docs
   with ReDoc. Rejected because ReDoc ships ~250KB client-side JS, violating
   the "no JS framework" constraint. Built custom 11ty templates instead.

3. **Agent file placement issue**: The frontend-minion (Task 1) wrote files
   to the original repo root instead of the worktree. Required manual
   copy and patch to correct.

## Surprises

- The existing design system's `--color-text-muted` (#6e6a66) and
  `--color-accent` (#3d7c9a) both fail WCAG AA contrast on the background.
  Required docs-local CSS overrides rather than modifying the shared system.
- Vitest was scanning `site/node_modules/` and picking up test files from
  the `entities` dependency. Required adding `'site/**'` to the exclude array.

## Issues Created

None.

## Backlog Changes

- **Marked done**: R19 Documentation Site (moved to Done section)
- **No new items added**: All deferred scope (search, interactive API explorer,
  localization) was already out-of-scope per the original issue.
- **Parking lot additions**: None. The doc site is self-contained.
