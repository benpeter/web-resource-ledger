# Meta-Plan: Coralogix Structured Logging Integration

## Planning Consultations

### Consultation 1: Observability Architecture
- **Agent**: observability-minion
- **Planning question**: Given a Cloudflare Worker with a multi-stage capture pipeline (browser render, R2 write, KV write, WACZ bundling, signing) running inside `ctx.waitUntil()`, how should structured log events be designed for Coralogix REST ingestion? Specifically: (1) What fields belong in every log entry (common envelope) vs. stage-specific fields? (2) What severity levels map to pipeline failures vs. security events vs. success? (3) How should the `log()` helper be structured to stay under 30 lines while supporting captureId, stage, error category, retryable flag, duration, and bundle size? (4) What Coralogix-specific fields are required in the REST payload (applicationName, subsystemName, severity)? The constraint is: single function, no external dependencies, JSON.stringify + fetch(), fire-and-forget in waitUntil, Coralogix failures swallowed silently.
- **Context to provide**: `src/capture.js` (pipeline stages and error handling), `src/index.js` (auth/rate-limit/SSRF rejection points), `src/responses.js` (existing response helpers pattern), `wrangler.toml` (current bindings), Coralogix REST ingestion API format
- **Why this agent**: Observability-minion owns structured logging design, severity classification, and log schema decisions. This is the core domain of the task.

### Consultation 2: Security Event Taxonomy
- **Agent**: security-minion
- **Planning question**: The issue requires security event logging for auth failures, SSRF blocks, and rate limit hits. (1) What fields should security event logs contain beyond the common envelope -- should they include client IP, request path, or user-agent, and what are the information disclosure risks of logging these? (2) Should SSRF blocks log the rejected URL/hostname or just the rejection reason (balancing debuggability vs. leaking attacker probes)? (3) Are there additional security events in the current codebase that should be logged (e.g., Content-Type rejections, malformed JSON, scheme violations)? (4) Any concerns about the Coralogix send key being accessible in Worker code via env binding -- is the current secret pattern sufficient?
- **Context to provide**: `src/index.js` (all rejection points in handleCreateCapture), `src/auth.js` (auth failure paths), `src/url-validation.js` (SSRF rejection paths), `wrangler.toml` (secret binding pattern)
- **Why this agent**: Security-minion ensures the logging itself doesn't create new attack surface (information disclosure, log injection) and that the security event taxonomy is complete.

### Consultation 3: Capture Pipeline Integration Points
- **Agent**: debugger-minion
- **Planning question**: Looking at `src/capture.js`, the pipeline has multiple error paths: (1) renderer rejection (categorizeError maps to user-safe messages), (2) R2 write failures (currently caught by outer try/catch), (3) WACZ bundling failure (caught and warned but capture completes), (4) KV completeCapture/failCapture failures (catch-all). For each of these, where exactly should log() calls be inserted to capture stage-level granularity without disrupting the existing error flow? Should logging happen before or after KV status updates? Should the WACZ "completed without bundle" path log at warn vs. error severity? What about the catch-all at line 157-162 where both the original error and the KV write might fail?
- **Context to provide**: `src/capture.js` (full file), `src/kv.js` (KV operations that could fail)
- **Why this agent**: Debugger-minion excels at tracing error paths and identifying exactly where instrumentation needs to go without breaking existing behavior. This is about placement precision, not log schema design.

