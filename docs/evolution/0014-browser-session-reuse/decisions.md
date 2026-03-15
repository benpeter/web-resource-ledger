# Decisions: Browser Session Reuse with Playwright Migration

## 1. browserContext.route() over page.route()

**Decision**: Use context-level route interception instead of page-level.

**Alternatives considered**:
- `page.route()`: frontend-minion recommended this as the direct Puppeteer migration path
- `browserContext.route()`: security-minion recommended for broader coverage

**Rationale**: `page.route()` misses the first request of popup windows. A malicious
page could open a popup to an internal URL, bypassing page-level interception.
Context-level routing covers all requests in all pages within the context.

## 2. waitUntil: 'networkidle' (accept stricter behavior)

**Decision**: Use Playwright's `'networkidle'` directly without mitigation patterns.

**Alternatives considered**:
- `'load'` + 2-second settle timer (wastes time on fast pages)
- Race pattern: `networkidle` with short timeout vs `load` + settle (adds complexity)
- `'domcontentloaded'` + explicit wait (too aggressive)

**Rationale**: `networkidle` (0 connections for 500ms) is stricter than Puppeteer's
`networkidle2` (allowed 2 outstanding connections). For an archival tool, pages with
persistent WebSocket/SSE connections are a minority case. The 25-second timeout is
the safety net. If regressions appear, switching to `'load'` + settle is a one-line change.

## 3. No renderer extraction to separate module

**Decision**: Keep `defaultRenderer` in `src/capture.js`.

**Alternatives considered**:
- Extract to `src/renderer.js` (test-minion recommended for testability)

**Rationale**: The existing DI pattern (`renderer` parameter on `performCapture`)
already provides full testability. All tests use `stubRenderer`. Creating a separate
module adds a file, an import, and a test file for ~80 lines of code. YAGNI.

## 4. No session wait/retry loop

**Decision**: `getOrCreateSession` either gets a session immediately or throws.

**Alternatives considered**:
- Wait up to 3 seconds for capacity (original plan)
- Wait up to 1 second (security review suggestion)

**Rationale**: Security review flagged that any wait eats into the 30s ctx.waitUntil
budget. Combined with 25s NAV_TIMEOUT_MS, even 1s of wait leaves only 4s margin.
The capture fails with a retryable error; the caller can retry.

## 5. GLOBAL_CAPTURE_LIMITER raised from 20/min to 200/min

**Decision**: Include rate limit increase as a config change, not infrastructure.

**Rationale**: Both edge-minion and ux-strategy-minion agreed the 20/min cap makes
the 10x throughput target unreachable. Per-IP limiter (10/min) remains as the
abuse prevention mechanism. The global limiter is system capacity, not security.

## 6. Service Workers blocked via context option

**Decision**: `serviceWorkers: 'block'` on context creation.

**Rationale**: Route interception (both page-level and context-level) does not
intercept Service Worker network requests. A SW registered by a prior capture
on the same browser process could theoretically intercept requests in a new
context. Blocking SWs eliminates this vector with one line of config.

## 7. BrowserContext isolation is sufficient for WRL

**Decision**: Accept BrowserContext isolation without browser-per-capture.

**Rationale**: Documented in the issue body with full specialist analysis.
BrowserContext isolates all application-layer state. Browser-level shared state
(DNS cache, TLS, HTTP/2) is not observable through capture artifacts. WRL is
single-tenant (no cross-tenant data). Cloudflare gVisor provides VM-level isolation.
