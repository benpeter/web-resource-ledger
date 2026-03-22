# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### (a) Minimum Viable Flow: API Key to Verified Capture

The JTBD here is: "When I want to evaluate WRL as a potential tool, I want to capture a web page and see its verification, so I can understand what WRL delivers before committing to integration."

The minimum viable flow has exactly four cognitive steps:

1. **Enter API key** -- one input field, one button. Nothing else visible until this succeeds.
2. **Submit a URL** -- one input field, one button. Pre-filled placeholder showing the expected format (`https://example.com`). Submit triggers POST to `/v1/captures` with the key as Bearer token.
3. **Wait and watch** -- the submitted capture appears immediately in a list with `pending` status. Auto-poll `/v1/captures/{id}/status` until terminal. Show a spinner or progress indicator on the pending item. No page navigation required -- the list IS the feedback.
4. **View result** -- click the completed capture to see verification detail, screenshot, and integrity checks.

That is four actions to reach the payoff. Every additional screen, toggle, or configuration option between "I have a key" and "I see a verified capture" is friction that directly works against the evaluation use case. The flow should feel like: paste, paste, wait, see.

Critical design constraint: the capture submission (step 2) and the list (step 3) should be the SAME view. Submitting a URL adds an item to the list below the form. This eliminates navigation, provides immediate feedback (the pending item appears), and lets the user submit multiple URLs without context-switching. The form is a persistent element at the top of the list view, not a separate page.

### (b) Auth Gate: Persistent Header Bar

Separate auth page is wrong for this use case. The user has already obtained a key (from the API, from an admin, from onboarding docs). They arrive at the UI wanting to DO something, not wanting to authenticate. Auth is a tollbooth, not a destination.

**Recommendation: inline auth prompt that transitions to a persistent key indicator.**

- On first load with no stored key: the page shows a single card in the center with the WRL wordmark, a brief one-line explanation ("Enter your API key to get started"), one input field (type=password with a show/hide toggle), and one button ("Connect").
- The input should accept paste (the primary input method -- users copy keys from 1Password, email, or docs). Autofocus the field.
- On successful auth (validate by making a lightweight API call -- `GET /v1/captures?limit=1` works): transition to the main UI. Store the key in `sessionStorage` (not localStorage -- evaluators should not have persistent auth on shared machines; security posture matches the key-as-bearer model).
- Once authenticated: show a compact bar or badge in the header area showing "Connected" with a "Disconnect" action. Do NOT show the key itself. The indicator serves as system status visibility (Nielsen heuristic 1) without leaking secrets.
- On auth failure: show the error inline below the input. Do not navigate, do not clear the input. Use the `alert--error` component from the design system.
- On disconnect: clear `sessionStorage`, return to the auth prompt.

Why NOT a separate page: the auth gate and the main UI share the same URL. This avoids the user bookmarking a "dashboard" URL that then redirects to a login page, which adds a round-trip and creates a "where did my page go?" moment. Single-page state management (auth vs. main) is simpler for both user and implementation.

Why NOT localStorage: the target user is an evaluator, not a daily operator. `sessionStorage` correctly scopes the credential to the tab lifetime. If they close the tab, they re-enter the key -- which is the right security posture for a Bearer token that grants capture access. A "remember me" checkbox could be added later if daily users emerge, but for MVP it is safer to default to ephemeral.

### (c) List View: Compact Table on Desktop, Card Stack on Mobile

The list view needs to answer one question per row: "What did I capture, when, and what happened to it?" That is three data points per item: URL, timestamp, status. This maps cleanly to a table.

**Recommendation: responsive table that collapses to cards on small screens.**

Desktop (>640px): Use the `.table` component from the design system. Three columns:
- **URL** -- truncated with ellipsis after ~50 characters, full URL in title attribute. Left-aligned. This is the primary identifier humans scan for.
- **Captured** -- relative time ("2 min ago", "yesterday") with full ISO date in title. Muted text. Right-aligned or second column.
- **Status** -- use the existing `.badge` components: `.badge--pass` for complete, `.badge--fail` for failed, and a new neutral badge for pending (the `.badge--skip` style works). Rightmost column.

Each row is clickable (entire row is the click target, not just the URL text). This is critical for mobile touch targets and reduces the "what do I click?" question to zero.

Mobile (<640px): Each capture becomes a card using the existing `.card` component. URL on top (full width, word-break), status badge inline, timestamp below in muted text. Stacked vertically. 44px minimum touch target height per card (already enforced by `.btn` min-height, apply same principle).

Why NOT a card grid on desktop: cards waste horizontal space on wide screens and reduce scanability. Tables are more information-dense for homogeneous lists. Cards are better when items have heterogeneous content (images, varied metadata) -- but capture list items are structurally identical.

