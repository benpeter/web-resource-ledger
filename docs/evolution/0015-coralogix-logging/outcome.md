# Phase 0015: Outcome

## What was produced

A minimum viable observability layer that ships structured JSON logs to Coralogix in real time. Every capture pipeline outcome and every security rejection point now emits a structured log event.

### Files created

- `src/log.js` -- 17-line fire-and-forget log helper. Single exported function, no dependencies. Guards on CORALOGIX_ENDPOINT + CORALOGIX_SEND_KEY. Returns fetch Promise for ctx.waitUntil() callers. Infallible via try/catch + .catch(() => {}).
- `test/log.test.js` -- 8 tests covering guard clauses, payload structure, severity propagation, error swallowing, and circular reference handling.

### Files modified

- `src/capture.js` -- 6 log calls at every pipeline outcome: browser render failure (error), header fetch failure (warn), WACZ bundling failure (warn), capture success (info), catch-all error (error), catch-all KV failure (error). Duration timer added. console.warn replaced with structured log.
- `src/index.js` -- 6 security event log calls: auth failure, per-IP rate limit, global capacity limit, SSRF block, verify rate limit, signing-key rate limit. All wrapped in ctx.waitUntil(). handleGetSigningKey gained ctx parameter.
- `wrangler.toml` -- Added [vars] section with CORALOGIX_ENDPOINT pointing to EU2/Stockholm region.
- `docs/backlog.md` -- Structured logging marked DONE. Security monitoring marked PARTIAL. 7 new deferred items added.

### Log event taxonomy

| Event | Severity | Subsystem | Location |
|-------|----------|-----------|----------|
| capture.stage.fail | 5 (error) | capture | capture.js |
| capture.header_fail | 4 (warn) | capture | capture.js |
| capture.wacz_fail | 4 (warn) | capture | capture.js |
| capture.success | 3 (info) | capture | capture.js |
| capture.fail | 5 (error) | capture | capture.js |
| capture.kv_fail | 5 (error) | capture | capture.js |
| security.auth_fail | 5 (error) | security | index.js |
| security.rate_limit | 4 (warn) | security | index.js |
| security.capacity_limit | 4 (warn) | security | index.js |
| security.ssrf_block | 5 (error) | security | index.js |

## Test results

335 tests across 18 test files -- all passing. 8 new tests in log.test.js. Zero regressions.

## What deviated from the plan

- Synthesis originally specified EU1 Coralogix region; corrected to EU2 during architecture review (caught by 4/6 reviewers).
- Security-minion's scheme rejection advisory incorporated: static reason code instead of result.detail for scheme rejections.
- try/catch around JSON.stringify added per reviewer consensus (not in original observability-minion design).

## Backlog changes

### Marked done
- Structured logging (Operations section)

### Marked partial
- Security monitoring and alerting → Security event logging (Security section) -- logging done, alerting rules and dashboards still needed

### Added
- [should] Hashed IP logging -- HMAC-SHA256 approach ready for implementation
- [consider] Additional security event types -- Content-Type, malformed JSON, missing URL, unmatched route
- [consider] Auth reason codes -- finer-grained auth failure logging
- [consider] R2 write try/catch granularity
- [consider] 404 rate limiting -- log volume amplification vector
- [consider] Coralogix alerting rules
- [consider] Coralogix Send Key IP allowlisting
