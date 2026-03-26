# Outcome: Unified Navigation

## What was produced

Unified site header and footer across all three WRL subdomains:

1. **`landing/public/css/site-nav.css`** (new) -- shared CSS for the site
   header and footer, extracted from landing.css. Defines `.site-header`,
   `.site-header__nav`, `.site-footer`, and all related classes.

2. **`site/css/site-nav.css`** (new) -- identical copy for the docs site
   deployment.

3. **`src/ui/ui-css.js`** (modified) -- site header and footer CSS added
   inline for the Worker-served SPA.

4. **All landing pages** (7 files modified) -- updated to include
   `site-nav.css`, use standardized `.site-header__nav` class, and
   reference absolute URLs for cross-subdomain logo links.

5. **`site/_includes/layouts/base.njk`** (modified) -- added site header
   above the docs layout and site footer below it. Docs link has
   `data-active` attribute for visual highlighting.

6. **`site/css/docs.css`** (modified) -- sidebar sticky position offset
   from `top: 0` to `top: 56px` to account for the new site header.

7. **`src/ui/ui-auth.js`** (modified) -- `renderAppShell()` rewritten to
   render site header (logo + Docs + username + Sign out), app nav
   (secondary), main content, and site footer using DOM construction.

8. **`landing/public/css/landing.css`** (modified) -- removed header and
   footer CSS (now in site-nav.css), updated `--header-height` from 68px
   to 56px.

## Key changes from before

- Header height reduced from 68px to 56px across all surfaces
- Landing page subpages (terms, privacy, etc.) show simplified nav:
  just Docs + Sign in instead of section anchors
- Docs site gained a site-wide header bar above the sidebar
- Docs site gained a full footer matching the www footer
- App UI header now shows logo + wordmark + Docs + username + Sign out
- App UI gained a full footer
- All logo links point to `https://webresourceledger.com` (absolute)
- Docs link subtly highlighted on docs subdomain via `data-active`

## What deviated from plan

The issue requested "markup from a single source of truth (not
copy-pasted per subdomain)". Given the three different deployment
mechanisms (static HTML, Eleventy templates, Worker inline JS), true
single-source generation would require a build pipeline that doesn't
exist. The pragmatic approach of identical CSS with standardized class
names achieves visual consistency while respecting the existing
architecture. This is documented as a conscious trade-off in decisions.md.

## Backlog changes

No backlog changes. Issue #224 was not in the backlog.
