# Margo Review: Email Notifications Implementation

## VERDICT: BLOCK

Two blocking bugs make the feature non-functional out of the box. The UI cannot read or write notification preferences due to key naming mismatches between frontend and API. A billing-to-template data mismatch produces broken invoice emails. Beyond the blockers, several ADVISE items address accidental complexity.

---

## Findings

### BLOCK

1. **[BLOCK] `src/ui/ui-notifications.js`:158,162-170,459-469 -- UI and API use incompatible key names; toggles are completely broken.**

   Three separate mismatches guarantee the notification preferences UI does not work:

   (a) **Property name mismatch on GET**: The UI reads `data.preferences` (line 158) but the API returns the toggle map under `data.notifications` (`src/notifications.js`:87). `data.preferences` is always `undefined`, so the UI falls back to `defaultPreferences()` and never shows actual server-side preferences.

   (b) **Key format mismatch**: The UI uses camelCase keys (`captureFailures`, `approachingLimit`, `weeklyDigest`) while the API returns and validates snake_case keys (`capture_failure`, `approaching_limit`, `weekly_digest`). Even if (a) were fixed, the UI would not map values correctly.

   (c) **Missing `notifications` wrapper on PUT**: The UI sends `{ captureFailures: true }` at the top level (lines 459-469). The API rejects unknown top-level fields (line 144) and expects `{ notifications: { capture_failure: true } }`. Every toggle change returns 400.

   FIX: Fix all three in `ui-notifications.js`:
   - Line 158: change `data.preferences` to `data.notifications`
   - Lines 27-35, 43-51, 59-66, 162-170: use snake_case keys matching `NOTIFICATION_TYPES` (`capture_failure`, `approaching_limit`, `limit_reached`, `payment_failure`, `invoice_generated`, `weekly_digest`)
   - Lines 459-469: wrap the payload in a `notifications` sub-object: `body: JSON.stringify({ notifications: payload })`

2. **[BLOCK] `src/billing.js`:364-368 -- invoice_generated dispatch passes wrong data keys; email renders blank amount and broken link.**

   The billing webhook handler passes `{ amountDue, currency, invoiceUrl }` but the `invoiceGeneratedEmail` template destructures `{ amountFormatted, currency, period, portalUrl, unsubscribeUrl }`. Three fields are mismatched:
   - `amountDue` (number in cents) is passed but `amountFormatted` (human-readable string) is expected -- email shows blank amount
   - `invoiceUrl` is passed but `portalUrl` is expected -- CTA button links to empty string
   - `period` is not passed at all -- "for **undefined**" in the email body

   FIX: In `billing.js`, format the data to match the template interface:
   ```js
   ctx.waitUntil(dispatchNotification(env, tenant.id, 'invoice_generated', {
     amountFormatted: new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency }).format(amountDue / 100),
     currency: currency.toUpperCase(),
     period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
     portalUrl: invoice?.hosted_invoice_url ?? null,
   }));
   ```

### ADVISE

3. **[ADVISE] `src/billing.js`:403-407 -- payment_failure dispatch omits portalUrl; CTA button links to empty string.**

   The `paymentFailureEmail` template expects `{ gracePeriodEnd, portalUrl, unsubscribeUrl }` but the dispatch only passes `gracePeriodEnd`. The "Update Payment Method" CTA button will have an empty `href`.

   FIX: Generate a billing portal URL at dispatch time. If the portal URL is not available synchronously, use the base URL + billing path:
   ```js
   const baseUrl = env.VERIFICATION_BASE_URL?.replace(/\/$/, '') || 'https://api.webresourceledger.com';
   ctx.waitUntil(dispatchNotification(env, tenant.id, 'payment_failure', {
     gracePeriodEnd: ...,
     portalUrl: `${baseUrl}/v1/billing/portal`,
   }));
   ```

4. **[ADVISE] `src/email/email-tokens.js` -- separate file for 15 string constants consumed by exactly one module.**

   `email-tokens.js` exports a single `tokens` object used only by `email-layout.js` and the six template files. All consumers import `tokens` from the same relative path. A separate file for static hex values adds a file, an import path, and navigational overhead without reuse benefit. This was flagged in the plan review and persists in the implementation.

   FIX: Inline the `tokens` object as a `const` at the top of `email-layout.js` and re-export it for templates, or just inline the values directly in each template. One fewer file in `src/email/`.

