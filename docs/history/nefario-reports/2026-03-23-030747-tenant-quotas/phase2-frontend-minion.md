## Domain Plan Contribution: frontend-minion

### Recommendations

#### (a) New view (`#/usage`) vs. section within settings

**Recommendation: New section within the existing `#/settings` view.**

Rationale:
- The settings view already follows a card-per-section pattern (Account info card, API Keys card). Usage/quota fits naturally as a third card section between Account and API Keys.
- Adding a new top-level route (`#/usage`) for what amounts to a read-only summary would fragment the UI. A tenant's account page is the natural home for "what's my plan, how much have I used."
- The nav bar is already tight (Captures, Settings). Adding a third link for a secondary info display isn't justified.
- The settings view already fetches data on mount (`mountSettings` calls `apiFetch` for keys). Adding one more parallel fetch for usage follows the same pattern with minimal code change.
- The UX-strategy minion may separately recommend surfacing a quota warning on the captures view (e.g., a banner when >80% used). That's a separate concern from the dashboard location.

#### (b) Data source: new `GET /v1/account/usage` vs. inline in `/auth/session`

**Recommendation: New `GET /v1/account/usage` endpoint, NOT inline in `/auth/session`.**

Rationale:
1. **Separation of concerns.** `/auth/session` fires on every page load (boot check). It should remain lightweight -- a single D1 lookup returning auth state. Adding usage counters, quota limits, and tier info bloats the boot payload and adds a D1 join/read that runs even when the user isn't visiting settings.

2. **Follows existing patterns.** The `/v1/account/*` namespace already has session-gated endpoints (keys, tos). Adding `/v1/account/usage` is one route tuple in `index.js` and one handler in `account.js`. The session auth gate, CSRF exemption (GET is exempt), ToS enforcement, and rate limiting are already wired for any `/v1/account/*` route.

3. **Cacheability.** A dedicated usage endpoint can return `Cache-Control: private, max-age=60` so the browser doesn't re-fetch on every settings navigation within a minute. Embedding in `/auth/session` (which returns `no-store` for security) prevents this.

4. **Response shape.** The endpoint should return the same fields as the admin endpoint plus quota limits:
   ```json
   {
     "tenantId": "gh-12345",
     "period": "2026-03",
     "tier": "free",
     "captures": { "used": 42, "limit": 100 },
     "storageBytes": { "used": 524288000, "limit": 1073741824 },
     "updatedAt": "2026-03-23T10:15:00.000Z"
   }
   ```
   This shape gives the frontend everything it needs in one call: current usage and the quota ceiling, without needing to know tier-to-limit mappings client-side.

5. **The existing admin endpoint (`GET /v1/admin/usage`) cannot be reused** -- it requires the ADMIN_KEY auth, not session auth, and its response shape lacks quota limits. A separate session-gated endpoint is the clean path.

#### (c) Minimal viable progress bar in vanilla CSS

The progress bar should be implemented as a pair of nested `<div>` elements with ARIA attributes. No framework, no `<progress>` element (which has inconsistent cross-browser styling), no JavaScript animation.

**HTML structure** (built with `document.createElement`, matching the existing DOM-construction pattern):

```html
<div class="usage-bar" role="progressbar"
     aria-valuenow="42" aria-valuemin="0" aria-valuemax="100"
     aria-label="42 of 100 captures used">
  <div class="usage-bar-fill" style="width: 42%"></div>
</div>
```

**CSS** (uses existing design tokens only):

```css
.usage-bar {
  height: 8px;
  background: var(--color-surface-muted);
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--color-border-subtle);
}

.usage-bar-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-sm);
  transition: width 0.2s ease;
  min-width: 0;
}

/* Warning threshold: >80% */
.usage-bar-fill--warning {
  background: var(--color-warning);
}

/* Critical threshold: >95% */
.usage-bar-fill--critical {
  background: var(--color-error);
}
```

**Key implementation details:**

- Width is set via inline `style` attribute (percentage clamped 0-100 in JS). This avoids creating CSS classes for every possible width value.
- Color thresholds: `<=80%` uses `--color-accent` (blue-teal), `>80%` uses `--color-warning` (amber), `>95%` uses `--color-error` (red). The threshold class is applied to the fill element.
- The `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` provides screen reader semantics. The `aria-label` provides the human-readable usage string (e.g., "42 of 100 captures used").
- `transition: width 0.2s ease` provides a smooth fill animation on first paint. The `prefers-reduced-motion` media query already in `ui-css.js` will reduce this to 0.01ms.
- Storage bytes should be formatted as human-readable (e.g., "524 MB of 1 GB"). A simple `formatBytes(n)` helper is needed.

**Usage section layout within settings:**

```
+-----------------------------------------------+
| Usage                          March 2026      |
|                                                |
| Captures          42 of 100                    |
| [========------------------------------] 42%   |
|                                                |
| Storage           524 MB of 1 GB               |
| [============================---------] 51%    |
|                                                |
| Plan: Free                                     |
+-----------------------------------------------+
```

The section follows the existing settings card pattern: a `<section>` with `class="settings-section card"`, a heading `<h2>`, and content below. Each metric gets a label row (metric name + value text) and a progress bar row. Tier is shown as a simple text line at the bottom.


### Proposed Tasks

**Task 1: Add `GET /v1/account/usage` endpoint**
- **What:** Create a handler in `src/account.js` that reads from the session (`env._session.tenantId`), calls `getUsage(db, tenantId, computePeriod())`, looks up the tenant's tier and quota limits, and returns the response shape described above.
- **Deliverables:** Handler function, route tuple in `index.js`, tests.
- **Dependencies:** Tier + quota data model must be defined first (data-minion concern: where are tier defaults and per-tenant overrides stored?). The `getUsage` DAL function already exists.
- **Note:** This task is primarily API work. The frontend-minion should collaborate with the api-design-minion on the response shape, but the handler implementation follows the existing `account.js` patterns closely enough that it could be handled by either specialist.

