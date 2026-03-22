# Domain Plan Contribution: software-docs-minion

## Recommendations

### Documentation Strategy: Option (d) -- combination, weighted toward inline help and a light README section

After reviewing the full documentation structure, my recommendation is **(d) a combination**, but with a specific weighting that matches the project's established patterns and philosophy:

1. **Inline help within the UI itself** (primary) -- The UI should be self-documenting. Labels, placeholders, empty states, error messages, and status indicators should make the UI understandable without referencing external documentation. The verification page (`verify-page.js`) already follows this pattern: it is a self-contained HTML page that explains what it shows as it shows it. The new views should do the same. This is the most important layer because it reaches 100% of users at the moment they need it.

2. **A short section in the README** (secondary) -- The README currently documents three interfaces to WRL: the REST API (the "Usage" section), the CLI verify tool (the "Offline verification" subsection), and the MCP server (a one-paragraph description with a link to `docs/mcp.md`). The Web UI should follow the MCP pattern exactly: a brief paragraph in the README that says what it is, where to find it, and links to a dedicated doc if needed. Do NOT expand the README's "Usage" section to include UI instructions -- the README's audience is developers integrating via API, not browser users.

3. **A `docs/web-ui.md` file** (tertiary, only if needed post-MVP) -- For the initial build, the UI is simple enough (four views) that inline help and a README mention suffice. If the UI grows to need configuration documentation, keyboard shortcuts, or workflow guides, a dedicated `docs/web-ui.md` following the `docs/mcp.md` pattern would be appropriate. Do not create this preemptively.

### What NOT to do

- Do not write a separate "user guide." The UI is a thin interface over the existing API. If the UI needs a guide to be usable, the UI design is wrong.
- Do not duplicate API documentation inside the UI. The UI consumes the API; it does not need to re-explain API semantics.
- Do not add a "help" page or modal that restates the README. Contextual inline guidance (empty state messages, input placeholders, status explanations) is more effective and stays fresh.

### OpenAPI Spec: No changes needed for API endpoints, but document the UI routes

The UI consumes the existing API endpoints (`POST /v1/captures`, `GET /v1/captures`, `GET /v1/captures/{id}`, `GET /v1/verify/{id}`). If no new API endpoints are introduced and no request/response schemas change, the OpenAPI spec's `paths` and `components` sections need zero modifications. The spec remains the API's source of truth.

However, there is a decision to make about the UI routes themselves:

- The verification endpoint (`/v1/verify/{captureId}`) already has content negotiation documented in `openapi.yaml` (browsers get HTML, API clients get JSON). This is a precedent.
- The new UI pages will have routes (e.g., `/`, `/captures`, `/captures/{id}`). These are HTML-only, not API endpoints. They should **not** be added to `openapi.yaml`. The OpenAPI spec documents the programmatic API, not browser-navigable pages. Mixing the two creates confusion for SDK generators and API consumers.
- If the UI introduces any new API-facing behavior (e.g., a session cookie auth flow, a different query parameter for filtering), those changes **must** be reflected in the OpenAPI spec.

### CORS Configuration

The README already documents `CORS_ORIGINS` (step 8). The UI being served from the same Worker origin means CORS is not needed for UI-to-API calls (same-origin). The existing CORS documentation remains correct and needs no changes. Mention in the README section that the built-in UI does not require CORS configuration since it is served from the same origin.

### Auth Gate Documentation

