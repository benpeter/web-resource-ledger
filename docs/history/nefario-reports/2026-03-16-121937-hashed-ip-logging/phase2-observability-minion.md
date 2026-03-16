## Domain Plan Contribution: observability-minion

### Recommendations

#### 1. Raw error logging (Issue #52): Flat fields, not nested objects

**Use flat top-level fields `errorName` and `errorMessage`**, not a nested `rawError` object.

Rationale:
- The existing schema is entirely flat. Every log payload is `{ event, captureId, tenantId, stage, errorCategory, retryable, ... }`. Introducing a nested object (`rawError: { name, message }`) breaks the schema pattern and creates a Coralogix query mismatch -- you'd need `rawError.name` dot-notation in Lucene queries instead of the simpler `errorName:TimeoutError` that matches the existing `errorCategory:*` and `errorClass:*` patterns.
- Coralogix parses the `text` field as JSON. Flat fields become top-level keys in the parsed document, which means direct column access in DataPrime queries and straightforward Lucene filters. Nested objects require explicit JSON parsing rules or dot-notation access, adding friction for on-call engineers.
- The existing codebase already uses `errorClass` (in `capture.fail` and `list.error` events) and `errorCategory` (in `capture.stage.fail`). Adding `errorName` and `errorMessage` extends this pattern consistently.

**Specific field mapping:**

| Log event | Current fields | Add |
|-----------|---------------|-----|
| `capture.stage.fail` (line 104) | `errorCategory`, `retryable` | `errorName` (from `error.name`), `errorMessage` (from `error.message`, truncated) |
| `capture.fail` catch-all (line 182) | `errorClass` | `errorMessage` (from `err.message`, truncated) |

**On the invariant ("no attacker-controlled input"):**

Playwright error messages are framework-generated strings, not user input. They come from Chromium's internal error reporting (timeout messages, navigation failures, session lifecycle errors). However, some edge cases can include fragments of the target URL in the message (e.g., `"Navigation to https://evil.example.com failed"`). The target URL is already validated by `validateUrl()` before it reaches the renderer, so it is constrained but not fully operator-controlled.

Recommendation: **Truncate `errorMessage` to 256 characters**. This is sufficient for every known Playwright error pattern while bounding any unexpected content. The truncation also protects against a future Playwright version that includes more verbose messages. No sanitization (escaping, regex filtering) is needed because the value goes into a JSON string field via `JSON.stringify()` -- there is no injection vector in the Coralogix ingestion path.

Add a one-line comment at the truncation site referencing the invariant, so future contributors understand why.

#### 2. Hashed IP field: Top-level in every log entry, named `cip`

**Add `cip` (client IP hash) as a top-level field in every log entry, injected by the `log()` function itself.**

Rationale for every entry (not selective):
- The primary use case is abuse correlation: "show me all log entries from the same client within a day." If `cip` only appears on security events, you cannot correlate a `security.rate_limit` event with the `capture.success` that preceded it from the same IP. The correlation value comes from the hash being present everywhere.
- The cost is negligible: one 64-character hex string per log entry. At WRL's current volume this adds maybe 70 bytes per log line. Coralogix indexes it as a string field -- no cardinality concern because the daily rotation bounds the total unique values.

**Field name: `cip`**

- Short (saves bytes on every log entry, matters at scale)
- Unambiguous: "client IP" is the standard term in CDN/edge contexts (Cloudflare uses `CF-Connecting-IP` which is the client IP)
- Does not suggest it contains the raw IP (unlike `ipHash` or `hashedIp` which invite the question "where's the unhashed version?")
- `clientHash` is vague -- hash of what? The IP? A session? A fingerprint?

**Injection point: modify `log()` to accept an optional `cip` parameter, or better, pass it through the `data` object from callers.**

However, looking at the call sites: `log()` is called from both `capture.js` (where `ip` is available as a function parameter) and `index.js` (where `CF-Connecting-IP` is available from the request). The cleanest approach is:

1. Compute `cip` once per request in `index.js` (where `CF-Connecting-IP` is read)
2. Pass it through to `performCapture()` and include it in every `log()` call's data object
3. For log calls directly in `index.js` (security events), include `cip` directly

