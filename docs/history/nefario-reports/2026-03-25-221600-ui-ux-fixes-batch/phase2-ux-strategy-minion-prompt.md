You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Item 3 of a UI/UX fixes batch: Add documentation link to the logged-in application UI (#210).
Add a visible link to docs.webresourceledger.com in the authenticated UI (header/nav/footer). Opens in new tab.

## Your Planning Question

The current authenticated nav has: Captures, Schedules, Billing, Notifications, Settings. All are internal SPA routes.

Adding "Docs" as a nav link opens a new tab (external navigation) which breaks the SPA pattern. Options:
1. Nav bar link with an external-link icon (visual cue that it opens a new tab)
2. Footer link
3. Help/info section in the Settings page
4. A separate "Help" or "?" icon in the nav bar

Consider:
- The API-key auth path has NO session nav (it only shows captures). Where does the docs link go for API-key users?
- Cognitive load: the nav already has 5 items
- User jobs-to-be-done: when do users need docs? During capture setup, troubleshooting, billing questions

Also consider item 1 (contrast fix): The Sign In button uses `.btn--github` with `background: var(--color-primary)` (#2a3444) and `color: var(--color-primary-text)` (#f8f8fa). The computed ratio is ~10.5:1 which passes WCAG AA. The issue report says contrast is low. Could the issue be about a different element? The "Connect" button uses `.btn--ghost` (transparent bg, `color: var(--color-primary)` on white). What's your UX perspective on the login page contrast?

## Context Files to Read
- `src/ui/ui-auth.js` (nav construction, boot flow, API-key vs session paths)
- `src/ui/ui-login.js` (login page elements)
- `src/ui/ui-css.js` (nav styles, auth styles)
- `src/design-system.js` (color tokens)

## Instructions
1. Read the relevant files
2. Apply your UX strategy expertise
3. Return your contribution with recommendations, proposed tasks, risks

Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase2-ux-strategy-minion.md
