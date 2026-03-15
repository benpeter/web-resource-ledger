MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Add minimum viable observability with Coralogix integration to a Cloudflare Worker (issue #17). Every capture pipeline failure, successful capture, and security event must be logged as structured JSON and shipped to Coralogix in real time. The log helper is a single function under 30 lines with no external dependencies. No new npm dependencies. All existing tests must pass. CORALOGIX_ENDPOINT as [vars] in wrangler.toml. Coralogix integration must not be deferred.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wUNrkM/mvo-coralogix-integration/phase2-observability-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wUNrkM/mvo-coralogix-integration/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wUNrkM/mvo-coralogix-integration/phase2-debugger-minion.md

## Key consensus across specialists:

### observability-minion
- 17-line log() helper using Coralogix native envelope (applicationName/subsystemName/severity/timestamp) with JSON payload in text field
- Severity: INFO=3 success, WARNING=4 degradation/rate-limits, ERROR=5 failures/auth/SSRF
- Synchronous call returning fetch Promise for ctx.waitUntil
- Index.js callers need ctx.waitUntil wrapping; Coralogix legacy endpoints deprecated March 2026

### security-minion
- Log hashed client IP (not raw for GDPR), route pattern not full path, reason code, method, status
- Never log URLs, API keys, or capture IDs
- SSRF logs use static rejection reason only (not the URL)
- Seven additional rejection points beyond the three in the issue should emit security events
- Unmatched-route 404s have no rate limiter (log volume risk)
- console.warn should be replaced not duplicated

### debugger-minion
- Five error paths in capture.js mapped with precise log placement
- Log before KV for failures (ensures record even if KV fails), after KV for success
- WACZ degradation is warn not error (graceful degradation, capture still succeeds)
- catch-all needs TWO logs (original error + KV failure)
- log() MUST be infallible (internal try/catch) -- if it throws inside the try block, cascades to catch-all
- Hidden gap: header fetch failure silently swallowed (line 106), needs warn-level log

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions (read the full files)
2. Resolve any conflicts between recommendations:
   - Security-minion wants hashed client IP (GDPR); observability-minion didn't address IP. Resolve: do we hash IP or skip it for MVP?
   - Security-minion recommends 7 additional event types beyond issue scope (Content-Type, malformed JSON, etc.). Resolve: include all or stick to issue's 3?
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. No external skills to integrate
7. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wUNrkM/mvo-coralogix-integration/phase3-synthesis.md`

## Key constraints from the issue:
- Log helper: single function, under 30 lines, no external deps
- No new npm dependencies
- All existing tests must pass
- Coralogix integration ships with this work (non-negotiable)
- Fire-and-forget: Coralogix failures never affect the request path
- CORALOGIX_ENDPOINT as [vars] in wrangler.toml

## Codebase files that will be modified:
- NEW: src/log.js (log helper)
- MODIFIED: src/capture.js (pipeline instrumentation)
- MODIFIED: src/index.js (security event instrumentation)
- MODIFIED: wrangler.toml (CORALOGIX_ENDPOINT var)
- NEW: test/log.test.js (log helper tests)
- MODIFIED: docs/backlog.md (update structured logging and security monitoring items)
