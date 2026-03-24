## Task: D1 Schema, Notification Preferences API, and Unsubscribe Endpoint

You are implementing the data layer and API surface for WRL's email notification system. This is a Cloudflare Workers project using D1 (SQLite). Follow the existing patterns in the codebase exactly.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell

### Part A: D1 Migration

Create the next migration file (check migrations/ for the current highest number and increment by 1) with two tables:

**notification_preferences** -- one row per tenant, created lazily on first PUT:
- tenant_id TEXT NOT NULL PRIMARY KEY REFERENCES tenants(id)
- email TEXT with CHECK (email IS NULL OR (length(email) >= 3 AND length(email) <= 320))
- email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1))
- email_source TEXT NOT NULL DEFAULT 'github' CHECK (email_source IN ('github', 'manual'))
- Individual boolean columns for each notification type (INTEGER NOT NULL DEFAULT 1, CHECK IN (0,1)):
  - notify_capture_failure, notify_approaching_limit, notify_limit_reached, notify_invoice_generated, notify_payment_failure, notify_weekly_digest
- created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
- updated_at TEXT

**notification_sent** -- deduplication for threshold and periodic notifications:
- tenant_id TEXT NOT NULL REFERENCES tenants(id)
- period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND length(period) = 7)
- event_type TEXT NOT NULL
- sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
- PRIMARY KEY (tenant_id, period, event_type)

Study the existing migration files in migrations/ for the exact style (PRAGMA foreign_keys, comment style, etc.).

### Part B: Data Access Functions in src/db.js

Add these functions to src/db.js, following the existing patterns (getCapture, createCapture, etc.):

- getNotificationPreferences(db, tenantId) -- returns the row or null
- upsertNotificationPreferences(db, tenantId, fields) -- UPSERT with partial update semantics (only provided fields are changed)
- unsubscribeNotificationType(db, tenantId, eventType) -- sets the notify_{eventType} column to 0. IMPORTANT: validate eventType against a known list of valid column names to prevent SQL injection via dynamic column names
- checkNotificationSent(db, tenantId, period, eventType) -- returns true if row exists
- markNotificationSent(db, tenantId, period, eventType) -- INSERT OR IGNORE
- deleteNotificationPreferences(db, tenantId) -- for right-to-erasure

Email validation at write time: reject CRLF characters (\r, \n), null bytes, and enforce max 254 chars. Use this regex for format validation:
```js
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
```

### Part C: Notification Preferences API Handlers

Create src/notifications.js with handlers following the src/account.js patterns exactly:

**GET /v1/account/notifications** (session-gated):
- Read from notification_preferences. If no row exists, return synthesized defaults (all true, email null, emailVerified false).
- Response shape: { email, emailVerified, emailSource, notifications: { capture_failure: true, ... }, updatedAt }

**PUT /v1/account/notifications** (session-gated, CSRF-gated):
- Partial update: both email and notifications fields are optional. The notifications object uses merge semantics (only mentioned keys are updated).
- Changing email resets emailVerified to false and sets emailSource to 'manual'.
- Setting email to null clears it.
- Validate: reject unknown top-level fields (same pattern as handleUpdateSettings). Validate notification keys against the known set. Validate boolean values.
- Response: full current state after update.

**Route registration in src/index.js**: Add routes under the existing session-gated /v1/account/ prefix:
```js
['GET',    /^\/v1\/account\/notifications$/, handleGetNotificationPreferences],
['PUT',    /^\/v1\/account\/notifications$/, handleUpdateNotificationPreferences],
```

### Part D: Unsubscribe Token Module and Endpoint

Create src/unsubscribe.js with HMAC-SHA256 token generation and verification:

