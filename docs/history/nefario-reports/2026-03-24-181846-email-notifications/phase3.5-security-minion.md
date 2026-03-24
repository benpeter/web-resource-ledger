ADVISE

---

- [security]: HMAC token reuses SESSION_SECRET across unsubscribe and session cookies
  SCOPE: src/unsubscribe.js -- HMAC key derivation
  CHANGE: Derive a separate key for unsubscribe tokens rather than reusing SESSION_SECRET. Use HKDF or a different named secret (UNSUBSCRIBE_SECRET, or derive via `unsub.` keyed HMAC of SESSION_SECRET as a sub-key). The plan does use a purpose prefix (`unsub.{payload}`) on the HMAC *input*, which prevents cross-verification, but key reuse means a compromised SESSION_SECRET compromises unsubscribe tokens and vice versa -- blast radius is wider than necessary.
  WHY: Key reuse violates the principle of cryptographic separation. If session signing is ever rotated (key compromise, leak), all in-flight unsubscribe tokens embedded in previously sent emails become invalid with no migration path. Conversely, a timing side-channel on the unsubscribe endpoint (unauthenticated, rate-limited only to 10 req/min) could leak information about SESSION_SECRET. Separate keys limit blast radius.
  TASK: Task 1 (Part D)

- [security]: Unauthenticated unsubscribe endpoint rate limit is too permissive for a HMAC oracle
  SCOPE: src/unsubscribe.js -- POST /v1/notifications/unsubscribe, rate limit group in src/index.js
  CHANGE: Reduce from 10 req/min per IP to 5 req/min per IP and add a token-level rate limit: track failed verifications per IP (not per token) in KV with a 1-hour window. After 20 failed verifications from an IP within an hour, return 429 without processing. The current plan only adds it to AUTH_RATE_LIMITER at 10 req/min -- that allows 600 HMAC oracle queries per hour per IP, which is meaningful against HMAC-SHA256 with a 256-bit key if the implementation is not perfectly constant-time.
  WHY: The endpoint is unauthenticated, accepts arbitrary token values, and performs a HMAC verification on each request. Although `crypto.subtle.verify` is timing-safe, 600 req/hr per IP is a generous oracle budget. The primary risk is not key recovery (infeasible against HMAC-SHA256) but token enumeration: an attacker can confirm whether a guessed tenantId+eventType pair produces a valid token. Tightening here has no UX cost (legitimate one-click unsubscribes are single requests).
  TASK: Task 1 (Part D)

- [security]: GitHub email auto-populated from OAuth is marked email_verified=1 without WRL controlling the verification
  SCOPE: src/oauth.js -- Task 3g, new-user creation and returning-user email update logic
  CHANGE: Add a comment in the code (and document in decisions.md) that `email_verified=1` here means "GitHub attested this address is verified" -- this is a trust delegation, not WRL's own verification. The plan accepts this implicitly but does not surface it. The practical risk is: if GitHub returns a verified email that is not deliverable (e.g., the user later abandoned the address but GitHub's verification record is stale), WRL will send email with no bounce feedback loop. Accept this risk explicitly rather than silently; document it in the gate rationale.
  WHY: No code change is strictly required, but the opt-out model (all notifications ON by default) combined with email_verified=1 from GitHub means tenants start receiving operational email immediately after first login, to an address they may not actively monitor. The risk is operational (delivery to stale addresses) and reputational (bounces hurt sender reputation). Acceptable for MVP, but should be a documented, conscious decision.
  TASK: Task 3 (Part 3g)

- [security]: catch(() => {}) on dispatchNotification silently swallows errors at trigger points
  SCOPE: src/index.js and src/billing.js -- all ctx.waitUntil(dispatchNotification(...).catch(() => {})) call sites in Task 3
  CHANGE: Replace `.catch(() => {})` with `.catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: classifyError(err) }))` or at minimum `.catch(err => console.error('dispatchNotification failed', err.message))`. The CLAUDE.md engineering philosophy explicitly forbids silent catch blocks: "Every catch must either log the error or handle a specific, named error type." The current plan violates this at every trigger point.
  WHY: A silent catch means if dispatchNotification itself throws (programming error, unexpected DB shape, unhandled edge case), the failure is completely invisible in logs. Given the project's explicit stance against silent catches, this is a direct contradiction of the stated constraints -- and it means the Task 3 agent will write code that conflicts with the project rules.
  TASK: Task 3 (all dispatchNotification call sites -- 3a through 3f)

- [security]: Email address included in queue message payload (to field) without redaction policy
  SCOPE: src/email-dispatch.js -- dispatchNotification enqueue call; Cloudflare Queue message body
  CHANGE: Document explicitly that queue messages contain the tenant's email address and that Cloudflare Queue storage must be treated as sensitive data. Add a comment in the enqueue code noting this. Separately, ensure the email field is NOT logged in handleEmailMessage (the plan says never log email addresses, but the queue message body contains `to`; log only `emailId` from Resend response and `tenantId`). The plan already prohibits logging email addresses -- this advisory is to make the queue-as-PII-store explicit in the code comments so future developers don't accidentally add queue message logging.
  WHY: GDPR Article 32 requires appropriate technical measures for PII at rest. Cloudflare Queues persist messages for up to 4 days. This is a known, accepted trade-off for async delivery, but it should be documented at the code level, not left implicit. If queue message logging is ever added for debugging, the email address would leak.
  TASK: Task 2 (Part D)

- [security]: Weekly digest fan-out queries all tenants in a single scheduled handler with no pagination
  SCOPE: src/notifications.js -- handleWeeklyDigest, the "query all tenants" loop in Task 3f
  CHANGE: Add a LIMIT clause to the tenant query (e.g., LIMIT 500) and document that fan-out above this limit requires a queue-based scatter approach. At current scale (<10 tenants) this is not a risk, but the plan should specify the limit so the agent does not write an unbounded SELECT that would time out a Cloudflare Worker at scale.
  WHY: Cloudflare Workers have a 30-second CPU time limit for scheduled handlers. An unbounded SELECT followed by per-tenant D1 queries and queue enqueues could hit this limit well before the tenant count becomes large. Not a current risk, but a design gap that should be addressed at implementation time rather than discovered in production.
  TASK: Task 3 (Part 3f)
