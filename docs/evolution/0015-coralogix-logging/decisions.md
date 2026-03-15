# Phase 0015: Decisions

## Decision 1: Skip IP logging for MVP

**Options considered:**
- (A) HMAC-SHA256 of CF-Connecting-IP with daily-rotating key (security-minion recommendation)
- (B) Raw IP logging
- (C) Skip IP logging entirely

**Chosen:** (C) Skip IP logging entirely.

**Rationale:** The HMAC approach requires async crypto (incompatible with the synchronous log() design) and either a dedicated secret or repurposing CAPTURE_API_KEY. Raw IP is GDPR-problematic PII. Rate limiters already key on CF-Connecting-IP for enforcement; adding it to logs is a debugging convenience. Added to backlog as [should] with the HMAC design for future implementation.

## Decision 2: Log 6 security event types (not 3 or 10)

**Options considered:**
- (A) 3 events per issue scope: auth failure, SSRF block, rate limit
- (B) 10 events per security-minion: all rejection points
- (C) 6 events: issue scope + high-value additions

**Chosen:** (C) 6 events: auth failure, SSRF block, capture rate limit, global capacity limit, verify rate limit, signing-key rate limit.

**Rationale:** Added the 3 rate limiter events that have enforcement infrastructure and represent security boundaries. Excluded 4 input validation failures (Content-Type 415, malformed JSON 400, missing URL 400, unmatched route 404) -- high noise, low security signal. The 404 path critically has no rate limiter, creating unbounded log volume under scanning attacks.

## Decision 3: Do not log target URLs

**Options considered:**
- (A) Include URL in all capture events
- (B) Include URL only in success events
- (C) Never log the URL

**Chosen:** (C) Never log the URL.

**Rationale:** captureId is the correlation key. URLs are stored in KV for lookup when investigating specific captures. URLs may contain credentials in path segments (information disclosure risk). Including URLs adds bytes per log entry without querying benefit.

## Decision 4: No R2 try/catch granularity

**Chosen:** Keep R2 failures in the catch-all.

**Rationale:** Adding a try/catch around R2 Promise.all introduces a new return path and increases control flow complexity. The catch-all handles R2 failures with err.constructor.name for diagnostic signal. YAGNI until R2 failures become a recurring diagnostic problem.

## Decision 5: log() returns fetch Promise

**Chosen:** Return the fetch Promise so callers CAN pass it to ctx.waitUntil().

**Rationale:** Index.js handlers are in the synchronous request path -- without ctx.waitUntil(), the isolate terminates after sending the response and the log fetch may be dropped. The `?? Promise.resolve()` pattern handles the no-op case in dev/test environments.

## Decision 6: try/catch wrapping JSON.stringify

**Chosen:** Wrap fetch+stringify in a try/catch block for infallibility.

**Rationale:** JSON.stringify can throw synchronously (circular references, BigInt). The `.catch(() => {})` on the fetch Promise only handles async rejections, not synchronous exceptions. Without the outer try/catch, a stringify failure inside capture.js's try block would cascade to the catch-all and mark a successful capture as failed. Added per reviewer consensus (security-minion, observability-minion, debugger-minion).

## Decision 7: Static reason code for scheme rejections

**Chosen:** Use `'url_scheme_not_allowed'` instead of `result.detail` for scheme rejection SSRF events.

**Rationale:** The scheme rejection message includes `parsed.protocol` which is attacker-supplied input. While the protocol value is from a small set and normalized by URL constructor, it is not a predetermined static string. All other validateUrl() detail strings are genuine static text. Using a static reason code for the scheme case specifically eliminates the log injection vector.

## Decision 8: Coralogix region EU2

**Chosen:** `https://ingress.eu2.coralogix.com/logs/v1/singles`

**Rationale:** The Coralogix account is provisioned in EU2/Stockholm. The synthesis originally used EU1 -- caught by 4/6 reviewers in Phase 3.5 and corrected before execution.
