# Phase 0061: Content Security Scanning -- Outcome

## What was built

Content security scanning for WRL: pre-capture URL screening against Google
Web Risk, daily re-scanning of existing captures, and quarantine enforcement
across all API endpoints.

### New files

- `src/threat-check.js` (129 lines) -- Web Risk API client with injectable
  lookup dependency, single and batch URL checking, 2s timeout, fail-open
  on errors
- `src/rescan.js` (175 lines) -- Daily cron handler that re-scans complete
  captures older than 24h, quarantines flagged URLs, dispatches webhooks
- `test/threat-check.test.js` (226 lines) -- 16 unit tests, zero network
  calls
- `migrations/0009_threat_check.sql` (44 lines) -- D1 schema additions:
  quarantine columns, threat_checks audit table, partial rescan index
- `docs/operations/runbooks/threat-check-quarantines.md` (88 lines)
- `docs/operations/runbooks/threat-check-api-failures.md` (93 lines)

### Modified files

- `src/index.js` (+167 lines) -- Pre-capture threat check in single and
  batch capture endpoints; 451 responses for quarantined artifact/verify
  access; cron dispatch for rescan
- `src/db.js` (+183 lines) -- 5 new functions (setCaptureThreatCheck,
  quarantineCapture, quarantineCapturesByUrl, recordThreatCheck,
  listCapturesNeedingThreatCheck); rowToCapture quarantine status mapping
- `src/webhook-dispatch.js` (+3 lines) -- capture.quarantined event branch
- `src/webhooks.js` (+1 line) -- capture.quarantined in VALID_EVENTS
- `src/responses.js` (+1 line) -- 451 status title
- `wrangler.toml` -- Daily cron triggers for both environments
- `scripts/provision-alerts.sh` (+81 lines) -- Two new Coralogix alerts
- `docs/operations/alerts.md` (+57 lines) -- Alert documentation
- `docs/audit-log-schema.md` (+35 lines) -- 5 new event types
- `openapi.yaml` (+88 lines) -- Quarantine status, 422/451 responses
- `README.md` (+17 lines) -- Content security section
- `CONTRIBUTING.md` (+3 lines) -- .dev.vars template

### Numbers

- 19 files changed, +1632/-195 lines
- 4 commits on feature branch + 1 fix commit
- 1141 tests pass (48 test files), 0 failures
- 7 code review findings identified, all resolved
- 2 new Coralogix alerts configured
- 2 new operational runbooks

## What deviated from the plan

1. **Issue spec said "Safe Browsing"** but we used Web Risk -- the commercial
   equivalent. Safe Browsing v4 prohibits commercial use; Web Risk has the
   same data and is license-appropriate for a SaaS product.

2. **Issue spec said `safeBrowsing: "unavailable"`** in metadata. We used
   provider-agnostic `threatCheck: "unavailable"` to decouple the API from
   the specific provider.

3. **D1 CHECK constraint limitation** forced a `quarantined` flag column
   approach instead of adding `'quarantined'` directly to the status enum.
   API layer maps this transparently -- callers see `status: "quarantined"`.

4. **Code review found 7 issues** post-execution: fail-closed documentation
   (should be fail-open), non-deterministic GROUP BY, staging cron dispatch
   bug, queue idempotency guard, type mismatch in rescan quarantine, missing
   webhook payload fields. All fixed before PR.

## Success criteria verification

| Criterion | Status |
|-----------|--------|
| URLs checked before capture | Done -- checkUrl in handleCreateCapture and handleBatchCapture |
| Malicious URLs rejected with 422 | Done -- 422 with threatTypes in error body |
| Background re-scan via Cron Trigger | Done -- daily at 03:00 UTC (prod) / 04:00 UTC (staging) |
| Quarantined captures: metadata accessible, artifacts 451 | Done -- handleGetCapture returns metadata, artifact/verify return 451 |
| Quarantine visible in metadata | Done -- status: "quarantined", quarantineReason in response |
| Coralogix alert on quarantine threshold | Done -- >5 quarantines in 24h triggers P3 alert |
| Graceful degradation on API failure | Done -- fail-open with threatCheck: "unavailable" |
| API key stored as Worker secret | Done -- GOOGLE_WEB_RISK_API_KEY via wrangler secret put |

## Backlog changes

- **Done**: ~~[should] Content security scanning (Safe Browsing)~~ in Security
  parking lot -- completed as R32 with Web Risk API
- **New parking lot items**:
  - [consider] Un-quarantine workflow (operator appeal) -- when a tenant
    disputes a quarantine or a URL is confirmed clean
  - [consider] Web Risk Update API with local cache -- when pre-capture
    latency from Lookup API exceeds 200ms at scale