**Task 2: Add usage section to settings view**
- **What:** In `src/ui/ui-settings.js`, modify `mountSettings()` to fire a parallel `apiFetch('/v1/account/usage')` alongside the existing keys fetch. In `buildSettingsContent()`, add a new "Usage" card section (inserted before the API Keys section) containing:
  - Period label (e.g., "March 2026")
  - Two progress bar rows: Captures and Storage
  - Each row: metric label, "N of M" text, progress bar with threshold coloring
  - Tier label at the bottom of the card
- **Deliverables:** Modified `ui-settings.js`, new CSS classes in `ui-css.js`.
- **Dependencies:** Task 1 (the endpoint must exist to fetch from). The response shape must be agreed upon before the frontend is built.

**Task 3: Add usage bar CSS to design system / ui-css.js**
- **What:** Add `.usage-bar`, `.usage-bar-fill`, `.usage-bar-fill--warning`, `.usage-bar-fill--critical` classes and the `formatBytes` helper function. Also add mobile responsive rules (on small screens, the label and value should stack vertically above the bar).
- **Deliverables:** CSS additions in `ui-css.js`. The progress bar itself is simple enough that it does not warrant a design-system.css addition -- it's application-level CSS.
- **Dependencies:** None (CSS-only). Can be done in parallel with Task 1.

**Task 4: Handle error and loading states**
- **What:** The usage section must handle:
  - **Loading:** Show "Loading usage..." placeholder text (same pattern as `settings-loading`).
  - **Error:** If the usage fetch fails, show an inline error alert within the usage card ("Could not load usage data") -- do not block the rest of settings from rendering.
  - **Zero usage:** If `captureCount` and `storageBytes` are both 0, still show the bars at 0% with "0 of N" text. Do not hide the section.
  - **No quota (unlimited):** If the API returns `null` for a limit (e.g., internal tenants with no cap), show usage without a progress bar -- just the count/size.
- **Deliverables:** Error handling code within the settings mount function.
- **Dependencies:** Task 2.

**Task 5: Accessibility verification**
- **What:** Verify the usage bars are announced correctly by screen readers:
  - `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
  - `aria-label` with human-readable text (e.g., "42 of 100 captures used this month")
  - The `aria-live` region already in settings (`#settings-live`) should announce when usage data loads: "Usage data loaded."
  - Keyboard users can tab to the usage section heading (already works via heading semantics)
- **Deliverables:** ARIA attributes on progress bar elements, live region announcement.
- **Dependencies:** Task 2.


### Risks and Concerns

1. **`_wrlUser.createdAt` is already broken.** The settings view references `_wrlUser.createdAt` (line 92 of `ui-settings.js`) but `/auth/session` does not include `createdAt` in its response (see `oauth.js` lines 508-517). This means "Member since" always shows "--". This is a pre-existing bug, not introduced by this feature, but it's worth noting since we're modifying the same view. Recommend fixing it as a drive-by if the session response shape is being touched.

2. **Quota limits not yet in the data model.** The current D1 schema has no `tier` column on the `tenants` table, and no quota configuration table. The R26 spec calls for "tier field on tenant record" and "per-tenant quota overrides stored in D1." The data-minion needs to define this schema before the API endpoint can return quota limits. The frontend cannot proceed with Task 2 until the response shape is finalized.

3. **Parallel fetch ordering in `mountSettings`.** The current `mountSettings` does a single fetch (keys). Adding a second parallel fetch (usage) means `buildSettingsContent` should wait for both to resolve. Options:
   - Use `Promise.all([keysFetch, usageFetch])` and build everything at once. This is cleanest but means the whole settings page waits for the slower of the two fetches.
   - Render the skeleton immediately and fill in each section as its fetch resolves. This is more code but better perceived performance.
   - **Recommendation:** Use `Promise.all` for simplicity. Both fetches hit the same D1 database via the same worker; they should complete within ~50ms of each other. The added complexity of progressive rendering isn't justified for two fast fetches.

4. **`formatBytes` edge cases.** Storage bytes from D1 could be very large numbers. The formatter should handle: 0, sub-KB values, exact boundary values (1024, 1048576, etc.), and values exceeding the quota (overages are allowed per spec). Use 1024-based units (KiB/MiB/GiB) or 1000-based (KB/MB/GB) -- recommend SI units (1000-based) for user-facing display since that's what cloud providers typically show.

5. **API-key auth users see no usage.** The settings view is session-only (`_authMethod === 'session'` check in the router). API-key users are redirected to `#/captures` and never see settings. This is correct per the current architecture -- API-key users don't have a tenant context in the same way. No action needed, but worth documenting.

6. **Period rollover display.** On the 1st of a new month, the usage counters reset but the tenant sees "0 of 100 captures" for the new period. This is correct behavior but may be confusing without context. Consider adding a small help text: "Resets on [first of next month]" -- though this is a UX-strategy decision.


### Additional Agents Needed

- **data-minion**: Required to define the D1 schema changes for tier assignment and quota overrides (new `tier` column on `tenants`, default quota lookup table or constants, per-tenant override table). The frontend cannot finalize its response shape expectations without this.
- **api-design-minion**: Required to finalize the `GET /v1/account/usage` response shape, including how tier defaults and per-tenant overrides are resolved and what the response looks like for unlimited quotas. The frontend plan above proposes a shape but the API designer should validate it against the broader API conventions.
- **test-minion**: Required for integration tests of the new endpoint and component tests verifying the usage section renders correctly with various data states (zero usage, near-limit, over-limit, error, unlimited quota).
