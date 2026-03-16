# Meta-Plan: Hashed IP Logging + categorizeError Fix

## Task Summary

Combined implementation of two issues that both modify `src/capture.js` and
`test/capture.test.js`:

1. **Issue #36 (R6)**: Add HMAC-SHA256 hashed IP to all structured log entries
   for abuse correlation without storing raw IPs. Daily key rotation via
   date + secret seed.

2. **Issue #52**: Fix `categorizeError()` swallowing Playwright error messages.
   Log raw `error.message`/`error.name` in `capture.stage.fail` and catch-all
   events. Add missing error patterns.

Both touch logging in `capture.js`. They share file ownership but are logically
independent changes that should be sequenced (not parallel) to avoid merge
conflicts on the same lines.

## Planning Consultations

### Consultation 1: Security review of HMAC-SHA256 IP hashing scheme

- **Agent**: security-minion
- **Planning question**: Review the proposed HMAC-SHA256 IP hashing approach for
  GDPR compatibility and cryptographic soundness. Specifically: (1) Is daily key
  rotation via `HMAC(date + secret_seed, ip)` sufficient to prevent rainbow
  table attacks on the ~4B IPv4 address space? (2) Should the secret seed be a
  new Wrangler secret or derived from the existing `SIGNING_KEY`? (3) Is the
  hashed IP considered pseudonymized data under GDPR Article 4(5), and does that
  change our retention obligations? (4) Should we log the hashed IP alongside
  ALL log events (security.*, capture.*, list.*) or only capture-related events?
- **Context to provide**: `src/log.js` (the Coralogix log function), `src/index.js`
  (where CF-Connecting-IP is read for rate limiting), `src/capture.js` (where the
  `ip` parameter flows but is never logged), `wrangler.toml` (existing secrets
  model). Currently the raw IP is stored in KV via `createCapture()` -- issue #36
  only addresses log entries, not KV storage.
- **Why this agent**: Cryptographic scheme design and GDPR data classification
  are security-domain decisions. Wrong choices here are hard to reverse (changing
  a hashing scheme retroactively invalidates correlation across existing logs).

### Consultation 2: Observability impact of enriched error logging

- **Agent**: observability-minion
- **Planning question**: For issue #52 (logging raw error.message alongside
  categorized errors): (1) Should raw error messages go into a separate field
  (e.g., `rawError`) or a nested object? (2) What's the Coralogix query impact
  of adding `rawError` and `rawErrorName` fields to `capture.stage.fail` and
  `capture.fail` events? (3) The `log()` function's INVARIANT comment says
  `data` must contain only static/predetermined strings, never attacker-controlled
  input. Playwright error messages are framework-generated, not user-controlled --
  but should we truncate or sanitize them before logging? (4) For the hashed IP
  field: should it live at the top level of every log entry or only in specific
  events?
- **Context to provide**: `src/log.js` (invariant comment, Coralogix payload
  structure), `src/capture.js` lines 102-106 (current `capture.stage.fail` log)
  and line 182 (current catch-all log). The Coralogix `text` field is a
  JSON-stringified object -- new fields become queryable attributes.
- **Why this agent**: Log schema design affects queryability and alerting.
  Field naming conventions and the decision about where hashed IPs appear in log
  entries needs observability expertise to ensure correlation works in practice.

### Consultation 3: Implementation approach for HMAC in Workers runtime

- **Agent**: iac-minion
- **Planning question**: (1) The Web Crypto API (`crypto.subtle.importKey` +
  `crypto.subtle.sign` with HMAC/SHA-256) is available in Cloudflare Workers --
  confirm this is the right primitive (vs. a polyfill or npm dependency). (2) The
  HMAC secret seed needs to be a new Wrangler secret (`IP_HASH_SEED` or similar).
  Should this be added to both production and staging environments? (3) The
  `vitest.config.js` injects secrets via `miniflare.bindings` -- the test seed
  needs to go there too. (4) Is there any concern about the async nature of
  `crypto.subtle.sign` adding latency to every log call? The `log()` function is
  fire-and-forget but called multiple times per capture.
- **Context to provide**: `wrangler.toml` (secrets model, staging env),
  `vitest.config.js` (test bindings), `src/log.js` (the function signature and
  fire-and-forget pattern). Workers runtime supports Web Crypto API natively.
- **Why this agent**: Infrastructure configuration (new secrets, test bindings,
  staging parity) and Workers runtime API compatibility are iac-minion's domain.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning -- YES. Both issues explicitly
  require new test cases. The HMAC hashing function needs unit tests (deterministic
  output for same IP + same day, different output for different days). The
  categorizeError changes need tests for new error patterns and for the presence of
  `rawError`/`rawErrorName` in log events. Planning question: Should tests verify
  log payloads (which requires intercepting `log()` calls) or just verify
  categorizeError output and KV state?