**Token design:**
- Payload: JSON { t: tenantId, c: eventType, v: 1 } (no expiry -- CAN-SPAM requires 30+ day validity)
- HMAC input: unsub.{base64url(payload)} -- the unsub. prefix prevents cross-use with session cookies
- Token format: {base64url(payload)}.{base64url(hmac)}
- Use crypto.subtle for HMAC-SHA256, reusing the SESSION_SECRET key (study src/session.js for the importHmacKey pattern)
- Verification must be timing-safe (use crypto.subtle.verify)
- IMPORTANT: Validate eventType from decoded token against the known list of valid notification types before using it in SQL

**Unsubscribe endpoints:**

GET /v1/notifications/unsubscribe?token=... (unauthenticated):
- Renders a confirmation page with a form that POSTs (does NOT auto-unsubscribe -- email security scanners make GET requests)
- Returns 200 with HTML for both valid and invalid tokens (no information leakage)
- Display human-readable notification type name, not the raw eventType key
- Build the HTML page following the verify-page.js pattern (template literal, inline styles, design system values)

POST /v1/notifications/unsubscribe (unauthenticated):
- Request body: application/x-www-form-urlencoded with List-Unsubscribe=One-Click (RFC 8058)
- Also accept token from query parameter ?token=... (for form submission from GET page)
- Verify HMAC, then validate eventType, then update notification_preferences
- Returns 200 with HTML confirmation for both valid and invalid tokens
- Idempotent -- unsubscribing twice is a no-op

**Route registration**: Add OUTSIDE the session-gated prefix (unauthenticated):
```js
['GET',    /^\/v1\/notifications\/unsubscribe$/, handleGetUnsubscribe],
['POST',   /^\/v1\/notifications\/unsubscribe$/, handlePostUnsubscribe],
```

Rate-limit the unsubscribe endpoint using the existing AUTH_RATE_LIMITER binding (10 req/min per IP). Add it to the rate limit group check in getRateLimitGroup() in src/index.js.

**Log the unsubscribe event** using the established pattern:
```js
ctx.waitUntil(log(env, 3, 'email', { event: 'email.unsubscribe', tenantId, notificationType }) ?? Promise.resolve());
```
Never log the email address.

### Part E: Tests

Write tests in test/notifications.test.js covering:
- GET returns defaults when no preferences row exists
- PUT creates row on first update
- PUT partial update (email only, notifications only, both)
- PUT validates email format (rejects CRLF, rejects overlong, rejects missing @)
- PUT rejects unknown notification types
- PUT rejects unknown top-level fields
- Unsubscribe token round-trip (generate, verify)
- Unsubscribe token rejects tampered payload
- Unsubscribe token rejects tampered signature
- Unsubscribe token rejects session cookie values (purpose prefix check)
- Unsubscribe token with unknown eventType is handled gracefully (no SQL error)
- GET /unsubscribe returns HTML page (does not modify DB)
- POST /unsubscribe modifies DB for valid token
- POST /unsubscribe returns 200 for invalid token (no leakage)

Follow the test patterns in test/account-usage.test.js and test/webhook-crud.test.js (same miniflare setup, same assertion style).

### Part F: OpenAPI Spec

Add the new endpoints to openapi.yaml following the existing patterns:
- GET /v1/account/notifications
- PUT /v1/account/notifications
- GET /v1/notifications/unsubscribe
- POST /v1/notifications/unsubscribe

### Constraints
- Do NOT implement email sending, templates, or the dispatch pipeline (separate task)
- Do NOT implement email verification flow (sending verification emails)
- Do NOT add a notification_log or delivery status table (YAGNI)
- Do NOT store notification preferences as a JSON blob on the tenants table
- Do NOT add user:email OAuth scope changes (separate task)
- Use import { escapeHtml } from './verify-page.js' for HTML escaping in the unsubscribe page
- All code in plain JavaScript (no TypeScript), following existing style
- Every catch block must log or handle a specific error -- no silent catches
- Notifications are suppressed when no email is configured/verified -- this is by design

When you finish your task, report:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
- The approach you chose, alternatives you considered but rejected, and reasons