Why NOT a timeline: timelines imply chronological narrative and visual weight. The evaluator is not reviewing a history -- they are checking on recent submissions. A timeline would over-emphasize the temporal dimension at the expense of URL identification.

Sorting: default to newest-first (`-created_at`), matching the API default. No sort controls in MVP -- the default is what evaluators need (see most recent submission first). Pagination: "Load more" button at the bottom, not numbered pages. The API already supports offset/limit.

### (d) Detail View: Extend the Verification Page, Do Not Clone It

The existing verification page (`verify-page.js`) is well-structured: status banner at top, metadata section, checks list, screenshot, cryptographic details in progressive disclosure. This is good information architecture.

**Recommendation: the detail view should render the same verification content, wrapped in the app shell (header with nav back to list, auth indicator), not as a standalone page.**

Specific approach:
- Reuse the same data-fetching logic (call `/v1/verify/{id}` and `/v1/captures/{id}` in parallel, same as the verification page does).
- Reuse the same rendering functions (status banner, checks list, screenshot, crypto details). Factor these out of `verify-page.js` into shared rendering utilities that both the standalone verification page and the in-app detail view can call.
- Add a "Back to captures" link/button at the top. This is the single navigation addition.
- Add the capture submission form ABOVE the detail view or suppress it -- the user is in "viewing" mode, not "submitting" mode. Suppress it (hide the form, show just the header bar with the back link).

Why reuse, not rebuild: (1) the verification page design is already validated -- it works, it communicates clearly, it handles edge cases (loading, error, consent details, screenshot fallbacks). (2) Consistency between the standalone verification URL (shared externally) and the in-app detail view builds trust. If they look different, the evaluator wonders "am I seeing the same thing?" (3) Less code to build and maintain -- the design system already has all needed components.

The detail view is NOT a "different view" -- it is the verification page content rendered within the app's navigation context.

### (e) Empty State Strategy

The empty state is the most critical screen for an evaluator. They have just authenticated. They have zero captures. The empty state must answer: "What do I do now?"

**Recommendation: the empty state IS the capture form, with contextual guidance.**

When the list is empty, instead of showing an empty table with "No captures yet", show:

1. The capture submission form (URL input + submit button), exactly where it always lives (top of the list area).
2. Below the form, a brief contextual message: "Submit a URL above to create your first capture. The page will be captured with a screenshot and cryptographic verification."
3. Optionally: a subtle example showing what a completed capture looks like (a static mock card with a sample URL, "complete" badge, and timestamp). This gives the user a mental model of what to expect before they have real data. This is a "recognition over recall" aid (Nielsen heuristic 6).

What NOT to do:
- Do not show an illustration or mascot graphic. This is a professional evidence tool, not a consumer app.
- Do not show a multi-step tutorial or walkthrough. The interface should be self-evident -- one input, one button.
- Do not show a "getting started" page that must be dismissed. The empty state should feel like the normal state with guidance, not like a special mode.

The goal: when the evaluator authenticates, they see the form, they understand immediately what to do, and within 10 seconds they have submitted their first URL. The empty state collapses naturally into the populated state as captures appear.

---

## Proposed Tasks

### Task 1: Define URL structure and routing strategy
**What:** Decide on the URL pattern for the web UI (e.g., `/app`, `/ui`, or root `/` with content negotiation). The current root has no handler. Define how the SPA-like behavior works within the existing regex router -- one HTML shell served for all UI paths, with client-side view switching.
**Deliverable:** Documented URL scheme and router additions.
**Dependencies:** None. Must be decided before any implementation.

### Task 2: Build the auth gate view
**What:** Implement the initial state: centered card with API key input, validation against the API (`GET /v1/captures?limit=1`), `sessionStorage` persistence, error handling. Transition to main view on success.
**Deliverable:** Auth gate HTML/CSS/JS that authenticates and stores the key.
**Dependencies:** Task 1 (URL routing).

### Task 3: Build the capture list + submission form (combined view)
**What:** Implement the main view: URL input form at top, capture list below. Form submits POST to `/v1/captures`, appends pending item to list. List fetches from `GET /v1/captures`, renders as responsive table/cards. Status polling for pending items. "Load more" pagination.
**Deliverable:** Combined form + list view with real API integration.
**Dependencies:** Task 2 (auth gate provides the stored key for API calls).

### Task 4: Build the detail view
**What:** Implement capture detail as an in-app view reusing verification page rendering logic. Factor out `buildResult`/`populate` from `verify-page.js` into shared utilities. Add back-navigation to list.
**Deliverable:** Detail view with full verification display, screenshot, crypto details.
**Dependencies:** Task 3 (list view provides navigation to detail). Refactoring `verify-page.js` is a sub-task.

