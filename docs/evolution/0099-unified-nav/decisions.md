# Decisions: Unified Navigation

## 1. Shared CSS file vs. build-time component

**Decision**: Create a `site-nav.css` file that each subdomain includes
independently. Each deployment target gets its own copy of the file.

**Alternatives considered**:
- **Runtime fetch (CDN-hosted shared CSS)**: Would create a cross-origin
  dependency and a SPOF. Rejected -- violates "latency is not an option"
  and adds operational complexity for no meaningful benefit.
- **Build-time component generation**: Would require a shared build step
  across three independent deployment pipelines (static files, Eleventy,
  Worker inline JS). Rejected -- YAGNI, overcomplicated for the current
  setup.
- **Inline CSS in each template**: Current approach for the Worker UI but
  not desirable as the source of truth. Rejected for landing/docs.

**Rationale**: Three independent copies of one CSS file is the simplest
approach. The file is small (~180 lines), changes infrequently, and any
drift between copies is immediately obvious in visual QA. The Worker UI
necessarily inlines its CSS (since it's a JS-served SPA), so it gets the
same styles defined in ui-css.js.

## 2. Header height change: 68px to 56px

**Decision**: Reduce the site header from 68px to 56px.

**Rationale**: The original 68px was generous for a landing page with
many nav links. The unified header has fewer links (Docs + Sign in for
www/docs, Docs + username + Sign out for api). 56px provides adequate
touch targets while reducing visual weight, especially important on the
docs site where vertical space is at a premium with the sticky sidebar.

## 3. Docs sidebar retains its own logo

**Decision**: Keep the docs sidebar header with its own logo and "WRL
Documentation" branding.

**Rationale**: The sidebar logo serves as a docs-specific identifier and
links to the docs root (`/`). Removing it would leave the sidebar without
a clear anchor. The site-wide header logo links to `webresourceledger.com`
(cross-origin), which is a different navigation target.

## 4. App UI: site header replaces old nav actions section

**Decision**: The app UI's `renderAppShell()` now renders three layers:
1. Site header (logo, Docs link, username, Sign out)
2. App nav (Captures, Schedules, Billing, Notifications, Settings)
3. Main content area + Site footer

The old nav-actions section (which mixed Docs, username, and Sign out
inline with the app nav) is eliminated. Username and Sign out move to
the site header. The Docs external-link icon is dropped (unnecessary
visual noise in the unified header context).

**Rationale**: This creates a clear visual hierarchy -- site-level
navigation in the header, app-level navigation in the secondary bar.
Users can always reach cross-subdomain destinations from the header
regardless of which app view they're in.

## 5. Subpage headers simplified

**Decision**: Landing page subpages (terms, privacy, etc.) now show only
Docs + Sign in in the header nav, dropping the section anchors (How It
Works, Use Cases, Pricing).

**Rationale**: Section anchors like `#use-cases` only work on the home
page. On subpages, they either navigate away from the current page
(confusing) or do nothing. Keeping just Docs + Sign in maintains
cross-subdomain consistency.

## 6. Footer in app UI omits logo image

**Decision**: The app UI footer uses only the text wordmark, not the SVG
logo image.

**Rationale**: The app UI serves everything from the Worker. The logo SVG
is a static file that would need to be either inlined (bloating the JS
payload) or served as a separate asset. The text wordmark is sufficient
for brand identification in the footer context.

## 7. Docs link highlighted on docs subdomain

**Decision**: Use a `data-active` attribute on the Docs link in the docs
site header, styled identically to `aria-current="page"` via CSS.

**Rationale**: `aria-current="page"` would be semantically imprecise
since the Docs link points to the docs root, not the current page. A
data attribute provides the visual highlighting without misleading
assistive technology.