5. **[ADVISE] Six template files with identical structure (`src/email/templates/*.js`) -- premature file separation.**

   All six templates follow the exact same pattern: import `escapeHtml`, `emailLayout`, `tokens`; destructure data; build a banner table + body table + CTA table; call `emailLayout()`; build plain text; return `{ html, text, subject }`. The variation is in data fields, accent color, and copy. A single `src/email/templates.js` exporting six named functions would eliminate six files, six sets of identical imports, and make the shared pattern visible. Extract to separate files if/when templates diverge enough to warrant it.

   FIX: Consolidate into a single `src/email/templates.js` module. This is a structural simplification, not a functional one -- no urgency, but reduces file count from 8 (tokens + layout + 6 templates) to 2 (layout + templates).

6. **[ADVISE] All `dispatchNotification()` call sites have redundant `.catch()` handlers -- `dispatchNotification` already never throws.**

   `dispatchNotification` (email-dispatch.js:149) has a documented contract: "NEVER THROWS. All errors are caught and logged." It wraps its entire body in a try/catch safety net (lines 150-301). Despite this, every call site in `index.js` (lines 265, 289, 341, 831) and `billing.js` (lines 368, 407) adds `.catch(err => log(...))`. These catches are dead code -- they will never execute because the promise from `dispatchNotification` always resolves (never rejects).

   FIX: Remove the `.catch(...)` from all `dispatchNotification` call sites. If the never-throws contract is not trusted, add one integration test proving it rather than defensive catches at every call site.

7. **[ADVISE] `src/unsubscribe.js`:238-284 and 312-355 -- duplicated page shell (~46 lines of identical HTML/CSS) between renderConfirmPage and renderDonePage.**

   Both functions produce a full HTML document with identical `<head>`, `<style>`, `<body>` wrapper, and `<header>`. Only the `<main>` content differs. This is the same pattern `emailLayout` solves for email templates.

   FIX: Extract a `unsubscribePage(title, bodyContent)` helper that wraps body content in the shared shell. Both render functions call it with their specific content.

### NIT

8. **[NIT] `src/notifications.js`:190 -- log event name `oauth.notification_prefs_update` is in the `oauth` category but this is a notification preferences action, not an OAuth action.**

   FIX: Change to `log(env, 3, 'email', { event: 'email.prefs_update', ... })` to match the notification subsystem's log category.

9. **[NIT] `src/index.js`:324 -- silent `catch {}` block on `failCapture` violates the project's "silent catch {} blocks are forbidden" rule.**

   ```js
   } catch {
     // Best-effort
   }
   ```

   FIX: `} catch (err) { log(env, 4, 'capture', { event: 'capture.fail_error', captureId, error: err?.message }); }`

   (This is a pre-existing issue, not introduced by this PR, but the email notification dispatch code that follows it inherits the context.)

---

## What the implementation gets right

- **No new dependencies**: direct `fetch()` to Resend API, no SDK. Correct call.
- **Queue architecture mirrors webhooks exactly**: same producer/consumer/DLQ pattern, same batch size and retry config. Good structural consistency.
- **Logs-only delivery tracking**: no D1 notification_log table. Coralogix handles this, matching the webhook precedent.
- **No framework for templates**: vanilla HTML with inline styles. Exactly right for email.
- **Unsubscribe security model is solid**: HMAC tokens with domain separation, GET confirmation (email scanner safety), POST for action, timing-safe verification, eventType validated against allowlist before SQL.
- **PII discipline**: email addresses explicitly excluded from all log calls. Comments reinforce the invariant at every relevant code path.
- **Deduplication via `notification_sent` table**: clean, simple, correctly prevents duplicate threshold notifications per billing period.
- **Weekly digest has LIMIT + warning log**: addresses the scaling cliff concern from plan review.
- **Column-per-type schema**: correct for the query patterns. Simple, queryable, no JSON parsing needed.
