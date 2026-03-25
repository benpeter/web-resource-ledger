# Phase 0080: Decisions

## Pending-email vs Replace-and-verify

**Chosen: Pending-email** — add `pending_email` column, keep current email active until new one is verified.

**Rejected: Replace-and-verify** — overwrite email immediately, set emailVerified=false, suppress notifications until verified.

**Rationale:** Replace-and-verify creates a notification blackout. The dispatch pipeline (email-dispatch.js:167) suppresses ALL notifications when emailVerified is false. For a product that alerts on capture failures, quota limits, and payment issues, going dark because someone typed a new email is operationally unacceptable. The pending-email approach is the standard SaaS pattern (GitHub, Stripe use it) and produces zero notification gap.

## Token design: Stateless HMAC vs Opaque stored tokens

**Chosen: Stateless HMAC** with `emailverify.` domain prefix, 24h timestamp-based expiry, email binding in payload.

**Rejected: Random opaque tokens in D1** — would require a token table, cleanup cron, and adds storage complexity.

**Rationale:** The codebase already has an HMAC token pattern (unsubscribe.js). Reusing it with domain separation and added expiry is simpler, requires no new infrastructure, and the `pending_email` column provides natural replay protection (token's email must match current pending_email).

## Verification endpoint: GET+POST vs Single GET

**Chosen: GET renders confirmation page, POST executes verification.**

**Rejected: Single GET auto-verifies.**

**Rationale:** Email security scanners (Barracuda, Proofpoint, Microsoft Safe Links) pre-fetch GET URLs. A single-GET flow would auto-verify emails without user action. The GET+POST pattern was already used for unsubscribe and proven safe.

## Verification email: No unsubscribe link

**Chosen: Omit unsubscribe link from verification email.**

**Rationale:** Verification emails are transactional. The shared email layout's unsubscribe footer would silently disable capture failure alerts — a destructive side effect the user never intended. The template renders its own minimal footer without an unsubscribe link.

## Rate limiting: Column-based vs KV counters

**Chosen: `verification_sent_at` column** with 60-second cooldown check.

**Rejected: KV-based counter** (3/hour as security-minion suggested) and D1 attempt counting.

**Rationale:** A single timestamp column is simpler and sufficient. The 60s cooldown prevents rapid-fire sends. Combined with the per-IP AUTH_RATE_LIMITER (10 req/min), the surface for email bombing is adequately constrained.
