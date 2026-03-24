## Task: Notification Preferences UI Tab

Add a "Notifications" tab to the WRL web dashboard for managing email notification preferences. Study the existing UI architecture before starting.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell

### Existing UI Architecture

The WRL dashboard is a single-page app built with vanilla JS -- NO frameworks. Study these files:
- src/ui/ui-shell.js -- the main shell that renders tabs
- src/ui/ui-billing.js -- the Billing tab (most recent tab addition, best pattern to follow)
- src/ui/ui-settings.js -- the Settings tab (shows toggle patterns)
- src/design-system.css -- CSS custom properties for styling
- src/design-system.js -- JS-side design system

### Implementation

Create src/ui/ui-notifications.js following the exact patterns from the existing tabs:

**Tab content:**
1. **Email address section**: Shows current email (from GET /v1/account/notifications response). If no email: show input field with "Add your email to receive notifications" prompt. If email exists but not verified: show it with a "Not verified" badge. If verified: show with a "Verified" badge.
2. **Notification toggles**: Group into two sections with subheadings:
   - **Alerts** subheading:
     - Capture failures: "Get notified when a web capture fails"
     - Approaching limit: "Warning when nearing your free capture limit"
     - Limit reached: "Alert when your free capture limit is reached"
     - Payment failure: "Alert when a payment attempt fails"
   - **Summaries** subheading:
     - Invoice generated: "Notification when a new invoice is created"
     - Weekly digest: "Weekly summary of your scheduled captures"
3. **Email change**: An "Edit" button next to the email that reveals an input. On save, calls PUT with the new email. Shows feedback: "Email updated. Verification required before notifications are sent." (honest copy -- no false claim about verification email being sent).

**API calls**: Use fetch() to /v1/account/notifications with credentials: 'include' and the X-WRL-CSRF header (study how ui-settings.js does CSRF-protected mutations).

**Register the tab** in src/ui/ui-shell.js following the pattern used for Billing and Settings tabs.

### Tests

Add test/ui-notifications.test.js following the pattern in test/ui-billing.test.js or test/ui-settings-usage.test.js:
- Tab renders with default preferences (all toggles on)
- Tab shows "add email" prompt when email is null
- Tab shows "not verified" badge when emailVerified is false
- Toggle calls PUT with correct payload

### Constraints
- Vanilla JS only -- NO React, NO framework, NO build step
- Use CSS custom properties from design-system.css (NOT the email token values)
- Follow the exact tab registration pattern from ui-shell.js
- The UI file should export a function matching the pattern of the other tab modules
- Do NOT implement email verification UI flow beyond showing the badge
- Use the settingsAnnounce() pattern (or equivalent) for feedback messages and error/loading states

When you finish your task, report:
- File paths with change scope and line counts
- 1-2 sentence summary
- Approach chosen and alternatives rejected
