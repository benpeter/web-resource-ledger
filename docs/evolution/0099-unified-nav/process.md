# Process: Unified Navigation

## TL;DR

Single-agent execution (no nefario orchestration). Unified the navigation
header and footer across all three WRL subdomains (www, docs, api/ui) by
extracting shared CSS into a `site-nav.css` file, adding a site header to
the docs site template and app UI, and adding a full footer to both. The
app UI's `renderAppShell()` was rewritten to separate site-level navigation
(header) from app-level navigation (secondary bar). 14 files changed.

## Approach

Analyzed the current navigation across all three surfaces:

1. **Landing page** (7 static HTML files): Full header with 5+ nav links,
   full footer. Header/footer copy-pasted across all pages with a comment
   reminding maintainers to keep them in sync.

2. **Docs site** (Eleventy template): Sidebar-only navigation with a
   logo in the sidebar header. Minimal footer ("View on GitHub"). No
   site-wide header bar.

3. **App UI** (Worker inline JS): JavaScript-rendered nav bar mixing app
   navigation (Captures, Schedules, etc.) with site-level actions (Docs
   link, username, Sign out) in a single horizontal bar. No footer.

The gap was clear: each surface had its own navigation idiom, and users
moving between subdomains experienced visual discontinuity.

## Key decisions

**CSS extraction over build-time generation**: Rather than building a
shared component pipeline (rejected as YAGNI), extracted the header and
footer CSS into a standalone `site-nav.css` that each surface includes.
The Worker UI necessarily inlines its CSS, so the same styles are
replicated in `ui-css.js`. Three copies of the same CSS is a conscious
trade-off -- the file is small and changes infrequently.

**Header height reduction**: Dropped from 68px to 56px. The original
height accommodated a landing page nav with 5 section links + Docs +
Sign in. The unified header has at most Docs + username + Sign out (3
items), so the extra space was wasted. 56px still provides 44px touch
targets.

**App UI restructured into three layers**: Site header (cross-subdomain
navigation) + app nav (view-level navigation) + footer. The old design
mixed these concerns in a single bar. The separation creates clearer
visual hierarchy and makes the app feel like part of the WRL product
family rather than a standalone tool.

**Footer in app UI uses text-only branding**: The logo SVG is a static
file that would require additional Worker asset handling. Text-only
wordmark is sufficient and avoids the complexity.

## What went smoothly

- The CSS extraction was clean -- header and footer styles were already
  well-namespaced with `.site-header` and `.site-footer` prefixes.
- The docs site Eleventy build confirmed the new template works with no
  modifications to the build pipeline (passthrough copy picks up the new
  CSS file automatically).
- All landing page subpages followed the same template pattern, enabling
  mechanical updates.

## Where to look

- CSS source of truth: `landing/public/css/site-nav.css`
- Docs integration: `site/_includes/layouts/base.njk`
- App UI integration: `src/ui/ui-auth.js` (`renderAppShell` function)
  and `src/ui/ui-css.js` (inline styles)
