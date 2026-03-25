# Phase 0080: Allow users to change their notification email address

**Issue**: #195
**Budget**: $40

## Task

Users can update the email address where WRL sends notifications (capture failures, usage alerts, invoices) through the existing settings UI, so they aren't locked to the email pulled from GitHub OAuth.

## Success criteria

- User can enter a new email address in the notifications settings UI
- Changing email resets verification status (emailVerified = false)
- New email receives a verification email before notifications are sent to it
- Email validation rejects malformed addresses
- Existing notification preferences (opt-in/out per type) are preserved when email changes

## Scope

- In: Settings UI email field, PUT /v1/account/notifications endpoint, email verification flow
- Out: Changing login/OAuth email, multiple notification addresses, email forwarding
