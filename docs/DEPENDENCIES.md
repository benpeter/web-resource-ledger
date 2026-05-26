# Dependency Annotations

What each dependency does, where it's used, and why it's here.
Last updated: 2026-04-30.

---

## Root (`package.json`) — Production Dependencies

| Package | What it does | Where used | Why this one |
|---------|-------------|------------|--------------|
| `@cloudflare/playwright` | Headless Chromium for page capture — navigate, screenshot, extract DOM | `src/capture.js` | Cloudflare Browser Rendering's managed Playwright; no browser infrastructure to maintain |
| `@duckduckgo/autoconsent` | Cookie consent banner auto-dismiss (GDPR/CCPA dialogs) | Vendored into `src/vendor/` via `scripts/vendor-autoconsent.js`; consumed by `src/consent.js`, `src/capture.js` | Best open-source CMP rule library; covers 1000+ consent providers |
| `@modelcontextprotocol/sdk` | MCP Streamable HTTP transport for AI agent tool integration | `src/mcp.js` | Official SDK; provides protocol framing and transport for the 11-tool MCP server |
| `croner` | Cron expression parser — validates and evaluates schedule expressions | `src/cron.js` | Lightweight (~4KB), no native deps, supports standard 5-field cron syntax |
| `diff-match-patch-es` | Character-level text diff — computes HTML content changes between captures | `src/diff.js` | ESM port of Google's diff-match-patch; produces semantic diffs suitable for web content |
| `pdf-lib` | PDF generation — creates FRE 902(13) certification documents | `src/certificate.js` | Pure JS, no native deps, runs in Workers; generates deterministic Ed25519-signed PDFs |
| `zod` | Schema validation for MCP tool inputs | `src/mcp.js` | Required by `@modelcontextprotocol/sdk` for tool parameter validation |

## Root (`package.json`) — Dev Dependencies

| Package | What it does | Where used | Why this one |
|---------|-------------|------------|--------------|
| `@cloudflare/vitest-pool-workers` | Runs Vitest tests inside the Miniflare Workers runtime | All `test/*.test.js` | Tests execute in the same runtime as production — bindings (KV, D1, R2, Queues) are real |
| `@playwright/test` | E2E browser test framework against staging | `test/e2e/` (6 specs, 10 tests) | Industry standard; same Playwright API as the capture renderer |
| `@redocly/cli` | OpenAPI spec linter | `npm run lint:api` → validates `openapi.yaml` | Catches schema drift and spec errors in CI |
| `fflate` | ZIP create (STORE mode) and extract for WACZ bundles | `src/wacz.js` (zipSync), `src/verify.js` (unzipSync), test helpers | Pure JS, ~8KB gzip, runs in Workers; fast synchronous API for the small bundles WRL produces |
| `vitest` | Test runner for unit and integration tests | All `test/*.test.js` | Fast, ESM-native, pairs with `@cloudflare/vitest-pool-workers` |
| `wrangler` | Cloudflare Workers CLI — dev server, deploy, secrets, D1 migrations | `npm run dev`, `npm run deploy`, CI pipelines | Required toolchain for Workers development |
| `yaml` | YAML parser | `test/mcp-sync.test.js` — parses `openapi.yaml` to verify MCP tool definitions match API routes | Lightweight; only needed in test to detect MCP ↔ API drift |

---

## Docs Site (`site/package.json`)

| Package | What it does | Where used | Why this one |
|---------|-------------|------------|--------------|
| `@11ty/eleventy` | Static site generator for docs.webresourceledger.com | `site/` — builds Markdown + Nunjucks templates into static HTML | Zero client JS, simple data pipeline, Markdown-native |
| `@11ty/eleventy-plugin-syntaxhighlight` | Prism.js code highlighting in docs pages | Code blocks in guides and API reference | Official 11ty plugin; build-time highlighting, no client JS |
| `@apidevtools/swagger-parser` | Parse and dereference OpenAPI specs | Build step — generates API reference pages from `openapi.yaml` | Resolves `$ref` pointers into a flat schema for template rendering |
| `yaml` | YAML parser for OpenAPI spec processing | Build step — reads `openapi.yaml` before passing to swagger-parser | Same version as root; shared concern |

---

## Verify CLI (`packages/verify/package.json`)

Published as `@w-r-l/verify` on npm. Zero-install CLI for offline WACZ verification.

| Package | What it does | Where used | Why this one |
|---------|-------------|------------|--------------|
| `fflate` | ZIP extraction for WACZ bundle verification | `lib/` — extracts WACZ contents for hash recomputation | Same library as root; consistent ZIP handling |
| `pkijs` | X.509 / RFC 3161 certificate chain validation | `lib/` — verifies TSA timestamp tokens against embedded CA certificates | Most complete pure-JS PKI library; handles CMS SignedData parsing |
| `asn1js` | ASN.1 DER/BER parsing | Required by `pkijs` — decodes TSA token structures | Peer dependency of pkijs |
| `pvutils` | Low-level buffer/conversion utilities | Required by `pkijs` and `asn1js` | Peer dependency of pkijs |

---

## Dependency Philosophy

Per the [Helix Manifesto](https://github.com/adobe/helix-home/blob/main/manifesto.md):

- **Lean and Mean** — 7 production deps, 7 dev deps, 4 docs deps, 4 verify-CLI deps.
  Every dependency has a specific job and a named consumer file.
- **No frameworks** — no React, Vue, Tailwind, Express, or Hono. The Worker is
  vanilla route dispatch; the UI is vanilla JS/CSS/HTML.
- **Workers-compatible** — every production dep must run in the Workers runtime
  (V8 isolate, no Node APIs). This rules out most npm packages.
- **Vendored where appropriate** — autoconsent is vendored into `src/vendor/`
  because only its browser injection script is needed, not the full package at runtime.