- **Security**: Include security-minion for planning -- YES (Consultation 1 above).
  HMAC scheme design, GDPR classification, and the question of whether Playwright
  error messages could leak internal state into logs are all security concerns.

- **Usability -- Strategy**: ALWAYS include -- Planning question for
  ux-strategy-minion: These changes are purely backend/logging with no user-facing
  impact. The only UX consideration is whether the error messages stored in KV
  (which DO reach the API consumer via the status endpoint) should also be
  improved. Issue #52 only addresses log messages, not the user-facing error in
  `failCapture()`. Should we flag this as a separate concern or is the current
  user-facing categorization adequate?

- **Usability -- Design**: Exclude ux-design-minion and accessibility-minion.
  No UI components are produced or modified. Both changes are backend logging
  modifications invisible to end users.

- **Documentation**: ALWAYS include -- Planning question for software-docs-minion:
  The HMAC hashing scheme introduces a new operational concern (the IP_HASH_SEED
  secret must be provisioned, and operators need to understand the daily rotation
  semantics). Should this be documented in the README's deployment section, or is
  a code comment sufficient for a single-operator project? The evolution log entry
  (required by CLAUDE.md) will capture the full rationale.

- **Observability**: Include observability-minion for planning -- YES
  (Consultation 2 above). Log schema changes directly affect Coralogix
  queryability and the ability to correlate abuse patterns. This is the primary
  consumer of both changes.

### Anticipated Approval Gates

1. **HMAC hashing scheme design** (MUST gate): The cryptographic scheme (algorithm
   choice, key derivation method, field naming, which events include the hash)
   is hard to reverse once logs are written with a particular format. Multiple
   valid approaches exist (HMAC-SHA256 vs SHA256 with salt, daily vs hourly
   rotation, per-event vs per-request hashing). High blast radius: every
   subsequent log entry will use this scheme. This decision should be approved
   before implementation begins.

No other gates anticipated. The categorizeError fix (#52) is straightforward
additive code with clear success criteria and low blast radius.

### Rationale

This is a focused, two-issue implementation phase touching primarily
`src/capture.js` and `test/capture.test.js`. The issues share file ownership
but are logically independent.

The planning consultations focus on the decisions that matter:
- **security-minion**: The HMAC scheme is the one design decision that's hard to
  reverse. Getting the cryptographic approach and GDPR classification right before
  implementation avoids rework.
- **observability-minion**: Both issues change what gets logged. Log schema design
  determines whether the hashed IPs and raw error messages are actually useful for
  abuse correlation and debugging.
- **iac-minion**: New secret provisioning and Workers runtime API confirmation are
  prerequisites for implementation.
- **test-minion**: Both issues require tests, and the HMAC function's
  deterministic-per-day property needs a specific testing approach.
- **ux-strategy-minion**: Lightweight check -- these are backend changes, but the
  boundary between internal log messages and user-facing error messages deserves
  a quick review.
- **software-docs-minion**: Operational documentation for the new secret.

Agents NOT consulted for planning:
- frontend-minion, ux-design-minion, accessibility-minion, seo-minion,
  sitespeed-minion: No frontend or user-facing changes.
- data-minion: No database schema changes (KV structure unchanged).
- api-design-minion, api-spec-minion: No API contract changes.
- mcp-minion, oauth-minion: Not relevant.
- edge-minion: No CDN/caching changes.
- ai-modeling-minion: No prompt engineering or agent changes.
- debugger-minion: Not a debugging task.
- code-review-minion: Phase 5 handles post-execution review.
- user-docs-minion: No user-facing documentation changes needed.
- product-marketing-minion: No product positioning changes.
- lucy, margo: Governance reviewers in Phase 3.5, not planning consultants.

### Scope

**In scope**:
- HMAC-SHA256 hashing function for CF-Connecting-IP with daily key rotation
- New `IP_HASH_SEED` Wrangler secret (production + staging + test config)
- Integration of hashed IP field into structured log entries via `log()` calls
- Fix `categorizeError()` to match additional Playwright session error patterns
- Log raw `error.message` and `error.name` in `capture.stage.fail` and
  `capture.fail` events
- Unit tests for HMAC function (determinism, daily rotation, edge cases)
- Unit tests for new categorizeError patterns
- Evolution log entry (0019-hashed-ip-logging)

**Out of scope**:
- IP geolocation
- Rate limiting changes (rate limiting already uses CF-Connecting-IP directly)
- Coralogix dashboard updates
- Removing raw IP from KV storage (separate concern, not in either issue)
- Changes to user-facing API responses
- Changes to `src/log.js` itself (the log function signature stays the same;
  callers pass the hashed IP as a data field)

### External Skill Integration

No external skills detected in project. The `.claude/skills/` and `.skills/`
directories do not exist in the working directory. Global skills
(`~/.claude/skills/`) are all despicable-agents agents or unrelated skills
(obsidian-tasks, transcribe, juli, etc.) -- none overlap with this task domain.
