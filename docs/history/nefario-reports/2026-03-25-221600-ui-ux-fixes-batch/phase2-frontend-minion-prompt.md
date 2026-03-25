You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

UI/UX fixes batch (GitHub #213): 4 small fixes bundled into one phase.

### 1. Fix low-contrast Sign In button (#211)
The Sign In button text doesn't meet WCAG AA contrast ratio (4.5:1). Fix the text or background color.

### 2. Billing section shows duplicate/conflicting status (#190)
Billing section shows both "Status: Pending" and "Status: Active" simultaneously. Only one status should display. Likely in `src/ui/ui-billing.js`.

### 3. Add documentation link to the logged-in application UI (#210)
Add a visible link to docs.webresourceledger.com in the authenticated UI (header/nav/footer). Opens in new tab.

### 4. Notify operator when new tenant API keys are created (#200)
When a new API key is created via the admin API, fire a notification (email via Resend or Coralogix log alert) with tenant ID, key name, scopes, and timestamp. Fire-and-forget — must not block key creation.

## Your Planning Questions

1. **Contrast investigation**: The `.btn--github` Sign In button uses `background: var(--color-primary)` (#2a3444) with `color: var(--color-primary-text)` (#f8f8fa). That ratio is ~10.5:1 which passes WCAG AA. Investigate whether the real issue is a different element on the login page (e.g., the ghost-style "Connect" button, the tagline text, the divider text, etc.). What is the correct fix approach -- adjust a design token, override a specific class, or add a new variant?

2. **Billing status dedup**: In `src/ui/ui-billing.js`, `buildRefreshRow()` line 766 renders `'Status: ' + billingStatusLabel(usageData.billingStatus)` as persistent text. Meanwhile `buildPaymentSection()` renders status-specific UI (badge for active, prompts for free/grace_period/blocked). When status is 'active' with payment method, user sees both "Status: Active" AND "Payment method active" badge. Should we remove the status text from the refresh row, or keep some indicator for a11y?

3. **Docs link placement**: The authenticated nav (built in `src/ui/ui-auth.js`) has: Captures, Schedules, Billing, Notifications, Settings. Where should the docs link go? It opens externally (new tab) which breaks SPA pattern. Consider: nav bar link with external icon, footer link, or help section in settings.

## Context Files to Read
- `src/ui/ui-css.js` (btn--github styles, lines 448-464; auth-card styles)
- `src/design-system.js` (color tokens)
- `src/ui/ui-login.js` (login screen DOM)
- `src/ui/ui-billing.js` (buildRefreshRow, buildPaymentSection)
- `src/ui/ui-auth.js` (nav construction in authenticated shell)

## Instructions
1. Read the relevant files listed above
2. Apply your domain expertise to each planning question
3. Identify risks, dependencies, and requirements
4. Return your contribution in this format:

## Domain Plan Contribution: frontend-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase2-frontend-minion.md
