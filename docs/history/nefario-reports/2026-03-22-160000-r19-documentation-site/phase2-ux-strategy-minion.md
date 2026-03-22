# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. Navigation Architecture: Sidebar Only (No Top Nav for Docs)

**Recommendation: Fixed sidebar on desktop, collapsible hamburger on mobile. No top nav bar for page-level navigation.**

Rationale (grounded in cognitive load and Krug's scanning behavior):

- **6 pages is the sweet spot for a flat sidebar.** Hick's Law says decision time increases logarithmically with options. Six items in a vertical list are scannable in under 2 seconds with zero scrolling. No grouping, no collapsible sections, no hierarchy needed. Adding a top nav *on top of* a sidebar splits the user's scanning pattern between two locations -- a violation of Nielsen's "consistency and standards" heuristic and an unnecessary working memory tax ("which nav has what I need?").

- **Developer docs convention strongly favors sidebar.** Every major API docs site (Stripe, Cloudflare, Twilio, MDN) uses sidebar navigation because developers scan vertically for topic hierarchies. A top nav makes sense for marketing sites with distinct audiences (Pricing, Blog, Product); WRL docs have a single audience (developers integrating WRL) with a single goal (learn how to use the API). One nav surface, one scanning path.

- **The existing WRL web UI uses a top nav bar** (`.app-nav` in `ui-css.js`). The docs site should NOT reuse this pattern. The web UI is a single-page app with 2-3 views; the docs site is a multi-page reading experience. Different jobs, different navigation patterns. Attempting to share the same shell creates a false consistency that hurts both experiences.

**Sidebar specification:**
- Desktop (>768px): Fixed position, 220px wide, left side. Always visible. No collapse toggle needed -- the page count doesn't warrant it.
- Mobile (<768px): Off-canvas, triggered by a hamburger button in a minimal top bar (logo + hamburger only). This top bar is NOT navigation -- it's a shell element.
- Visual treatment: Use `--color-surface` background, `--color-border` right edge. Active page indicated with `--color-primary` left border and `--weight-medium` text. Inactive links use `--color-text` at `--weight-normal`.
- Page order should follow the user's learning journey (see section 2 below).

### 2. Homepage vs Getting Started: Getting Started IS the Default

**Recommendation: The docs root URL (`/` or `/index.html`) should render the Getting Started page directly. No separate homepage.**

JTBD analysis: When a developer lands on docs, their job is "I want to start using this thing." A homepage that says "Welcome to WRL docs, here are the sections..." is a zero-value interstitial that adds one click to every first-time user's journey. It violates Krug's "don't make me think" -- the user thinks "ok, I'm here, now where do I go?" instead of immediately reading useful content.

**What "Getting Started" should contain:**
1. One-sentence product positioning (what WRL does)
2. Prerequisites (API key, curl/HTTP client)
3. The 4-step capture-and-verify flow from the README, adapted for standalone readability
4. A "What's next" section with links to Auth (for key management), API Reference (for full endpoints), and MCP (for AI agent integration)

**The "What's next" section is the homepage.** It serves the wayfinding role a homepage would serve, but only after the user has already accomplished something useful.

**Sidebar order (learning journey sequence):**
1. Getting Started (default/index)
2. Authentication
3. API Reference
4. Verification
5. Batch Operations
6. MCP Integration

This order follows the progressive disclosure principle: start with the minimum viable workflow (capture one URL), then layer in auth details, full API surface, integrity verification, batch operations, and finally the advanced MCP integration. Each page builds on the mental model established by the previous one.

### 3. Code Example Presentation

**Recommendation: Request/response pairs as the primary content pattern. Every endpoint gets a curl example with a realistic (but safe) response.**

Developer docs live or die by their code examples. The existing README already has good curl examples. The docs should elevate these to first-class content.

**Specific patterns:**

- **Request block + Response block, vertically stacked.** Label each with a small heading or caption ("Request" / "Response") using the `.data-label` style from the design system (uppercase, `--text-xs`, `--color-text-muted`). Do NOT use tabs to switch between request/response -- that hides information the user needs to see simultaneously.

- **Use the existing `.code-block` component** from the design system. It already has the right font (`--font-mono`), background (`--color-surface-muted`), border, and horizontal scroll. No syntax highlighting library needed for MVP -- monochrome code is perfectly readable for curl commands and JSON responses. Syntax highlighting is a Kano "performance" feature, not "must-be." It can be added later without structural changes.

- **Language labels on code blocks.** Add a small label ("bash", "json") in the top-right or top-left of the code block using absolute positioning. This reduces ambiguity about what the user is looking at. Use `--text-xs` and `--color-text-muted`.

- **Copyable code blocks.** A small "Copy" button in the top-right corner of each code block. This is a must-be feature for developer docs -- its absence is a friction point developers notice immediately. Implementation: a `<button>` that calls `navigator.clipboard.writeText()`. Progressive enhancement -- the button only appears if the Clipboard API is available. This is the ONE piece of JavaScript the docs site should include.

- **Use `wrl.example.com` consistently** as the placeholder host, matching the OpenAPI spec. Do not use the actual production URL in examples -- developers should substitute their own deployment.

- **Variable placeholders in a distinct style.** Use `YOUR_API_KEY`, `CAPTURE_ID` etc. in code examples. Render them in the same mono font but with a different color (suggest `--color-accent`) or with a subtle background highlight to make substitution points visually obvious.

### 4. API Reference Relation to Guides

**Recommendation: The API Reference page is a compact, scannable endpoint catalog. Guides (Getting Started, Auth, Verification, Batch, MCP) teach workflows. Cross-link heavily but don't merge them.**

This is a classic tension in developer docs. The resolution is clear from JTBD:

- **Guide pages serve the job:** "I want to accomplish X." They teach a workflow with context, prerequisites, and end-to-end examples.
- **API Reference serves the job:** "I need the exact parameters/response schema for endpoint Y." It's a lookup tool, not a learning tool.

**API Reference page structure:**
- Organized by tag (matching the OpenAPI tags: health, captures, verification, signing, admin)
- Each endpoint: method + path, one-line description, auth requirement badge, request parameters table, response schema table, one curl example, one response example
- Use the `.table` component from the design system for parameter/schema tables
- Use `.badge` components for HTTP methods (GET = `--color-info`, POST = `--color-success`, DELETE = `--color-error`)
- Use the `.disclosure` component (HTML `<details>`) for response schemas that are long -- collapse by default, expand on click. This is progressive disclosure at the content level.

**Cross-linking pattern:**
- From Guide pages: "For the full list of query parameters, see [API Reference > List Captures](#list-captures)"
- From API Reference: "For a complete walkthrough of the capture lifecycle, see [Getting Started](/getting-started)"
- Cross-links should appear inline in prose, not in a separate "Related pages" box. Inline links match the user's reading flow; sidebar boxes interrupt it.

### 5. Minimal Design System Additions for Docs

The existing design system covers ~80% of what the docs site needs. The following additions are required, and they should be added to the design system (not as one-off page styles) because they represent reusable documentation patterns:

**Must-add components:**

1. **`.docs-layout`** -- A two-column layout container (sidebar + main content). CSS Grid: `grid-template-columns: 220px 1fr` on desktop, single column on mobile. This is structural, not decorative.

2. **`.docs-sidebar`** -- Sidebar container with fixed positioning on desktop. Uses existing tokens (`--color-surface`, `--color-border`). Nav list is a simple `<nav>` with `<a>` elements, no nested lists needed for 6 pages.

3. **`.docs-nav-link`** -- Similar to the existing `.nav-link` but vertical. Active state: left border `3px solid --color-primary`, `--weight-medium`. Idle state: transparent left border, `--weight-normal`. `padding: --space-3 --space-4`. Focus-visible: reuse existing `2px solid --color-primary` outline pattern.

4. **`.docs-content`** -- Main content column. `max-width: 42rem` (approximately 670px at 16px base, targeting ~70 characters per line for optimal readability). `padding: --space-8` on desktop, `--space-4` on mobile. `line-height: --leading-relaxed` for body text.

5. **`.docs-heading`** -- Heading styles for h1/h2/h3 within docs content. Add `id` attributes for deep linking (anchor fragments). Include a subtle `#` link icon on hover for heading anchors -- developers expect to be able to link to specific sections.

6. **`.docs-endpoint`** -- A compact card for API reference entries. Uses the existing `.card` component as base, with method badge, path in mono, and description.

**Should NOT add:**
- Table of contents / on-page nav. With 6 pages, the sidebar is sufficient wayfinding. On-page TOC adds a third nav element and splits attention.
- Search. Krug says "every page needs search" but that applies at scale. 6 pages are scannable by sidebar alone. Search would cost more to implement than it saves in user effort. Add it when page count exceeds ~15.
- Breadcrumbs. The information architecture is flat (one level). Breadcrumbs on a flat site are noise.
- Dark mode toggle. Not in the design system, not a must-be feature, and would double the CSS surface for no demonstrated user need.
- Previous/Next page navigation at the bottom. With a persistent sidebar, the user always knows where they are and where they can go. Bottom nav is redundant.

### 6. Reading Experience Optimization

**Line length:** The `.docs-content` container should cap at `max-width: 42rem`. At the design system's `--text-md` (1rem = 16px), this yields approximately 65-70 characters per line -- the sweet spot for sustained reading. The existing `.code-block` should overflow horizontally within this column rather than wrapping, which it already does (`overflow-x: auto; white-space: pre`).

**Vertical rhythm:** Prose paragraphs: `margin-bottom: --space-4`. Headings: `margin-top: --space-8; margin-bottom: --space-3` (the asymmetric spacing groups headings with their content, not with the preceding section). Code blocks: `margin: --space-4 0` (same as paragraphs, preventing them from feeling disconnected from surrounding prose).

**Visual hierarchy within pages:**
- h1: Page title, `--text-2xl`, `--weight-bold`. One per page.
- h2: Major sections, `--text-xl`, `--weight-bold`. These are the primary scanning targets.
- h3: Sub-sections, `--text-lg`, `--weight-medium`. Used within API Reference for individual endpoints.
- Body text: `--text-md`, `--weight-normal`, `--leading-relaxed`.
- Code inline: `--font-mono`, `--text-sm`, with subtle `--color-surface-muted` background and `--radius-sm` rounding.

### 7. Accessibility Considerations for Lighthouse >= 90

The 90+ Lighthouse accessibility score is achievable with minimal effort if the HTML is semantic from the start:

- Use `<nav aria-label="Documentation">` for the sidebar
- Use `<main>` for the content area
- Use `<article>` as the content wrapper per page
- Heading hierarchy must be sequential (h1 > h2 > h3, no skipping levels)
- All links must have descriptive text (not "click here")
- Code blocks: use `<pre><code>` semantic elements
- Color contrast: verify that `--color-text-muted` (#6e6a66) on `--color-bg` (#f7f6f5) passes WCAG AA. Quick check: contrast ratio is approximately 3.5:1 -- this FAILS AA for normal text (requires 4.5:1). **This is a risk.** Either darken the muted text color for docs body text or ensure muted text is only used at `--text-lg` or larger (where AA requires only 3:1).
- Skip link: Add a visually hidden "Skip to content" link as the first focusable element, targeting the `<main>` element. The design system already has `.sr-only`.
- The hamburger menu on mobile must have `aria-expanded`, `aria-controls`, and `aria-label`.

## Proposed Tasks

### Task 1: Define Documentation Site Information Architecture

**What:** Finalize page inventory, URL structure, sidebar order, and cross-link map.

**Deliverables:**
- Page inventory with URLs: `/` (Getting Started), `/auth`, `/api-reference`, `/verification`, `/batch`, `/mcp`
- Cross-link specification: which pages link to which, in what context
- Heading structure for each page (h1/h2/h3 outline)

**Dependencies:** None. This task should happen first and inform all other tasks.

### Task 2: Add Documentation Layout Components to Design System

**What:** Add the 6 CSS components listed in section 5 (`.docs-layout`, `.docs-sidebar`, `.docs-nav-link`, `.docs-content`, `.docs-heading`, `.docs-endpoint`) to `design-system.css`.

**Deliverables:**
- Updated `design-system.css` with docs layout components
- Updated `design-system.js` (the JS export mirrors the CSS)
- Responsive behavior: sidebar collapses to hamburger at 768px

**Dependencies:** Task 1 (need to know what the sidebar contains and how the layout works).

### Task 3: Build HTML Page Template

**What:** Create the base HTML template that all 6 pages share. Includes `<head>`, sidebar nav, main content area, skip link, copy-button JS, and mobile hamburger toggle.

**Deliverables:**
- HTML template file (or 11ty layout)
- Includes: design system CSS, docs-specific CSS, copy-to-clipboard JS (~15 lines)
- Mobile hamburger toggle (~10 lines of JS, no framework)
- Validated against Lighthouse accessibility

**Dependencies:** Task 2 (needs the layout CSS).

### Task 4: Write Getting Started Page Content

**What:** Adapt the README's usage section into a standalone Getting Started guide. This page IS the docs index/homepage.

**Deliverables:**
- Getting Started HTML page
- 4-step capture workflow (submit, poll, retrieve, verify)
- Prerequisites section
- "What's next" wayfinding section

**Dependencies:** Task 3 (needs the template).

### Task 5: Write API Reference Page

**What:** Generate a compact endpoint catalog from the OpenAPI spec. Each endpoint gets method badge, path, description, params table, and curl+response example.

**Deliverables:**
- API Reference HTML page
- All endpoints from openapi.yaml represented
- Progressive disclosure (`<details>`) for verbose response schemas
- HTTP method badges using `.badge` component

**Dependencies:** Task 3.

### Task 6: Write Auth, Verification, Batch, and MCP Pages

**What:** Create the remaining 4 guide pages. Auth covers API key types and scopes. Verification covers the integrity checking workflow. Batch covers the multi-URL endpoint. MCP adapts the existing `docs/mcp.md` content.

**Deliverables:**
- 4 HTML pages
- Each with workflow-oriented content, code examples, and cross-links to API Reference
- MCP page should include client-specific setup snippets (Claude Code, Cursor, Windsurf) -- content already exists in `docs/mcp.md`

**Dependencies:** Task 3, Task 5 (need API Reference anchors for cross-links).

### Task 7: Accessibility Audit and Contrast Fix

**What:** Run Lighthouse on all 6 pages. Fix the `--color-text-muted` contrast issue identified in section 7. Verify heading hierarchy, landmark regions, and focus management.

**Deliverables:**
- Lighthouse accessibility score >= 90 on all pages
- Contrast fix for muted text (either darkened color or restricted usage)
- Validated heading hierarchy, skip link, ARIA attributes

**Dependencies:** Tasks 4-6 (needs all pages built).

## Risks and Concerns

### 1. Muted Text Color Contrast Failure (HIGH)

The design system's `--color-text-muted` (#6e6a66) on `--color-bg` (#f7f6f5) has approximately 3.5:1 contrast ratio. WCAG AA requires 4.5:1 for normal text. This will cause Lighthouse accessibility deductions. The docs site will use muted text extensively (code labels, captions, sidebar links). **Mitigation:** Define a docs-specific `--color-text-muted-accessible` or darken the global token to ~#5a5650 (4.6:1). This needs a decision from the design/brand owner because it affects all surfaces using the design system.

### 2. Design System Duplication

The design system currently exists in two files: `src/design-system.css` (source of truth) and `src/design-system.js` (JS export for the Worker-rendered UI). The docs site will import the CSS file directly (static site). Any additions to the design system must be mirrored in both files, or this duplication will drift. **Mitigation:** Either automate the JS generation from the CSS source, or accept the duplication risk and document the mirror requirement prominently.

### 3. API Reference Freshness

If the API Reference is hand-written HTML derived from `openapi.yaml`, it will drift as the API evolves. **Mitigation:** Either generate the API Reference page from the OpenAPI spec at build time (using a script, not a framework), or accept the drift risk and add a note like "Canonical API spec: openapi.yaml" with a link. For a 6-page site, manual maintenance is viable in the short term.

### 4. Content Volume Mismatch

The MCP page (`docs/mcp.md`) is already ~320 lines of well-structured content. The Auth page has less existing material. If some pages end up much longer than others, the reading experience feels uneven. **Mitigation:** Use progressive disclosure (`<details>`) for detailed reference sections within longer pages. The MCP page's "Troubleshooting" section, for instance, could be collapsed by default.

### 5. Mobile Sidebar JavaScript

The hamburger menu toggle requires JavaScript. If the constraint is truly "no JS framework," a ~10-line vanilla JS toggle is fine. But if the intent is "no JS at all," the mobile nav pattern needs rethinking (CSS-only hamburger using a hidden checkbox). **Clarification needed:** Does "no JS framework" mean no React/Vue/etc., or no JavaScript whatsoever? The copy-to-clipboard button also requires JS. Both are progressive enhancements that degrade gracefully.

## Additional Agents Needed

**ux-design-minion (or equivalent visual design specialist):** My recommendations cover information architecture, navigation patterns, and cognitive load -- the "what" and "why." The actual CSS implementation of the docs layout components (Task 2), the responsive breakpoint behavior, and the visual polish of code blocks, method badges, and sidebar styling need a design execution specialist. I've provided the token references and component names, but the pixel-level details (exact padding, transitions, hover states for the hamburger) are outside my scope.

**accessibility-minion (optional, could be folded into the implementation review):** The contrast ratio issue I flagged in `--color-text-muted` needs a definitive measurement and a decision about whether to fix it globally (affecting the web UI) or locally (docs-only override). This is a small enough scope that the implementing agent could handle it, but if there's a dedicated accessibility specialist, they should review the final pages before declaring the Lighthouse 90+ target met.