### Task 5: Implement empty state
**What:** When the capture list returns zero items, render the form with contextual guidance text and an optional static example card showing what a completed capture looks like.
**Deliverable:** Empty state rendering within the list view.
**Dependencies:** Task 3 (list view must exist to have an empty state).

### Task 6: Mobile responsiveness pass
**What:** Test and adjust all views at 320px, 375px, and 640px breakpoints. Verify touch targets (44px minimum), form input usability (no zoom on focus in iOS -- requires font-size >= 16px on inputs), and table-to-card collapse behavior.
**Deliverable:** All views verified on mobile viewport sizes.
**Dependencies:** Tasks 2-5 complete.

### Task 7: CSP and CORS adjustments
**What:** The web UI will be served from the same origin as the API, so CORS is not an issue for API calls. However, the Content-Security-Policy needs to allow `connect-src 'self'` for fetch calls, `img-src 'self'` for screenshots, and `style-src 'unsafe-inline'` (already present in verify page). Review and set appropriate CSP for the UI pages.
**Deliverable:** CSP headers on UI page responses that allow the required API interactions.
**Dependencies:** Task 1 (URL routing determines which responses need which CSP).

---

## Risks and Concerns

### Risk 1: API key exposure in browser context
The API key will live in `sessionStorage` and be sent as a Bearer token on every fetch call. This is the expected pattern for SPAs with token auth, but it means the key is accessible to any JS running on the page. The CSP must be tight -- no third-party scripts, no `eval`, no external resources that could be compromised. The existing verify page CSP (`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`) is a good baseline.

**Mitigation:** Inherit the verify page's restrictive CSP. Do not add any external script sources. All JS must be inline within the served HTML.

### Risk 2: Polling load from pending captures
If the user submits multiple captures and the UI polls status for each pending item, this could generate significant request volume against the API. With 5 pending captures polling every 3 seconds, that is 100 requests/minute from one browser tab.

**Mitigation:** Use exponential backoff on status polling (start at 2s, grow to 15s). Only poll visible pending items. Stop polling after 5 minutes and show a "still processing -- refresh to check" message. A single `GET /v1/captures?status=pending` poll is more efficient than per-capture polling if the API supports it (it does via the `status` query param).

### Risk 3: `verify-page.js` refactoring breaks standalone verification
Factoring shared rendering logic out of `verify-page.js` to reuse in the detail view risks introducing regressions in the standalone verification page, which is a public-facing trust surface.

**Mitigation:** The standalone verification page must have integration tests that pass before and after the refactor. Alternatively, duplicate the rendering logic initially (accept the duplication cost) and consolidate later once both views are stable. Given YAGNI principles, duplication may actually be the right first move.

### Risk 4: Mobile input zoom on iOS
iOS Safari zooms in when a user focuses an input with font-size < 16px. The design system's `--text-base` is `0.875rem` (14px at default browser settings). Input fields using this size will trigger zoom, which is disorienting on mobile.

**Mitigation:** Set `font-size: 1rem` (16px) on `.input` elements within the web UI, or add `maximum-scale=1` to the viewport meta tag (but this harms accessibility by preventing user zoom). The 16px input fix is the correct approach.

### Risk 5: Over-building for the evaluator persona
The evaluator does not need filtering, sorting controls, batch submission, date range pickers, or export functionality. Every feature beyond "paste URL, see result" increases cognitive load for the primary user. The temptation to add dashboard-like features will be strong.

**Mitigation:** The MVP scope should be hard-capped at: auth, submit single URL, list recent captures, view detail. No filtering UI, no sort controls, no settings page. These can be added when a second persona (daily operator) is identified.

---

## Additional Agents Needed

**None required beyond the current team.** The design system already exists with components that cover the UI needs (buttons, inputs, cards, tables, badges, alerts, banners). The implementation is vanilla HTML/JS/CSS served from the existing Worker -- no new infrastructure. A frontend implementation specialist (if one exists in the agent roster) would handle the build, but the existing engineering agents should be sufficient given the vanilla JS constraint and the well-defined design system.

One caveat: if accessibility compliance (WCAG 2.1 AA) is a requirement for this UI, a **ux-design-minion** should review the implementation for contrast ratios, focus management during view transitions, screen reader announcements for status changes (polling updates), and ARIA attributes on the dynamic list. The existing verification page handles this reasonably well (has `aria-live`, `aria-label`, `.sr-only` utilities), but the more dynamic web UI (view switching, polling updates, form validation) introduces more accessibility surface area.