### Cross-Cutting Checklist
- **Testing**: Include test-minion for planning -- YES. The task explicitly requires "all existing tests pass" and the log helper needs its own tests. test-minion should advise on: (1) how to test the log() helper in isolation (mock fetch for Coralogix endpoint), (2) how to verify log calls are made at the right pipeline stages without coupling to Coralogix, (3) whether integration tests need fetchMock entries for the Coralogix endpoint to prevent test failures.
- **Security**: Include security-minion for planning -- YES (Consultation 2 above). Security events are a core deliverable, and the logging itself must not create information disclosure or log injection vectors.
- **Usability -- Strategy**: ALWAYS include -- The log helper is a developer-facing API (internal DX). ux-strategy-minion should review: is the log() function signature intuitive? Does the structured log format make Coralogix queries easy? However, given the tight scope (single function, no UI, no end-user impact), this can be handled as a lightweight review rather than a full planning consultation. Include in architecture review (Phase 3.5), not planning.
- **Usability -- Design**: Not applicable -- no user-facing UI changes in this task. Exclude.
- **Documentation**: ALWAYS include -- software-docs-minion should be consulted on: where does the log helper's API get documented (inline JSDoc sufficient, or does it need a docs/ entry)? The evolution log is mandatory per CLAUDE.md. However, this is straightforward enough to handle in Phase 8 post-execution rather than planning. Exclude from planning consultations.
- **Observability**: Include observability-minion for planning -- YES (Consultation 1 above). This IS the observability task.

### Anticipated Approval Gates

1. **Log schema and helper function design** (MUST gate) -- The structured log format (field names, severity mapping, Coralogix envelope) is the foundational decision. Every log call in the codebase will use this schema. Hard to reverse once log data starts flowing to Coralogix. High blast radius: all subsequent implementation tasks depend on it. Multiple valid approaches exist (flat vs. nested, Coralogix severity integers, field naming conventions).

2. **Execution plan approval** (standard gate) -- After synthesis, before spawning agents.

That's it -- 2 gates. The implementation itself (where to insert log calls, wrangler.toml var, test updates) follows directly from the schema decision and doesn't warrant additional gates.

### Rationale

This task is well-scoped and implementation-focused: add a small logging helper, call it from known locations, ship logs to a known endpoint. Three specialists are needed for planning:

- **observability-minion** is the primary domain owner -- structured logging is their core expertise, and the Coralogix REST API integration requires knowledge of their payload format.
- **security-minion** is essential because security events are an explicit deliverable and logging itself can create information disclosure risks.
- **debugger-minion** brings precision about where in the error flow to insert instrumentation -- capture.js has nuanced error handling (Promise.allSettled, nested try/catch, graceful degradation paths) where wrong placement could swallow errors or create double-logging.

Agents deliberately excluded from planning:
- **test-minion**: The testing needs are straightforward (mock fetch, verify log calls). Better handled as a Phase 3.5 reviewer and Phase 6 execution than a planning consultation.
- **ux-strategy-minion**: No end-user impact. Developer DX of the log() function is simple enough to review at Phase 3.5.
- **software-docs-minion / user-docs-minion**: JSDoc + evolution log. Standard Phase 8.
- **margo**: Will review for over-engineering at Phase 3.5 (mandatory). The issue's explicit constraints (30 lines, no deps, no abstractions) already enforce KISS.
- **frontend-minion, iac-minion, edge-minion**: No frontend, no infrastructure changes beyond a wrangler.toml var, no edge logic changes.

### Scope

**In scope**:
- New `src/log.js` module with a single `log()` helper function (<30 lines)
- CORALOGIX_ENDPOINT var in wrangler.toml `[vars]` section
- Structured JSON log calls at every capture pipeline stage (success and failure) in `src/capture.js`
- Security event log calls for auth failures, SSRF blocks, and rate limit hits in `src/index.js`
- Tests for the log helper
- Verification that all 17 existing test files continue to pass
- Backlog updates (mark structured logging and security monitoring items)
- Evolution log entry (0015-coralogix-logging)

**Out of scope** (per issue constraints):
- OpenTelemetry, distributed tracing, metrics pipelines
- Dashboards, alerting rules, SLOs
- Sampling logic, request-level middleware
- Logger factory abstractions, logging libraries
- New npm dependencies
- Any changes to the request/response path (logging is fire-and-forget in waitUntil or swallowed inline)

### External Skill Integration

No external skills detected in project.
