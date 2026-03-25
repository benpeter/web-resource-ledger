## Delegation Plan

**Team name**: ui-ux-fixes-batch
**Description**: Four small UI/UX fixes: login contrast, billing status dedup, docs nav link, operator key-creation notification.

### Task 1: Fix low-contrast muted text and remove duplicate billing status
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are fixing three UI issues in the WRL dashboard. All changes are in the worktree at `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/curious-singing-ullman`.

    ## Fix A: Low-contrast muted text (#211)

    The issue reports low contrast on the Sign In page. Investigation shows the "Sign in with GitHub" button itself (`.btn--github`) has 10.5:1 contrast -- it is fine. The real problem is `--color-text-muted` (#6e6a66), which is used for `.auth-tagline`, `.login-divider-text`, `.login-apikey-label`, and many other labels throughout the app. On `--color-bg` (#f7f6f5) it achieves only ~3.4:1, failing WCAG AA 4.5:1 for normal text.

    **What to do:**
    1. In `src/design-system.css` (line 7), change `--color-text-muted` from `#6e6a66` to `#595550`. Verify this gives >= 4.6:1 against both `--color-bg` (#f7f6f5) and `--color-surface` (#ffffff).
    2. Apply the same change in `src/design-system.js` (line 11) -- this is the JS export of the same CSS. Both files must stay in sync.
    3. Do NOT change `--color-border` or add `--color-border-interactive` -- the ghost button border concern is deferred to avoid scope creep.
    4. Do NOT change `.btn--github` styles -- they already pass.

    **Files to modify:** `src/design-system.css`, `src/design-system.js`

    ## Fix B: Duplicate billing status display (#190)

    The billing view shows status in two places: `buildRefreshRow()` always renders "Status: Active/Free/etc." text (line 766 of `src/ui/ui-billing.js`), AND `buildPaymentSection()`/`buildStatusBanner()` renders status-specific UI (badges, banners). This creates redundancy, especially for `active` status where users see both "Status: Active" and a green "Payment method active" badge.

    **What to do:**
    1. In `src/ui/ui-billing.js`, in the `buildRefreshRow()` function (~line 758-770), remove the `leftEl` span that renders `"Status: " + billingStatusLabel(usageData.billingStatus)`. The refresh row should contain only the refresh button.
    2. Do NOT remove the `billingAnnounce()` call in `refreshBillingData()` -- screen reader users still need the aria-live status announcements.
    3. Do NOT add "Last updated" timestamp -- keep it simple.

    **Files to modify:** `src/ui/ui-billing.js`

    ## Fix C: Add docs link to authenticated nav (#210)

    Add a documentation link to the nav bar for all authenticated users (both session and API-key auth).

    **What to do:**
    1. In `src/ui/ui-auth.js`, in the `renderAppShell()` function, add a docs link in the `navActions` div (right side of nav bar, BEFORE the username/sign-out controls). Do NOT add it to the `navLinks` group (left side) -- docs is a utility action, not a primary workflow destination.
    2. The link should:
       - Use text "Docs" (not "Documentation")
       - Point to `https://docs.webresourceledger.com`
       - Use `target="_blank"` and `rel="noopener noreferrer"`
       - Include a small inline SVG external-link icon (12x12, `aria-hidden="true"`, `fill="currentColor"`) after the text
       - Include screen reader text "(opens in new tab)" via a visually-hidden span
       - Use class `nav-link` for consistent styling
    3. Add this link for BOTH auth paths (session and apikey). Both code paths build `navActions` -- add the docs link in both.
    4. In `src/ui/ui-css.js`, add minimal CSS for `.nav-link--external` icon spacing (small gap between text and icon, vertical alignment). Add `.sr-only` utility class if not already present (for the screen reader text).

    **Files to modify:** `src/ui/ui-auth.js`, `src/ui/ui-css.js`

    ## What NOT to do
    - Do not touch `src/admin.js` or any backend files -- issue #200 (notification) is handled separately via Coralogix alert configuration, not code.
    - Do not add new dependencies or frameworks.
    - Do not restructure the nav or add a footer.
    - Do not change the ghost button border (`--color-border`).
    - Do not add `aria-label` to the docs link -- use visible screen reader text instead (`.sr-only` span with "(opens in new tab)").

    ## Verification
    - Run `npm test` and confirm all existing tests pass.
    - The contrast ratio of the new `--color-text-muted` value must be >= 4.5:1 against both #f7f6f5 and #ffffff.
- **Deliverables**: Modified `src/design-system.css`, `src/design-system.js`, `src/ui/ui-billing.js`, `src/ui/ui-auth.js`, `src/ui/ui-css.js`
- **Success criteria**: (1) `--color-text-muted` passes WCAG AA 4.5:1 against both background colors. (2) `buildRefreshRow()` no longer renders billing status text. (3) "Docs" link appears in nav-actions for both auth paths with external-link icon and screen reader text. (4) All existing tests pass.

### Task 2: Configure Coralogix alert for admin key creation (#200)
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Configure a Coralogix alert to notify the operator when new tenant API keys are created. This is a zero-code-change task -- the existing `admin.key_create` log event in `src/admin.js` already emits all required fields (tenantId, scopes, name, keyHashPrefix) to Coralogix via the structured logging pipeline.

    **What to do:**

    Document the Coralogix alert configuration that needs to be created manually in the Coralogix dashboard. Write the configuration to a new section in the ops runbook.

    The alert rule specification:
    - **Name**: `WRL: New API Key Created`
    - **Type**: Standard alert (log-based)
    - **Query**: `event:"admin.key_create" AND responseStatus:201`
    - **Application filter**: `wrl` (production only; exclude `wrl-staging` unless operator opts in)
    - **Subsystem filter**: `admin`
    - **Condition**: More than 0 occurrences in 1 minute (immediate)
    - **Notification group fields**: `tenantId`, `name`, `scopes`, `keyHashPrefix`
    - **Destination**: Email to operator (or Slack webhook)

    **Files to modify:** `docs/ops-runbook.md` (add alert configuration section)

    **What NOT to do:**
    - Do not modify any source code (no changes to `src/admin.js`, `src/email-dispatch.js`, etc.)
    - Do not add environment variables or wrangler.toml changes
    - Do not build an email pipeline for this -- the existing log event + Coralogix alert is sufficient
    - Do not create new queue bindings or notification types

    **Verification:** The documentation accurately describes the alert configuration. No code changes.
- **Deliverables**: Updated `docs/ops-runbook.md` with Coralogix alert configuration for key creation notifications
- **Success criteria**: Ops runbook contains the alert rule specification with query, filters, condition, and destination details.

### Cross-Cutting Coverage
- **Testing**: Covered by Phase 6 (post-execution test run). test-minion recommended 5 structural test cases across 3 files -- these will be written during Phase 6 if needed, or the executing agent can include them. The test strategy is: string assertions for contrast token, billing dedup guard, docs link presence. No behavioral notification test (waitUntil timing issues). No new test infrastructure.
- **Security**: No new attack surface. The docs link uses `rel="noopener noreferrer"`. No auth changes. No new secrets or endpoints. Security review not needed for this batch.
- **Usability -- Strategy**: ux-strategy-minion contributed directly to planning. Key decisions incorporated: docs link in nav-actions (not nav-links), "Docs" text (not "Documentation"), both auth paths. Ghost button border deferred.
- **Usability -- Design**: No new UI components or interaction patterns being created. The docs link follows existing nav-link styling. The contrast fix is a token value change. ux-design-minion not needed.
- **Documentation**: Ops runbook update is included in Task 2. No architecture changes. User-facing docs not needed (the docs link itself IS the documentation affordance). software-docs-minion not needed beyond Phase 8 assessment.
- **Observability**: No new runtime components. The Coralogix alert leverages existing logging. observability-minion not needed.

### Architecture Review Agents
- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - accessibility-minion: The contrast fix and docs link both have WCAG implications. Review focus: verify the new `--color-text-muted` value meets AA, confirm screen reader text pattern for the external docs link.
- **Not selected**:
  - ux-design-minion: No new UI components; changes follow existing patterns.
  - sitespeed-minion: No runtime or loading changes.
  - observability-minion: No new services or metrics.
  - user-docs-minion: No user-facing documentation changes beyond the link itself.

### Decisions

- **Docs link placement: nav-actions (right) vs. nav-links (left)**
  Chosen: nav-actions area, before username/sign-out
  Over: Adding as 6th item in nav-links (frontend-minion's initial suggestion)
  Why: ux-strategy-minion correctly identified that docs is a utility/support action, not a primary workflow. Adding to nav-links inflates the primary nav to 6 items for session users, increasing cognitive load. nav-actions placement matches the mental model of help/utility controls near account actions.

- **Notification approach: Coralogix alert vs. email pipeline**
  Chosen: Coralogix alert rule on existing `admin.key_create` log event (zero code changes)
  Over: Adding dispatchNotification() call with new email template via Resend
  Why: The log event already contains all needed fields and flows to Coralogix. Building an email pipeline for operator notifications would require ~40 lines of new code, a new template, and would misuse the tenant-facing email infrastructure. YAGNI -- the alert rule covers the requirement with zero code. If email is needed later, the path is documented in iac-minion's contribution.

- **Ghost button border contrast: fix now vs. defer**
  Chosen: Defer to a separate issue
  Over: Adding `--color-border-interactive` token now
  Why: The `--color-border` token is used globally (cards, tables, inputs, dividers). Darkening it changes the visual weight of the entire UI. A targeted token adds surface area. The text contrast fix (`--color-text-muted`) is the clear-cut WCAG violation; the border is a perceived-prominence concern. Deferring avoids scope creep in a "small fixes" batch.

- **Admin notification test: structural vs. behavioral**
  Chosen: Structural test only (verify admin.js imports dispatchNotification) -- but actually, since iac-minion's approach requires zero code changes, no notification code test is needed at all
  Over: Integration test asserting notification delivery after POST /v1/admin/keys
  Why: test-minion's recommendation assumed code changes to admin.js. Since the chosen approach is a Coralogix alert with no code changes, there is nothing new to test in the codebase. The existing admin.key_create log event is already covered by admin-keys.test.js (the 201 response that triggers the log).

### Risks and Mitigations

1. **Global `--color-text-muted` change affects entire UI.** The token is used for labels, badges, section headers, and various secondary text throughout the app. Mitigation: the change makes text MORE readable (strictly better for accessibility). Visual review across all views during PR review. The change is easily reversible (single token).

2. **Nav crowding on mobile.** Adding a docs link to nav-actions increases the right-side content. On very small viewports (< 420px), the nav already stacks. Mitigation: "Docs" is a short label. If it causes layout issues, the implementing agent should test at 320px viewport width. Worst case, the link wraps naturally with the existing responsive behavior.

3. **Coralogix alert may have ingestion delay.** Typical delay is <30 seconds. Mitigation: acceptable for operator awareness (not security-critical real-time alerting). Document the expected delay in the ops runbook.

4. **design-system.css and design-system.js must stay in sync.** The project has two copies of the design tokens. Mitigation: the task prompt explicitly calls out both files. Phase 5 code review will catch desync.

### Execution Order

```
Batch 1 (parallel):
  Task 1: frontend-minion (contrast + billing dedup + docs link)
  Task 2: iac-minion (Coralogix alert docs)

No gates. No sequential dependencies.
```

### Verification Steps

1. All existing tests pass (`npm test`)
2. Visual verification: login page muted text is legible, billing refresh row shows only refresh button, docs link appears in nav bar for both auth modes
3. Docs link opens `https://docs.webresourceledger.com` in new tab
4. Screen reader announces "Docs (opens in new tab)" for the docs link
5. Ops runbook contains Coralogix alert configuration for `admin.key_create`
