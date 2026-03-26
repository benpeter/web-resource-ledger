# Outcome: Sign-in Button Contrast Fix

## What Was Built

Single CSS fix in `landing/public/css/landing.css` (net +5 lines):
- 3 selector modifications: added `:not(.btn)` to `.site-header nav a`, `:hover`, and `:focus-visible` selectors
- 1 new rule: `.site-header nav .btn--primary:visited` guard
- 1 explanatory comment

## What Changed

| State | Before (broken) | After (fixed) | WCAG AA |
|-------|-----------------|---------------|---------|
| Default | #6e6a66 on #2a3444 (~2.5:1) | #f8f8fa on #2a3444 (~11.8:1) | PASS |
| Hover | Nav hover overrode btn--primary:hover | #f8f8fa on #1f2835 (~14.0:1) | PASS |
| Focus-visible | Inherited broken default color | #f8f8fa on #2a3444 (~11.8:1) | PASS |
| Visited | Browser default purple risk | #f8f8fa on #2a3444 (~11.8:1) | PASS |

All 7 landing pages (index, privacy, security, terms, refund-policy, content-policy, 404) share the same CSS and are fixed automatically.

## Surprises

- The bug was worse than initially scoped — hover and focus-visible states were also broken, not just the default state
- The `:visited` edge case was non-obvious but real: the auth URL will be in browser history for returning users

## Surface Consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — CSS-only change |
| Docs site | No update needed — visual bug fix |
| Landing page | **Updated** — this is the fix itself |
| MCP server | No update needed — no API changes |
| Legal pages | No update needed — they benefit from the shared CSS fix automatically |

## Backlog Changes

No backlog changes. This was a bug fix, not a feature. No items deferred or created.
