# Phase 0014: Browser Session Reuse with Playwright Migration

## Source

GitHub Issue #21: "Implement browser session reuse with Playwright migration for 10x capture throughput"

## Task

Migrate from `@cloudflare/puppeteer` to `@cloudflare/playwright` and implement
browser session reuse to increase capture throughput from ~30 to ~300
captures/min within the existing 30-session Browser Rendering limit.

## Success Criteria

- Idle sessions discovered and reconnected before launching new browsers
- `keep_alive` set on browser launch to prevent premature session timeout
- Puppeteer replaced with `@cloudflare/playwright` throughout `src/capture.js`
- All existing capture tests pass
- `src/capture.js` header comment documents BrowserContext isolation threat model
- Scaling path added to `docs/backlog.md`
- TOCTOU backlog entries marked DONE

## Scope

- In: `src/capture.js` session lifecycle, browser launch options, session discovery
- In: Puppeteer to Playwright migration (`src/capture.js`, `package.json`, `wrangler.toml`)
- In: Document isolation decision and threat model reasoning in code comments
- In: Add scaling options beyond session reuse to `docs/backlog.md`
- Out: Queue-based backpressure, Durable Object session coordination, Cloudflare Containers
