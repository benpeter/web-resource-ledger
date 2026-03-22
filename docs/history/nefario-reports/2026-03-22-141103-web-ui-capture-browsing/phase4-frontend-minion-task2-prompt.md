## Task: Combined capture submit form + capture list view

Build the main view of the WRL Web UI: a combined view where the capture submission form sits above the capture list. This is the primary screen users see after authenticating.

### Context

Task 1 established the HTML shell, hash router, auth gate, and CSS foundation. The shell in src/ui/ui-shell.js imports view modules and concatenates their JS into a single script block. Each view module exports a JS string constant containing renderXxx() and mountXxx() functions.

The #/captures hash route should show this combined view. The submit form and list are the SAME view — submitting a URL adds an item to the list below the form, providing immediate feedback.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/steady-singing-eagle

### What to build

**1. Capture submit form (src/ui/ui-submit.js)**
- Replace the stub with a real implementation
- The submit form is part of the combined view (rendered at the top of renderCaptures())
- Form elements:
  - URL input: create via createElement, type="url", class="input", placeholder="https://example.com"
  - Submit button: class="btn btn--primary", text "Capture"
  - Client-side validation: must be http: or https: protocol (use new URL() to parse)
  - On invalid URL: show inline error below the input (use .alert .alert--error)
- On submit:
  - Disable the submit button, show loading state ("Capturing...")
  - Call apiFetch('/v1/captures', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({url}) })
  - On 201/202: extract captureId from response. Add a new pending item to the top of the list (optimistic UI). Start polling for that capture's status.
  - On error (4xx/5xx): show the detail field from the Problem Details JSON response (truncated to 200 chars). Re-enable the submit button.
  - On network error: show "Connection failed" error. Re-enable the submit button.
- After successful submission, clear the URL input but keep it focused for rapid multi-submission

**2. Capture list (src/ui/ui-submit.js — same file, same combined view)**
- Fetch captures from apiFetch('/v1/captures?limit=20')
- Render as a SINGLE responsive structure using CSS grid/flexbox (NOT dual table/cards DOM):
  - Use semantic list structure or single DOM that adapts via CSS media queries
  - Desktop (>640px): columnar layout showing URL (truncated with title attr), Time (relative with full ISO in title), Status (badge)
  - Mobile (<640px): stacked layout with each item showing URL (full width, word-break), status badge, relative time
  - Each item must be an <a> element linking to #/captures/{id} for keyboard accessibility (WCAG 2.1.1)
- Status badges using existing design system classes:
  - complete -> .badge .badge--pass with text "Complete"
  - failed -> .badge .badge--fail with text "Failed"
  - pending -> .badge .badge--skip with text "Pending"
- Pagination: "Load more" button at the bottom when hasMore is true. Button fetches next page with offset parameter and appends to existing list.
- Show total count: "Showing N of M captures"
- Default sort: newest first (API default)

**3. Empty state**
- When the list returns zero items, show the submit form (always visible) with contextual guidance below it: "Submit a URL above to create your first capture. The page will be captured with a screenshot and cryptographic verification."
- Do NOT show an illustration or mascot. Keep it professional.

**4. Polling integration (src/ui/ui-poll.js)**
- Replace the stub with real polling logic
- startPolling(captureId, onUpdate) function:
  - Calls apiFetch('/v1/captures/' + captureId + '/status') using setTimeout (NOT setInterval)
  - Respects Retry-After header from response, defaults to 5 seconds, caps at 30 seconds
  - On status: 'complete': call onUpdate with complete data, stop polling
  - On status: 'failed': call onUpdate with failure data, stop polling
  - On network error: increment retry counter, only show error after 3 consecutive failures
  - After 120 seconds total: stop polling, show "Taking longer than expected. The capture ID is {id} — check back later."
  - Pause polling when document.visibilityState === 'hidden' (save battery on mobile), resume on visible
- When a pending capture completes: update its row in the list in-place (swap badge, add timestamp)
- Show elapsed time on pending items: "Capturing... 15s"
- Add an aria-live="polite" region for status announcements so screen readers are notified of polling changes

**5. Combined render function**
- The renderCaptures() function builds the DOM for both the form and the list
- The mountCaptures() function wires up: form submit handler, list click handlers, pagination, and starts polling for any pending items

### Security requirements

- All dynamic content from API responses MUST use textContent or createElement — NEVER innerHTML with API data
- URLs displayed as links must be validated with safeUrl():
  ```
  function safeUrl(urlStr) {
    try { var u = new URL(urlStr); return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null; }
    catch { return null; }
  }
  ```
  Set href via element.setAttribute('href', safeUrl(url)) or a.href = safeUrl(url). When safeUrl returns null, render the URL as plain text (not a link).
- Error messages from the API: display the detail field via textContent. Truncate to 200 characters before display.
- Never use innerHTML with any variable data — only use innerHTML = '' to clear containers

### Files to reference

- src/ui/ui-shell.js — the shell that imports your modules
- src/ui/ui-auth.js — provides apiFetch() for authenticated requests
- src/ui/ui-css.js — add any additional CSS needed for the list/form here
- src/design-system.js — available CSS components and tokens
- src/verify-page.js — reference for how data display works (textContent pattern)
- The API returns Problem Details JSON (RFC 9457) for errors — parse detail field for user display

### What NOT to do

- Do NOT create separate routes for submit and list — they are ONE combined view at #/captures
- Do NOT add sorting or filtering controls (MVP scope: newest-first only)
- Do NOT add thumbnails/screenshots to the list view
- Do NOT modify any backend API endpoints
- Do NOT use innerHTML with any data from API responses
- Do NOT add hasWacz to the API response
- Do NOT create dual DOM structures (separate table + cards) — use single responsive structure
- Do NOT add a "Try again" prefill feature for failed captures — just use "Back to captures" link

### Deliverables

- Updated src/ui/ui-submit.js — capture form + list in combined view with validation, submission, error handling, pagination
- Updated src/ui/ui-poll.js — polling logic with backoff, visibility pause, timeout, aria-live
- Updated src/ui/ui-css.js — any additional CSS for list/form components

When you finish, report:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
