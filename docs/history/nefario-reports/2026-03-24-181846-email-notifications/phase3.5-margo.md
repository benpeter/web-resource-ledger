# Margo Review: Email Notifications Plan

## Verdict: ADVISE

The plan is well-scoped and proportional to the stated requirements. It follows established codebase patterns (queue architecture mirrors webhooks, no new dependencies, no frameworks, logs-only delivery tracking). The explicit YAGNI constraints in the prompts are good discipline. Five concerns below -- none blocking, all addressable during implementation.

---

### Concerns

1. [simplicity]: Capture failure KV cooldown adds a speculative rate-limiting mechanism with no evidence of the problem it solves
   SCOPE: `src/email-dispatch.js`, `dispatchNotification` -- the "KV cooldown (5-minute window, max 3 then digest)" logic in Task 2 Part D step 4
   CHANGE: Remove the KV-based capture failure cooldown. The `notification_sent` dedup table already prevents repeat threshold emails. For capture failures, either send one email per failure (simple), or use the existing `notification_sent` table with a short period key (e.g., hourly bucket) to cap frequency. No KV involvement needed.
   WHY: This introduces a KV read+write on every capture failure dispatch path, a TTL-based counter that needs its own test coverage, and a "digest at window end" concept that is never actually implemented (no cron or timer fires at window expiration to send the digest). At <10 tenants, capture failure flooding is not a demonstrated problem. If it becomes one, a simple `notification_sent` dedup with an hourly period key achieves the same suppression without KV state, without a cooldown window, and without an unimplemented digest promise.
   TASK: 2

2. [simplicity]: Six separate template files for mostly identical structure is premature file proliferation
   SCOPE: `src/email/templates/*.js` -- six files specified in Task 2 Part C
   CHANGE: Start with a single `src/email/templates.js` module exporting six named functions. The templates share identical structure (subject + HTML card with accent color + CTA button + plain text). Extract the template when (if) they diverge enough to warrant separate files. One file with six small functions is easier to review, test, and modify than six files with repeated boilerplate.
   WHY: Each template follows the same pattern: accent-colored card, heading, a few data fields, one CTA button, plain text mirror. The variation is in data fields and color tokens. Six files means six imports, six test file references, and six places to update when the shared layout or footer changes. A single module keeps the blast radius small and makes it obvious when templates drift apart.
   TASK: 2

3. [simplicity]: `email-tokens.js` duplicates values already in `design-system.css` and will drift
   SCOPE: `src/email/email-tokens.js` -- Task 2 Part A
   CHANGE: Inline the hex values directly in `email-layout.js` as local constants (or a single `const EMAIL_COLORS = { ... }` object at the top of the file). A separate module for 15 string constants that are only consumed by one layout function adds a file and an import without providing any reuse benefit. If the values need to be shared across multiple email modules later, extract then.
   WHY: The values are used in exactly one place (the layout wrapper). A separate file adds navigational overhead and creates an illusion that these tokens are a shared contract. They are not -- they are static strings for inline CSS. Inlining them eliminates the file, the import, and the maintenance question of "should I update email-tokens.js when I change design-system.css?"
   TASK: 2

4. [simplicity]: The weekly digest fan-out query (all tenants with schedules + preferences join) could be expensive on D1 and has no pagination or batch limit
   SCOPE: `handleWeeklyDigest` in Task 3 section 3f
   CHANGE: Add a LIMIT clause to the tenant query (e.g., LIMIT 100) and document that the digest is designed for the current scale (<100 tenants). If the query returns the limit, log a warning. This prevents a surprise D1 timeout or Workers CPU limit hit if tenant count grows unexpectedly.
   WHY: D1 has a 30-second query timeout and Workers have CPU time limits. A query that joins tenants, notification_preferences, and schedules, then loops through results dispatching notifications, could hit these limits. A simple LIMIT + warning log is zero-cost insurance that makes the scaling cliff visible before it crashes.
   TASK: 3

5. [simplicity]: `.catch(() => {})` on dispatchNotification calls silently swallows errors
   SCOPE: Task 3, all six trigger points (3a through 3f)
   CHANGE: Use `.catch(err => { /* intentional: notification failure must not crash capture path */ })` or `.catch(() => { /* notification best-effort */ })`. Even better: if `dispatchNotification` already has internal try/catch with logging (which Task 2 specifies), the outer `.catch` is redundant -- verify and remove if so.
   WHY: The project's own CLAUDE.md says "silent catch {} blocks are forbidden. Every catch must either log the error or handle a specific, named error type." The `.catch(() => {})` pattern in the trigger wiring contradicts this rule. If `dispatchNotification` truly never throws (because it has internal error handling), the `.catch` is unnecessary. If it can throw, it should log. Either way, the current form violates the project's own engineering philosophy.
   TASK: 3

---

### What the plan gets right

- **No new dependencies**: direct `fetch()` to Resend API instead of an SDK. Correct call.
- **Follows established patterns**: queue architecture (producer/consumer/DLQ) mirrors the webhook system exactly. This is the right kind of consistency.
- **Logs-only delivery tracking**: rejecting a D1 `notification_log` table is the right YAGNI call. Coralogix already works for webhooks.
- **No framework for templates**: vanilla HTML with inline styles. Exactly right for email.
- **Explicit scope boundaries**: each task prompt lists what NOT to build. Good discipline.
- **Column-per-type over JSON blob**: correct for the query patterns (fan-out WHERE clauses). Simple ALTER TABLE to add types later.
- **HMAC tokens without expiry**: simpler than expiring tokens, and CAN-SPAM requires 30+ day validity anyway.