The auth gate view (API key entry) introduces a UX pattern that should be self-explanatory within the UI. The auth flow should explain inline:
- What the API key is (one sentence)
- Where to get one (link to the README's "Usage" section or admin instructions)
- That the key is stored only in the browser session (if using sessionStorage/localStorage -- state the storage mechanism and its lifetime for transparency)

This is inline documentation, not a separate document.

## Proposed Tasks

### Task 1: Add Web UI section to README

**What to do:** Add a "Web UI" section to `README.md`, positioned after the "MCP Server" section and before "Development". Follow the exact pattern of the MCP section: one paragraph explaining what it is, one sentence on how to access it, and a link to detailed docs if a `docs/web-ui.md` is created later.

**Deliverable:** Updated `README.md` with a 3-5 line "Web UI" section.

**Dependencies:** Must be done after the UI is functional (needs the actual URL/path). Can be drafted in parallel with UI implementation and finalized at PR time.

**Example content:**
```markdown
## Web UI

WRL includes a browser-based interface for submitting captures and browsing results. Navigate to your WRL deployment URL in any browser to access it. Authentication requires a WRL API key with `capture` and `read` scopes.

The UI is served directly from the Worker -- no separate hosting or CORS configuration required.
```

### Task 2: Write inline help copy for all four UI views

**What to do:** Write the user-facing text that appears within each view. This is the primary documentation layer. Specific items:

- **Auth gate:** Explanation of what an API key is, where to get one (link), storage disclaimer
- **Capture submission form:** Input label, placeholder text (e.g., "https://example.com"), submit button label, status feedback messages (submitting, pending, complete, failed), error messages for invalid URLs
- **Capture list:** Empty state message (no captures yet), column/card labels, status badge text, pagination guidance
- **Capture detail:** Section labels (screenshot, HTML, headers, WACZ), verification status explanation, artifact download labels, verification link sharing guidance

**Deliverable:** A copy document or constants file (`src/ui-copy.js` or similar) containing all user-facing strings. Centralizing strings makes them reviewable as a batch and enables future i18n.

**Dependencies:** Depends on the UI view structure being defined (wireframes/component breakdown). Can proceed in parallel with CSS/layout work.

### Task 3: Update roadmap entry in backlog

**What to do:** When the UI ships, mark `#47 R17: Web UI for capture submission` as DONE in `docs/backlog.md` with a brief description of what shipped. Also check the parking lot entry `[consider] OAuth for web UI` -- if the auth gate uses API keys rather than OAuth, note that the current approach is API-key-based and OAuth remains deferred.

**Deliverable:** Updated `docs/backlog.md`.

**Dependencies:** Done at PR completion, after the UI is merged.

### Task 4: Confirm OpenAPI spec requires no changes

**What to do:** Verify during implementation that the UI consumes existing API endpoints without modification. Specifically check:
- No new query parameters added to existing endpoints
- No new response formats or headers
- No new endpoints created for UI-specific data
- CORS behavior unchanged (same-origin, no new preflight paths)

If any API changes are introduced to support the UI, update `openapi.yaml` accordingly.

**Deliverable:** Explicit confirmation (in the evolution log `decisions.md`) that the OpenAPI spec is unchanged, OR the updated spec if changes were needed.

**Dependencies:** Must be done during implementation review, before PR merge.

### Task 5: Write evolution log entry for this phase

**What to do:** Per project rules, create the evolution log directory and files for this phase. The documentation decisions (inline-first strategy, no separate user guide, OpenAPI unchanged) should be captured in `decisions.md`.

**Deliverable:** `docs/evolution/NNNN-web-ui/prompt.md`, `decisions.md`, `outcome.md`.

**Dependencies:** `prompt.md` created at phase start. `decisions.md` updated during. `outcome.md` written at completion.

## Risks and Concerns

### Risk 1: UI copy written as afterthought

If the inline help text is written hastily during implementation rather than reviewed as documentation, it will be inconsistent, unclear, or missing. The copy document (Task 2) should be reviewed by the same standard as README changes.

**Mitigation:** Treat the copy document as a PR deliverable. Review it explicitly, not just the code that renders it.

### Risk 2: Auth gate UX creates support burden without clear guidance

Users arriving at the auth gate with no API key will hit a dead end unless the UI explains how to obtain one. The README's setup instructions are written for operators, not end users.

**Mitigation:** The auth gate must include a direct link to the README section that explains key provisioning, plus a one-sentence explanation. If the deployment is single-tenant with a known operator, the text should say "Contact your WRL operator for an API key."

### Risk 3: OpenAPI spec drift if UI-specific endpoints sneak in

If the implementation adds convenience endpoints for the UI (e.g., `/api/me` for key validation, or a combined captures+status endpoint), those must be reflected in `openapi.yaml`. Ad-hoc endpoints that bypass the spec create an undocumented API surface.

**Mitigation:** Task 4 explicitly gates this. The evolution log should record whether new endpoints were added and whether they were documented.

### Risk 4: Style guide not referenced during UI implementation

The existing `docs/style-guide.md` and `src/design-system.css` define the complete visual language. If the UI implementer does not reference these, the UI will look inconsistent with the verification page.

**Mitigation:** Not strictly a documentation risk, but the plan should explicitly point implementers to `docs/style-guide.md` and require use of `src/design-system.css` tokens. This is already established practice (verify-page.js imports `DESIGN_SYSTEM_CSS`).

### Risk 5: Capture ID exposure in browser history/URL bar

The README documents that capture IDs are access secrets ("treat it as a secret"). If the UI puts capture IDs in the URL bar (e.g., `/captures/cap_abc123`), they appear in browser history, could be shared inadvertently, and are visible to shoulder surfers. This is an existing design trade-off (the verification page already does this), but the UI makes it more visible.

**Mitigation:** This is a design/security concern more than a documentation concern, but the inline UI copy should remind users that capture URLs grant full access to artifacts. The auth gate protects the list view; individual capture URLs are intentionally public per the existing access model.

## Additional Agents Needed

**None for documentation specifically.** The current team should be sufficient. However, I want to flag two considerations:

1. **The ux-design-minion** (if not already involved) should review the inline copy from Task 2. UI text is UX copy, which is outside my domain. I can draft the content from a documentation perspective (accuracy, completeness, consistency with existing docs), but voice, tone, and interaction design are UX concerns. If the team already has a frontend or UX specialist reviewing the views, that covers it.

2. **The security-minion** should weigh in on the auth gate's inline disclosure about API key storage (where the key is stored client-side, for how long, and what happens on browser close). This is both a security decision and a documentation requirement -- the disclosure text must accurately describe the actual storage mechanism.
