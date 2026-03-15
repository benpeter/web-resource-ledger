# Phase 0015: Minimum Viable Observability with Coralogix Integration

Source: GitHub Issue #17

Every capture pipeline failure, successful capture, and security event is logged as structured JSON and shipped to Coralogix in real time, so that no incident goes undiagnosable. This is a product requirement, not optional infrastructure -- WRL's tamper-evident archival promise is hollow if the capture pipeline can fail silently with no evidence trail. The Coralogix integration must ship with this work and must not be deferred or descoped during planning or review.

## Success Criteria

- Every capture pipeline stage failure (browser render, R2 write, KV write, WACZ bundling, signing) emits a structured JSON log with captureId, stage name, error category, and retryable flag
- Every successful capture emits a structured log with captureId, total duration, WACZ success/fail, and bundle size
- Auth failures, SSRF blocks, and rate limit hits each emit a security event log
- All log entries are shipped to Coralogix via their REST ingestion endpoint using a non-blocking fetch() in waitUntil -- Coralogix failures are swallowed and never affect the request path
- CORALOGIX_ENDPOINT is configured as a `[vars]` entry in wrangler.toml
- The log helper is a single function under 30 lines with no external dependencies
- All existing tests pass
- No new npm dependencies added

## Scope

- In: Structured logging at capture pipeline stages, security event logging, Coralogix REST ingestion, CORALOGIX_ENDPOINT wrangler var, updating backlog items
- Out: OpenTelemetry, distributed tracing, metrics pipelines, dashboards, alerting rules, SLOs, sampling logic, request-level middleware, logger factory abstractions, logging libraries

## Constraints

- Coralogix as the observability platform (REST ingestion endpoint, no SDK)
- EU2/Stockholm region
- No new npm dependencies
- Non-negotiable: Coralogix integration ships with this work, not deferred
