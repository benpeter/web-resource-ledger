## UI/UX fixes batch

Small fixes that individually don't warrant a full phase session.

### 1. Fix low-contrast Sign In button (#211)
The Sign In button text doesn't meet WCAG AA contrast ratio (4.5:1). Fix the text or background color.

### 2. Billing section shows duplicate/conflicting status (#190)
Billing section shows both "Status: Pending" and "Status: Active" simultaneously. Only one status should display. Likely in `src/ui/ui-billing.js`.

### 3. Add documentation link to the logged-in application UI (#210)
Add a visible link to docs.webresourceledger.com in the authenticated UI (header/nav/footer). Opens in new tab.

### 4. Notify operator when new tenant API keys are created (#200)
When a new API key is created via the admin API, fire a notification (email via Resend or Coralogix log alert) with tenant ID, key name, scopes, and timestamp. Fire-and-forget — must not block key creation.

## Constraints
- Match existing design system
- All existing tests must pass
