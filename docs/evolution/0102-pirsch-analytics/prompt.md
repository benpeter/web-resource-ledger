# Phase 0102: Pirsch Analytics Server-Side Tracking

## Source

GitHub Issue: #248 — Implement Pirsch Analytics server-side tracking with cross-domain funnel attribution

## Task Description

All three WRL properties (landing, docs, API) report analytics to Pirsch via server-side tracking from within their Workers, with zero client-side JavaScript. A cross-domain funnel tracks the full journey from landing page visit through signup to first capture, enabling "where did signups come from?" queries. This is the foundation for measuring marketing effectiveness.

## Success Criteria

- Landing and docs Workers wrap static asset serving with a fetch handler that sends Pirsch hits via `ctx.waitUntil()`
- API Worker fires Pirsch events for Signup, First Capture, Plan Upgrade, and Schedule Created
- `handleAuthLogin` stores `Referer` header and UTM query params in the existing KV state entry alongside the PKCE code verifier
- `handleAuthCallback` reads stored attribution from KV and attaches it as tags/metadata on the Signup event
- All hits and events include a `property` tag (`landing`, `docs`, or `api`)
- Pirsch API calls never block the response path (all inside `ctx.waitUntil()`)
- No cookies, no client-side JS, no CSP changes to any Worker
- Landing page remains zero-JavaScript with `script-src: 'none'` intact
- `PIRSCH_ACCESS_KEY` deployed as a Wrangler secret on all three Workers
- Privacy policy page updated with Pirsch transparency statement
- All existing tests pass

## Scope

**In**: Landing Worker fetch handler wrapper, Docs Worker fetch handler wrapper, shared Pirsch tracking module (`trackHit`, `trackEvent`), OAuth flow attribution passthrough (KV state enrichment in `handleAuthLogin` + event firing in `handleAuthCallback`), event instrumentation at capture completion and billing webhook, `landing/wrangler.toml` and `site/wrangler.toml` updates, privacy policy update

**Out**: Pirsch dashboard configuration, Google Search Console integration, client-side JS tracking, Pirsch MCP server setup (already done), API request-level tracking, any changes to the OAuth flow logic itself

## Orchestration

Executed via `/nefario #248` with autonomous mode.
