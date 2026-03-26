# Outcome — Mermaid Architecture Diagrams

## What was produced

### New files
- `site/content/architecture.md` — Architecture documentation page with two Mermaid diagrams

### Modified files
- `site/_includes/layouts/base.njk` — Inline Mermaid rendering script (CDN, pinned v11.4.1, try/catch)
- `site/_data/site.js` — Navigation entry after API Reference
- `site/content/index.md` — Architecture card in Getting Started page
- `site/eleventy.config.js` — Empty Prism grammar for mermaid passthrough

### Diagram 1: User Interaction Flows (sequence diagram)
Shows 5 interaction patterns: GitHub OAuth + API key auth, single/batch capture lifecycle with polling, public verification with 5 checks + PDF certificate, and account management (keys, webhooks, eIDAS opt-in).

### Diagram 2: Capture Pipeline & Integrity Chain (flowchart)
Shows 4 pipeline stages: Ingestion (auth → rate limiting → quota → URL validation → threat screening → queue → 202), Processing (browser rendering with dual screenshots + consent dismissal), WACZ Assembly (WARC → artifact hashes → datapackage.json → bundleHash → Ed25519 + RFC 3161 + eIDAS as siblings), Completion (storage → DB → webhook). Includes verification subgraph showing 5 independent checks with server-side key resolution.

## Deviations from issue #168

1. **Share links removed** — `POST /v1/captures/{id}/share` does not exist in the codebase. The verify endpoint is public by design and needs no share mechanism.
2. **Scheduled captures excluded** — Exist in codebase but excluded for diagram clarity. Can be added later.
3. **Conceptual level** — Used descriptive labels instead of endpoint-level detail, since API Reference already covers endpoints.

## Side effects

- **Existing whitepaper diagrams now render** — The 3 Mermaid blocks in `site/content/security/whitepaper.md` were previously displayed as raw code. The Mermaid rendering script fixes all Mermaid blocks site-wide.

## Surface consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — no new endpoints |
| Docs site | Updated (this IS the docs change) |
| Landing page | No update needed — no pricing/capability changes |
| MCP server | No update needed — no API changes |
| Legal pages | No update needed — no new data collection or services |

## Backlog changes

- No items added to backlog
- No items removed from backlog
- Issue #168 resolved by this PR
