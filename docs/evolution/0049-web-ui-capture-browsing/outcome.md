# Outcome: 0049 — Web UI for Capture Submission and Browsing

## What Was Built

A browser-based Web UI for WRL served at `GET /ui` from the existing Cloudflare Worker. Vanilla HTML/JS/CSS, no frameworks, no build step. The UI provides:

1. **Auth gate** — API key input with sessionStorage, validated against the API before granting access. Disconnect button clears session.

2. **Capture submission** — URL input with client-side validation (http/https only). Optimistic UI adds pending item to list immediately. Polling tracks capture progress.

3. **Capture list** — Paginated list of captures with status badges (Complete/Pending/Failed). Single responsive CSS grid layout adapts from columnar (desktop) to stacked (mobile). "Load more" pagination.

4. **Capture detail** — Full capture information: metadata grid, screenshot display, artifact download links, verification link. Pending captures show live polling with elapsed time. Failed captures show error message.

5. **Polling** — setTimeout-based with Retry-After header respect, visibility pause (saves battery on mobile), 120-second timeout, aria-live announcements for screen readers.

6. **Tests** — 38 new Vitest worker tests covering response headers, CSP, HTML structure, design system tokens, innerHTML security scan, polling module guards, and route integration.

## Files Created/Modified

| File | Action | Lines |
|------|--------|-------|
| src/ui/ui-shell.js | Created | 125 |
| src/ui/ui-auth.js | Created | 242 |
| src/ui/ui-css.js | Created | 675 |
| src/ui/ui-submit.js | Created | 560 |
| src/ui/ui-detail.js | Created | 584 |
| src/ui/ui-poll.js | Created | 142 |
| src/index.js | Modified | +7 |
| test/ui-dashboard.test.js | Created | 276 |
| README.md | Modified | +9 |
| **Total** | | **+2620** |

## Surprises

- **CSP/favicon conflict**: The verify-page.js pattern uses inline `data:` SVG for the favicon, but the UI's strict `img-src 'self'` CSP blocks data: URIs. Lucy caught this during the Task 1 gate review. Fixed by referencing `/favicon.ico` (existing Worker route) instead.

- **innerHTML test regex**: The security test for innerHTML-with-variables used a regex that would pass concatenations like `'' + someVar`. Code-review-minion caught this. Fixed with proper anchoring.

## What Deviated from Plan

- The synthesis plan included a root redirect (`GET / → 302 /ui`). Lucy flagged this as out of scope during Phase 3.5. Removed.
- The plan referenced `data:` in img-src CSP. Security-minion originally recommended it. Overridden to keep `img-src 'self'` tight, with favicon fix as the resolution.

## Backlog Changes

- ~~R17: Web UI for capture submission and browsing~~ → **Done** (this phase)
- Added to parking lot: E2E Playwright browser tests for the Web UI (deferred by specialist consensus — primary value is in server-side HTML generation tests which are covered)
- Added to parking lot: AbortController for auth validation timeout (code-review finding — low risk, good practice for later)