This keeps `log()` itself unchanged (it remains a generic structured log shipper with no knowledge of IP hashing) and keeps the hashing logic in one place.

**Why not inject `cip` inside `log()` itself:** The `log()` function has no access to the request object or the IP. Changing its signature to accept a request would be a larger refactor. The function's current design (env + severity + subsystem + data) is clean and should stay that way.

#### 3. HMAC key derivation and rotation

The daily rotation scheme (HMAC-SHA256 with key = `date + secret_seed`) is sound for the stated purpose. Observability considerations:

- **The `IP_HASH_SEED` secret must be a Wrangler secret** (`wrangler secret put IP_HASH_SEED`), not a `[vars]` entry. It must never appear in logs.
- **Log the date component of the key derivation** (not the seed): include a field like `cipDay` in the first log entry of a request cycle, or better, don't log it at all -- the `timestamp` field already tells you which day's key was used. Anyone correlating can derive the same day from the timestamp. Adding `cipDay` is redundant.
- **Do NOT log `cip` as empty/null when `IP_HASH_SEED` is missing** (local dev, tests). Either omit the field entirely or use a static placeholder like `"disabled"`. Null fields in Coralogix create filter confusion (`cip:*` would exclude these entries unexpectedly).

#### 4. Coralogix indexing impact

