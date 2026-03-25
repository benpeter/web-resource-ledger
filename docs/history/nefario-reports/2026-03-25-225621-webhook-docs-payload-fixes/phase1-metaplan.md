# Meta-Plan: Webhook Docs-vs-Code Fixes (Issue #212)

## Task Summary

Fix 12 discrepancies between webhook documentation and actual API behavior. Two code changes (add artifact URLs to `capture.complete` payload, echo signature headers in ping response) and ten documentation corrections across `webhook-dispatch.js`, `webhooks.js`, and `site/content/webhooks.md`.

## Planning Consultations

### Consultation 1: API payload design for artifact URLs and ping signature echo

- **Agent**: api-design-minion
- **Planning question**: The `capture.complete` webhook payload needs an `artifacts` object with URLs for screenshot, html, and headers. The docs already show the desired shape (lines 72-76 of `webhooks.md`). Should the code construct these URLs using the same `base + /v1/captures/{id}/artifacts/{type}` pattern already used for `verificationUrl`? And for the ping response: the current response is `{success, httpStatus, latencyMs}`. What fields should we add to echo the signature -- the full `X-WRL-Signature-256` and `X-WRL-Timestamp` header values, or a structured `{timestamp, signature}` object? Consider that the purpose is letting callers verify their verification logic end-to-end without needing to inspect HTTP headers.
- **Context to provide**: `src/webhook-dispatch.js` (lines 95-144, `buildWebhookPayload`), `src/webhooks.js` (lines 273-338, `handlePingWebhook`), `site/content/webhooks.md` (lines 56-80, existing docs artifact shape)
- **Why this agent**: API design expertise for payload shape decisions that become a contract. The artifact URL construction pattern and ping response shape are additive API surface that will be versioned.

### Consultation 2: Documentation accuracy audit

- **Agent**: user-docs-minion
- **Planning question**: Given the 12 findings from live testing, what is the right documentation structure for the corrected `webhooks.md`? Specifically: (a) Should `capture.quarantined` get its own documented example payload section or just a mention in the event types list with a note that it's for internal use? (b) The `changeDetection` block is a conditional field on `capture.complete` -- how should conditional/optional fields be presented in the payload examples without cluttering the primary example? (c) The retry section says "exponential backoff" but the schedule is fixed (60/300/900s) -- what's the accurate label?
- **Context to provide**: `site/content/webhooks.md` (full file), the 12 findings list from the issue
- **Why this agent**: Documentation structure and user-facing clarity decisions. The docs are the primary interface for webhook consumers.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning -- YES. The task explicitly requires new tests for artifacts in payload and signature echo in ping response. test-minion should advise on test structure given the existing `webhook-dispatch.test.js` and `webhook-crud.test.js` patterns.
- **Security**: Do NOT include security-minion for planning. The artifact URLs use the same authenticated endpoints that already exist. No new auth surface, no secret handling changes, no user input processing changes. The ping signature echo returns values the caller already has (they sent the request that triggered the signature). Security review in Phase 3.5 is sufficient.
- **Usability -- Strategy**: ALWAYS include -- Should the ping response include enough information for a consumer to fully validate their webhook verification implementation in a single call, or is the current "just check if it succeeded" approach sufficient? What's the minimal information a developer needs from a ping to debug signature verification failures?
- **Usability -- Design**: Do NOT include. No UI components involved -- this is API payload and documentation only.
- **Documentation**: ALWAYS include -- covered by Consultation 2 (user-docs-minion). software-docs-minion is not needed separately because there are no architectural changes, only payload field additions within existing patterns.
- **Observability**: Do NOT include. No new runtime components, no logging changes. The existing webhook delivery logging already captures all relevant fields.

### Notable Exclusions

- **security-minion**: Artifact URLs use existing authenticated artifact endpoints; ping echo returns data the caller already possesses. No new attack surface. Phase 3.5 mandatory review covers this.
- **software-docs-minion**: No architectural changes -- this is field-level payload additions and doc corrections within an established pattern. user-docs-minion covers the documentation angle.
- **frontend-minion**: No UI changes involved.

### Anticipated Approval Gates

**None anticipated.** This task is low blast radius (webhook payload and docs only, no downstream dependents in the plan) and easy to reverse (additive fields, docs corrections). The artifact URL pattern is already established in the existing docs example, and the ping signature echo is a straightforward addition. No gate meets the MUST threshold.

### Rationale

This is a well-scoped bug-fix task with clear findings from live testing. The primary planning value comes from:

1. **api-design-minion**: The two code changes (artifact URLs in payload, signature echo in ping) are additive API surface. Getting the shape right before implementation avoids breaking changes later.
2. **user-docs-minion**: 10 of 12 findings are documentation corrections. The docs are the primary consumer-facing artifact and need careful attention to conditional fields, event type coverage, and accurate terminology.
3. **ux-strategy-minion**: The ping endpoint's purpose is developer self-service verification. Understanding the developer's job-to-be-done (debug signature verification) informs what the ping response should contain.
4. **test-minion**: New tests are explicitly required. The existing test patterns (`webhook-dispatch.test.js`, `webhook-crud.test.js`) need to be extended, not created from scratch.

### Scope

**In scope:**
- Add `artifacts` object to `capture.complete` webhook payload in `buildWebhookPayload()`
- Add signature header fields to ping response in `handlePingWebhook()`
- Fix all 12 documentation discrepancies in `site/content/webhooks.md`
- New unit tests for artifact URLs in payload
- New integration tests for signature echo in ping response
- Fix `X-WRL-Delivery` null value on ping requests (set to fixed `evt_000...000` ID)

**Out of scope:**
- Webhook delivery/retry logic changes
- Queue infrastructure
- SSRF validation
- Stripe webhooks
- Any changes to the capture pipeline itself

### External Skill Integration

#### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | WRL operational procedures | Not relevant -- this task is code+docs changes, not operational procedures |

#### Precedence Decisions

No precedence conflicts. The ops-runbook skill covers operational procedures (tenant management, deploys, queries) which do not overlap with this task's domain of webhook payload code and documentation.
