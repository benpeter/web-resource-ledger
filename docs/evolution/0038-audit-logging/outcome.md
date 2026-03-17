# Phase 0038: Outcome

## What Was Built

Structured audit logging for all authenticated API requests. Every successful
capture create, capture list, SSRF-blocked request, and post-auth error now
emits a lean audit event to Coralogix via a dedicated `audit` subsystem.

### Files Changed

| File | Change |
|------|--------|
| `src/auth.js` | `verifyApiKey()` returns `keyId` (SHA-256 prefix of API key) on success |
| `src/index.js` | 6 audit event emission points across `handleCreateCapture()` and `handleListCaptures()` |
| `src/log.js` | INVARIANT comment updated with URL exception, subsystem registry, audit constraint, severity 6 |
| `test/auth.test.js` | keyId format, determinism, and non-leakage assertions |
| `docs/evolution/0038-audit-logging/` | prompt.md, decisions.md (this file is outcome.md) |
| `docs/evolution/README.md` | Phase 0038 row added |

### Audit Event Taxonomy

| Event | Outcome | Trigger |
|-------|---------|---------|
| `audit.capture.create` | `success` | Capture accepted, KV record created, 202 returned |
| `audit.capture.create` | `denied` | Authenticated SSRF block |
| `audit.capture.create` | `error` | KV write failure after successful auth |
| `audit.capture.list` | `success` | List captures completed |
| `audit.capture.list` | `error` | List captures KV failure |

Additionally, `outcome: 'denied'` was added to existing `security.auth_fail`
events in both handlers.

### SSRF INVARIANT Fix

The `security.ssrf_block` log call previously used `result.detail` (attacker-controlled)
as the reason field. Replaced with a closed 5-value enum: `url_scheme_not_allowed`,
`private_ip_blocked`, `credentials_not_allowed`, `dns_resolution_failed`,
`ssrf_blocked_other`. The enum is derived by substring matching on `validateUrl()`
error messages -- fragile coupling acknowledged as a known limitation (see below).

## What Deviated from Plan

1. **No capture.js changes**: The original synthesis proposed threading `keyId`
   through `performCapture()`. Architecture review (3/6 reviewers) flagged this
   as high-risk churn (50+ test call sites, static value pre-R12). Deferred to R12.

2. **Key lifecycle schemas removed**: Original plan had full field tables for
   `audit.key.create` and `audit.key.revoke`. Reduced to forward-reference
   paragraph per YAGNI review consensus (lucy, margo).

3. **SSRF audit event added**: Not in original synthesis. Added per
   ux-strategy-minion advisory -- authenticated SSRF blocks need to appear
   in the audit trail for complete tenant activity investigation.

4. **KV failure audit event added**: Not in original synthesis. Added per
   observability-minion advisory -- post-auth errors need audit trail coverage.

## Known Limitations

- **keyId is static pre-R12**: Every request produces the same keyId because
  there is only one API key. Audit logging records "what happened" but not
  "who did it" until R12 ships per-tenant keys.

- **SSRF reason enum fragility**: The closed enum is derived by substring
  matching on `validateUrl()` error messages. If error messages are reworded,
  reasons silently degrade to `ssrf_blocked_other`. Consider having
  `validateUrl()` return a machine-readable reason code in a future phase.

- **ctx.waitUntil delivery not guaranteed**: Same as all existing log calls.
  If the Worker isolate terminates early, audit events may be lost. R16
  (queue migration) is the eventual fix.

## Verification

- 512/512 tests pass
- Code review: APPROVE (2 ADVISE on SSRF enum granularity, 2 NITs)
- Lucy: ADVISE (outcome.md needed -- this file)
- Margo: ADVISE (SSRF reason fragility -- acknowledged above)

## Backlog Changes

- R13 marked DONE in Act 2 section
- New parking lot item: SSRF reason enum -- consider `validateUrl()` returning
  machine-readable reason codes when url-validation.js is next modified
- "Security event logging" in Done section updated from PARTIAL to include
  audit trail