- `cip` as a string field will be automatically indexed by Coralogix's Streama pipeline. No parsing rules needed -- it lives inside the JSON `text` field which is already parsed.
- `errorName` and `errorMessage` will similarly be auto-indexed as string fields.
- **No cardinality risk**: `cip` is bounded by (unique IPs per day) which is tiny for a single-tenant service. `errorName` has maybe 5-10 distinct values. `errorMessage` could have higher cardinality (URL fragments vary), but since it is not a label/tag (it's a log field), this does not affect metric cardinality -- only log storage, which is negligible.
- **Querying**: After deployment, the recommended Coralogix queries for abuse investigation:
  - `cip:"<hash>" AND event:*` -- all activity from one client in one day
  - `errorName:TimeoutError` -- all timeout errors across all captures
  - `errorMessage:*session*` -- all session-related errors (fuzzy)

#### 5. Error pattern expansion (Issue #52)

The `categorizeError()` function currently covers timeout, subresource limit, size limit, page/browser crash, navigation failure, and session pool exhaustion. Issue #52 asks to add patterns for common Playwright session errors.

From an observability perspective, the key requirement is: **the categorized message (user-facing) and the raw error details (operator-facing) must both be present in the same log entry.** This means the `categorizeError()` function should return its existing `{ message, retryable }` tuple, and the caller should add `errorName` and `errorMessage` from the original error. Do NOT put raw error details into the `categorizeError()` return value -- keep the function focused on classification.

New patterns to add (based on common Cloudflare Workers Browser Rendering session errors):
- `"Session expired"` / `"session has been closed"` -- browser keep_alive expired between acquire and use
- `"Protocol error"` -- CDP protocol breakdown, typically after browser crash
- `"Connection refused"` / `"ECONNREFUSED"` -- browser process died

All of these should map to `retryable: true` since they represent transient infrastructure state.

### Proposed Tasks

**Task 1: Add `cip` computation to request handling** (index.js)
- Create a function `computeCip(ip, seed)` that returns HMAC-SHA256 hex digest of `ip` with key derived from `YYYY-MM-DD + seed`
- Use `crypto.subtle.importKey` + `crypto.subtle.sign` (available in Workers runtime)
- Compute once per request, pass to all log calls and to `performCapture()`
- When `IP_HASH_SEED` is not set (local dev), omit `cip` from log data entirely

**Task 2: Thread `cip` through `performCapture()` and all capture log calls** (capture.js)
- Add `cip` parameter to `performCapture()` signature (after `tenantId`)
- Include `cip` in every `log()` data object within `performCapture()`
- Include `cip` in all `log()` calls in `index.js` (security events, list events)

**Task 3: Add `errorName` and `errorMessage` to error log entries** (capture.js)
- In the `capture.stage.fail` log call (line 104): add `errorName: renderResult.reason?.name` and `errorMessage: String(renderResult.reason?.message ?? '').slice(0, 256)`
- In the `capture.fail` catch-all log call (line 182): add `errorMessage: String(err?.message ?? '').slice(0, 256)`
- Add comment referencing the log invariant at the truncation site

**Task 4: Expand `categorizeError()` patterns** (capture.js)
- Add session expiry pattern: `"Session expired"` / `"session has been closed"` -> `{ message: 'Browser session expired', retryable: true }`
- Add protocol error pattern: `"Protocol error"` -> `{ message: 'Browser protocol error', retryable: true }`
- Add connection refused pattern: `"Connection refused"` / `"ECONNREFUSED"` -> `{ message: 'Browser session unavailable', retryable: true }`

**Task 5: Add `IP_HASH_SEED` to wrangler.toml comments and staging config**
- Add comment in `wrangler.toml` noting the secret: `# IP_HASH_SEED must be set via: wrangler secret put IP_HASH_SEED`
- Document that the same seed must be set in both production and staging if cross-environment correlation is needed (likely not -- keep them independent)

**Task 6: Write tests**
- Test `computeCip()`: same IP + same day = same hash; same IP + different day = different hash; different IP + same day = different hash
- Test `computeCip()` returns undefined/omitted when seed is absent
- Test that `capture.stage.fail` log entries include `errorName`, `errorMessage`, and `cip`
- Test that `errorMessage` is truncated at 256 characters
- Test new `categorizeError()` patterns return expected messages and retryable flags

### Risks and Concerns

**Risk 1: `performCapture()` signature expansion**
Adding `cip` as a 6th positional parameter (after `tenantId`) makes the signature fragile. The function already has 6 parameters including the optional `renderer`. Consider passing an options object instead, but this would be a larger refactor that touches all call sites and tests. For this PR, a positional parameter is acceptable -- flag the signature for future cleanup in the backlog.

**Risk 2: HMAC computation adds latency to every request**
`crypto.subtle.sign` is async and involves a key import step. In the Workers runtime, this is fast (~0.1ms) but it is on the critical path before the 202 response. Mitigation: the HMAC is computed once and reused across all log calls for that request. This is acceptable. Do NOT cache the imported key across requests (Workers isolate lifetime is unpredictable and the date-based key must rotate at midnight).

**Risk 3: Playwright error messages could change across versions**
`categorizeError()` matches on string fragments (`msg.includes('...')`). If `@cloudflare/playwright` updates change error message wording, categories could fall through to the catch-all. This is an existing risk, not introduced by this change. The new `errorMessage` field actually mitigates it -- even when categorization fails, the raw message is now visible in logs for diagnosis.

**Risk 4: Clock skew at day boundary**
If a request arrives at 23:59:59.999 and a follow-up log call happens at 00:00:00.001, the HMAC key derivation could use different dates for the same request. Mitigation: compute the date string once per request (same time as computing `cip`) and pass it through. Do NOT call `new Date()` inside each log call for key derivation.

**Risk 5: `errorMessage` leaking validated-but-user-supplied URLs**
Playwright errors sometimes include the navigation URL. The URL was validated by `validateUrl()` (scheme check, SSRF prevention) but is ultimately user-supplied. With 256-char truncation, the URL domain would be visible in logs. This is acceptable for an operator-facing log field -- the URL is already stored in KV and logged in `capture.success` events. Document this explicitly in the invariant comment update.

### Additional Agents Needed

**Security specialist**: Should review the HMAC-SHA256 key derivation scheme. Specifically:
- Is `HMAC-SHA256(date_string + seed, ip)` the right construction, or should it be `HMAC-SHA256(seed, date_string + ip)` (HMAC key vs. message ordering matters)?
- Is the daily rotation window appropriate for GDPR/privacy compliance, or should it be shorter?
- Should the hash be further truncated (e.g., first 16 hex chars) to reduce correlation precision while maintaining abuse detection utility?

No other specialists needed. The implementation is straightforward Workers code -- no infrastructure provisioning (iac-minion) or API design changes (api-design-minion) required.
