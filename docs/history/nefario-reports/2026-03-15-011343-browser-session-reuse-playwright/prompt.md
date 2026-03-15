Implement browser session reuse with Playwright migration for 10x capture throughput.

Captures reuse browser sessions instead of launching and closing a browser per capture, increasing throughput from ~30 to ~300 captures/min within the existing 30-session Browser Rendering limit. Simultaneously migrates from Puppeteer to Playwright (GA on Cloudflare since Sep 2025) for a cleaner API and better alignment with Cloudflare's evolving platform.

Success criteria:
- browser.disconnect() replaces browser.close() in capture flow
- Idle sessions are discovered and reconnected before launching new browsers
- keep_alive is set on browser launch to prevent premature session timeout
- Puppeteer replaced with @cloudflare/playwright throughout src/capture.js
- All existing capture tests pass
- Concurrent capture throughput improves measurably under load
- src/capture.js header comment documents why BrowserContext isolation is sufficient (threat model reasoning)
- Scaling path added to docs/backlog.md

Scope:
- In: src/capture.js session lifecycle, browser launch options, session discovery and reconnection logic
- In: Puppeteer to Playwright migration (src/capture.js, package.json, wrangler.toml)
- In: Document the isolation decision and threat model reasoning in code comments
- In: Add scaling options beyond session reuse to docs/backlog.md
- Out: Queue-based backpressure, Durable Object session coordination, Cloudflare Containers, infrastructure changes

Constraints:
- Must work within the existing Cloudflare Browser Rendering binding
- Must handle session contention gracefully (multiple Workers racing for the same free session)
- BrowserContext must be closed after each capture (state cleanup) -- browser stays alive
