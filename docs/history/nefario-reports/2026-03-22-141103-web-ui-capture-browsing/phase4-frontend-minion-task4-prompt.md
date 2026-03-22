## Task: Tests, documentation, and polish

Write Vitest worker tests for the Web UI, add README documentation, and polish any rough edges.

### Context

The Web UI is functionally complete (Tasks 1-3). This task adds test coverage, documentation, and any final adjustments.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/steady-singing-eagle

### What to build

**1. Vitest worker tests (`test/ui-dashboard.test.js`)**

Follow the exact pattern from `test/verify-page.test.js` and `test/verify-html.test.js`. Test the `htmlDashboard()` function and the `GET /ui` route.

Tests to write:
- **Response basics**: `GET /ui` returns 200, `Content-Type: text/html;charset=UTF-8`
- **CSP header**: Response includes correct `Content-Security-Policy` header — assert the FULL CSP string as an exact match (not just substring checks). The expected CSP is: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
- **Cache-Control**: Response includes `no-store`
- **HTML structure**: Response body contains `<!DOCTYPE html>`, `<html lang="en">`, viewport meta, `<div id="app">`, `<noscript>` fallback
- **Design system**: Response body includes design system CSS tokens (`--color-text`, `--color-primary`, etc.)
- **No external resources**: HTML does not contain `<script src=`, `<link rel="stylesheet" href=`, or any external URL references
- **Security — no innerHTML with variables**: Scan the JS source strings in ui-submit.js, ui-detail.js, ui-auth.js, ui-poll.js for innerHTML usage patterns. Assert that innerHTML is ONLY used with empty string (`innerHTML = ''`) or static HTML template strings, never with variable data from API responses. Write a test that reads the source files and checks this.
- **Auth gate markup**: HTML contains the auth gate elements (password input, connect button)
- **View markup**: HTML contains the rendering functions for all three views (renderCaptures, mountCaptures, renderDetail, mountDetail)
- **Polling module guards**: Read the source of ui-poll.js and assert: (1) uses setTimeout (not setInterval), (2) references Retry-After, (3) references visibilityState, (4) has a 120-second or 120000ms timeout constant

For route-level tests using `SELF.fetch()`:
- `GET /ui` returns 200 with HTML
- Response has `Cache-Control: no-store` header
- Response has the correct CSP header
- `POST /ui` or other methods — verify the worker handles it (returns 405 or falls through)

**2. README update**

Add a "Web UI" section to `README.md`, positioned after the "MCP Server" section (line ~313) and before "Development" (line ~315). Follow the exact pattern of the MCP Server section (brief, with minimal detail). Content:

```
## Web UI

WRL includes a browser-based interface for submitting captures and browsing
results. Navigate to `/ui` on your WRL deployment to access it. Authentication
requires a WRL API key with `capture` and `read` scopes.

The UI is served directly from the Worker — no separate hosting or CORS
configuration required.
```

**3. Polish items**
- Review all views for consistent use of design system tokens (no hardcoded colors)
- Verify all `aria-live` regions are correct for status updates
- Verify `document.title` updates on each view change
- Add comment banners at concatenation points in the shell's script block for DevTools orientation:
  - `// === AUTH ===` before AUTH_JS
  - `// === POLL ===` before POLL_JS
  - `// === VIEW: SUBMIT ===` before SUBMIT_VIEW_JS
  - `// === VIEW: DETAIL ===` before DETAIL_VIEW_JS
- Verify the comment in `src/index.js` near the UI route notes that the UI depends on same-origin API access

### Files to reference

- `test/verify-page.test.js` — the test pattern to follow (imports, describe blocks, assertion style)
- `test/security-headers.test.js` — pattern for SELF.fetch() route-level tests
- `README.md` — where to add the Web UI section (after line ~313, before "Development")
- `src/ui/ui-shell.js` — the function under test
- `src/ui/ui-submit.js` — source to scan for innerHTML patterns
- `src/ui/ui-detail.js` — source to scan for innerHTML patterns
- `src/ui/ui-auth.js` — source to scan for innerHTML patterns
- `src/ui/ui-poll.js` — source to verify polling guards
- `src/index.js` — the route under test

### What NOT to do

- Do NOT write E2E/Playwright browser tests — those are deferred to a follow-up
- Do NOT write a separate `docs/web-ui.md` guide — the UI should be self-documenting
- Do NOT modify the OpenAPI spec (`openapi.yaml`) — no API changes were made
- Do NOT add visual regression tests
- Do NOT modify any existing tests
- Do NOT modify the actual UI source files UNLESS you find a genuine bug (design token audit finding, missing aria-live, etc.)

### Deliverables

- `test/ui-dashboard.test.js` — Vitest worker tests for the UI
- Updated `README.md` — Web UI section added
- Updated `src/ui/ui-shell.js` — comment banners at concatenation points (if not already present)
- Any polish fixes found during review

When you finish, report:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
