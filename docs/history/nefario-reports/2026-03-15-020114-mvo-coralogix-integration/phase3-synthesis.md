## Delegation Plan

**Team name**: mvo-coralogix-observability
**Description**: Add minimum viable observability to WRL: a single `log()` helper function shipped to Coralogix in real time, with structured logging at every capture pipeline failure/success and every security rejection point. No new dependencies.

---

### Conflict Resolutions

**Conflict 1: Hashed client IP vs. skip IP for MVP**

- security-minion recommends HMAC-SHA256 of CF-Connecting-IP with a daily-rotating key derived from a secret, to enable brute-force correlation while maintaining GDPR compliance.
- observability-minion did not address IP at all.
- **Resolution: Skip IP logging entirely for MVP.** The HMAC approach requires either a dedicated `LOG_HMAC_KEY` secret (more secrets to manage) or repurposing `CAPTURE_API_KEY` as HKDF input (mixing concerns). It also requires `crypto.subtle.sign()` which is async -- incompatible with the synchronous `log()` helper design. The rate limiters already key on CF-Connecting-IP for enforcement; adding it to logs is a debugging convenience, not a must-have. Add to backlog as [should] with the HMAC design from security-minion's contribution. The `reason` field alone is sufficient for MVP alerting and dashboarding.

**Conflict 2: How many security event types to log (3 vs. 10)**

- The issue scope names 3: auth failures, SSRF blocks, rate limit hits.
- security-minion identifies 7 additional rejection points (Content-Type 415, malformed JSON 400, missing URL field 400, unmatched route 404, service misconfiguration 503, verify rate limit 429, global capacity 503).
- **Resolution: Log 6 total -- the 3 from the issue plus 3 high-value additions.** Include: (1) auth failure, (2) SSRF block, (3) capture rate limit (per-IP), (4) global capacity limit (503), (5) verify rate limit, (6) signing-key rate limit. These are the rejection points that have existing rate limiters or represent security boundaries. Exclude for MVP: Content-Type 415, malformed JSON 400, missing URL 400, unmatched route 404. These are input validation failures with high noise and low security signal. The 404 path in particular has no rate limiter (security-minion flagged this), so logging every 404 creates unbounded log volume under scanning attacks. Add the excluded events to backlog as [consider].

**Conflict 3: Whether to log the target URL in capture events**

- debugger-minion includes `url` in capture event fields.
- security-minion says never log the target URL (user-supplied, may contain credentials/tokens in path segments).
- observability-minion omits URL from the schema entirely.
- **Resolution: Do not log the URL.** The captureId is the correlation key for capture events. The URL is stored in KV and can be looked up when investigating a specific capture. Including it in every log entry adds bytes, creates information disclosure risk, and provides no querying benefit that captureId doesn't already serve.

**Conflict 4: Whether to refactor auth.js to return a reason code**

- debugger-minion recommends adding a reason code to `verifyApiKey()` return value to distinguish "missing header" / "wrong scheme" / "invalid key" / "misconfigured."
- **Resolution: Skip for MVP.** This requires modifying `auth.js` and its tests -- scope creep for an observability task. Log the HTTP status from `auth.response.status` instead: 503 (misconfigured) vs 401 (all auth failures). This provides minimal discrimination without touching the auth module. Add reason-code refactor to backlog as [consider].

**Conflict 5: Whether to wrap R2 Promise.all in its own try/catch**

- observability-minion recommends wrapping lines 110-119 in a dedicated try/catch for stage-level R2 failure granularity.
- debugger-minion suggests either a dedicated try/catch or enriching the catch-all to distinguish R2 failures.
- **Resolution: Do not add a dedicated R2 try/catch.** The catch-all at line 157 already handles R2 failures. Adding a try/catch around R2 introduces a new return path and increases the complexity of the control flow. For MVP, the catch-all log with stage `catch_all` is sufficient. The error class name (`err.constructor.name`) can help distinguish R2 errors from other unexpected errors. If R2 failures become a diagnostic problem, add the dedicated try/catch later. This is YAGNI.

**Conflict 6: Whether `log()` should return the fetch Promise**

- observability-minion's revised design returns the fetch Promise so callers CAN pass it to `ctx.waitUntil()`.
- debugger-minion's concern about infallibility suggests the function should be as simple as possible.
- **Resolution: Return the fetch Promise.** This is the right design. The function remains simple (return + catch), and callers in `index.js` can use `ctx.waitUntil(log(...) ?? Promise.resolve())` to guarantee delivery of security events. In `capture.js`, the outer `ctx.waitUntil` already keeps the isolate alive. The `?? Promise.resolve()` handles the guard clause no-op case.

**Conflict 7: Whether to log `err.constructor.name` vs. nothing in catch-all**

- debugger-minion recommends `err.constructor.name` (safe, reveals error class without leaking message content).
- security-minion says never log error messages/details from R2/KV operations.
- **Resolution: Log `err.constructor.name` in catch-all only.** Error class names (e.g., `TypeError`, `RangeError`) are not secrets. They provide essential diagnostic signal for the catch-all path which is otherwise a black box. This is a reasonable trade-off between debuggability and information disclosure.

**Conflict 8: Debugger-minion's recommendation to add warn log for header fetch failure (line 106)**

- debugger-minion recommends adding a warn-level log when `headerResult.status === 'rejected'`.
- This is a silent fallback (headers are optional) that currently has no observability.
- **Resolution: Include it.** One line, zero risk, catches systematic header fetch failures that would otherwise be invisible. Low cost, meaningful signal.

---

### Task 1: Create `src/log.js` with the `log()` helper

- **Agent**: observability-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Create the file `src/log.js` containing a single exported function `log()`.

    ## What to build

    A fire-and-forget structured log shipper for Coralogix. The function builds a
    Coralogix `/singles` envelope and fires a `fetch()` call. It must be infallible --
    a logging failure must never disrupt the capture pipeline or request handling.

    ## Implementation spec

    ```js
    /**
     * Ships a structured log entry to Coralogix. Fire-and-forget.
     * Returns the fetch Promise so callers CAN pass it to ctx.waitUntil().
     * Returns undefined (no-op) if CORALOGIX_ENDPOINT or CORALOGIX_SEND_KEY
     * is absent (local dev, tests, preview environments).
     *
     * @param {object} env Worker env bindings
     * @param {number} severity Coralogix severity: 3=info, 4=warn, 5=error
     * @param {string} subsystem Module name: "capture", "security"
     * @param {object} data Structured payload (event, captureId, stage, etc.)
     * @returns {Promise<void>|undefined}
     */
    export function log(env, severity, subsystem, data) {
      if (!env.CORALOGIX_ENDPOINT || !env.CORALOGIX_SEND_KEY) return;
      return fetch(env.CORALOGIX_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.CORALOGIX_SEND_KEY}`,
        },
        body: JSON.stringify([{
          applicationName: 'wrl',
          subsystemName: subsystem,
          severity,
          timestamp: Date.now(),
          text: JSON.stringify(data),
        }]),
      }).catch(() => {});
    }
    ```

    ## Key constraints

    - MUST be under 30 lines of code (excluding JSDoc and blank lines). The
      implementation above is ~15 lines.
    - MUST return the fetch Promise (or undefined for no-op). This allows callers
      to pass it to `ctx.waitUntil()` for guaranteed delivery.
    - MUST swallow all errors via `.catch(() => {})`. A log failure must never
      propagate.
    - MUST guard on both `CORALOGIX_ENDPOINT` and `CORALOGIX_SEND_KEY`. When
      either is absent, return undefined immediately.
    - MUST use `applicationName: 'wrl'` (matches wrangler.toml `name` field).
    - MUST use `Date.now()` for timestamp (millisecond epoch, Coralogix native format).
    - MUST stringify `data` into the `text` field (Coralogix auto-parses JSON in text).
    - MUST wrap the payload in an array (Coralogix `/singles` endpoint expects `[{...}]`).
    - No external dependencies. Uses only `fetch` and `JSON.stringify`.
    - No batching. One entry per call. Simplicity over throughput.
    - No async/await. The function is synchronous; it returns a Promise from fetch.
    - Include `// tva` near the top of the file (e.g., after the JSDoc block).

    ## What NOT to do

    - Do not add batching, buffering, or queueing logic.
    - Do not add retry logic.
    - Do not add a `console.log()` fallback.
    - Do not add TypeScript types or type checking.
    - Do not create any additional helper functions or classes.
    - Do not validate the `data` parameter -- callers are responsible for constructing correct payloads.

- **Deliverables**: `src/log.js` -- single exported function, ~15 lines of code
- **Success criteria**: Function is under 30 lines of code, has no external dependencies, guards on missing env vars, returns fetch Promise or undefined, swallows errors silently.

### Task 2: Write tests for `src/log.js`

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Create the file `test/log.test.js` containing tests for the `log()` function
    from `src/log.js`.

    ## Test environment

    This project uses vitest with `@cloudflare/vitest-pool-workers`. Tests run in
    the Cloudflare Workers runtime (workerd) via miniflare. The test config is in
    `vitest.config.js`.

    **Important**: The test environment does NOT set `CORALOGIX_ENDPOINT` or
    `CORALOGIX_SEND_KEY` in vitest.config.js bindings. The `log()` function guards
    on these and returns undefined when absent. To test the fetch behavior, you need
    to create a mock env object WITH these values and use `fetchMock` from
    `cloudflare:test` to intercept the outbound fetch.

    Look at `test/capture.test.js` for the fetchMock pattern:
    ```js
    import { fetchMock } from 'cloudflare:test';
    beforeEach(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
    afterEach(() => { fetchMock.deactivate(); });
    ```

    For the log tests, intercept calls to the Coralogix endpoint:
    ```js
    const MOCK_ENDPOINT = 'https://ingress.test.coralogix.com/logs/v1/singles';
    const mockEnv = {
      CORALOGIX_ENDPOINT: MOCK_ENDPOINT,
      CORALOGIX_SEND_KEY: 'test-send-key',
    };

    fetchMock.get('https://ingress.test.coralogix.com')
      .intercept({ path: '/logs/v1/singles', method: 'POST' })
      .reply(200, 'ok');
    ```

    ## Required test cases

    1. **No-op when CORALOGIX_ENDPOINT is missing**: Call `log({}, 3, 'test', { event: 'test' })`.
       Assert it returns `undefined`. Assert no fetch was called.

    2. **No-op when CORALOGIX_SEND_KEY is missing**: Call `log({ CORALOGIX_ENDPOINT: 'https://example.com' }, 3, 'test', { event: 'test' })`.
       Assert it returns `undefined`.

    3. **Sends correct Coralogix payload structure**: Call `log(mockEnv, 3, 'capture', { event: 'capture.success', captureId: 'cap_abc' })`.
       Intercept the fetch and verify:
       - Method is POST
       - Content-Type header is `application/json`
       - Authorization header is `Bearer test-send-key`
       - Body is a JSON array with one object
       - Object has `applicationName: 'wrl'`
       - Object has `subsystemName: 'capture'`
       - Object has `severity: 3`
       - Object has a `timestamp` that is a number
       - Object has a `text` field that is a JSON string
       - Parsing `text` gives `{ event: 'capture.success', captureId: 'cap_abc' }`

    4. **Severity levels propagate correctly**: Test with severity 4 (warn) and 5 (error).
       Verify the severity value in the payload matches.

    5. **Swallows fetch errors silently**: Mock fetch to reject (use `fetchMock` replyWithError).
       Call `log(mockEnv, 5, 'capture', { event: 'capture.fail' })`.
       Assert the returned promise resolves (does not reject). No error should propagate.

    6. **Returns a Promise when env vars are present**: Call `log(mockEnv, 3, 'test', {})`.
       Assert the return value is a Promise (or at least truthy / thenable).

    ## Style

    Follow the existing test file patterns (see `test/auth.test.js`, `test/capture.test.js`):
    - Import from `cloudflare:test` and `vitest`
    - Use `describe`/`it` blocks
    - Use `expect()` assertions
    - Keep tests focused -- one assertion concept per test

    ## What NOT to do

    - Do not add `CORALOGIX_ENDPOINT` or `CORALOGIX_SEND_KEY` to vitest.config.js.
    - Do not install any new dependencies.
    - Do not test internal implementation details beyond the public API.
    - Do not test Coralogix endpoint responses (we only care that fetch was called correctly).

- **Deliverables**: `test/log.test.js` -- 6+ test cases for the log helper
- **Success criteria**: All tests pass. Tests verify: guard clause no-ops, correct payload structure, error swallowing, Promise return.

### Task 3: Add `CORALOGIX_ENDPOINT` to wrangler.toml

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Add the Coralogix endpoint configuration to `wrangler.toml`.

    ## What to do

    Add a `[vars]` section to `wrangler.toml` with `CORALOGIX_ENDPOINT`. Place it
    after the `[browser]` section (end of file).

    ```toml
    [vars]
    CORALOGIX_ENDPOINT = "https://ingress.eu1.coralogix.com/logs/v1/singles"
    ```

    Add a comment above noting that `CORALOGIX_SEND_KEY` must be set via
    `wrangler secret put CORALOGIX_SEND_KEY`:

    ```toml
    # Observability: Coralogix log ingestion
    # CORALOGIX_SEND_KEY must be set via: wrangler secret put CORALOGIX_SEND_KEY
    [vars]
    CORALOGIX_ENDPOINT = "https://ingress.eu1.coralogix.com/logs/v1/singles"
    ```

    ## Context

    - The EU1 region is the default. The endpoint URL is configurable per
      environment via wrangler.toml vars -- no code change needed if the account
      moves regions.
    - The Send Key is a write-only API key (can push logs but cannot query/delete).
      It must be stored as a secret, never in wrangler.toml.
    - The existing wrangler.toml has no `[vars]` section yet.

    ## What NOT to do

    - Do not add `CORALOGIX_SEND_KEY` to wrangler.toml (it is a secret).
    - Do not modify any other sections of wrangler.toml.
    - Do not add preview/staging environment overrides.

- **Deliverables**: Modified `wrangler.toml` with `[vars]` section
- **Success criteria**: `CORALOGIX_ENDPOINT` is set as a `[vars]` entry. Comment documents that `CORALOGIX_SEND_KEY` requires `wrangler secret put`.

### Task 4: Instrument `src/capture.js` pipeline stages

- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Add structured log calls to `src/capture.js` at every pipeline outcome path.

    ## What to do

    Import the `log` function and add calls at each of the 6 outcome paths
    described below. Also add a `const start = Date.now()` at the top of
    `performCapture()` for duration measurement.

    Add this import at the top of the file:
    ```js
    import { log } from './log.js';
    ```

    Add this as the first line inside `performCapture()`:
    ```js
    const start = Date.now();
    ```

    ### Path 1: Renderer rejection (after line 100, before failCapture)

    ```js
    if (renderResult.status === 'rejected') {
      const { message, retryable } = categorizeError(renderResult.reason);
      log(env, 5, 'capture', { event: 'capture.stage.fail', captureId, stage: 'browser_render', errorCategory: message, retryable });
      await failCapture(env.KV, captureId, message, retryable);
      return;
    }
    ```

    Severity: 5 (error). Log BEFORE `failCapture()` so the log is recorded even
    if KV write fails. Use the sanitized output of `categorizeError()` -- never
    the raw error.

    ### Path 2: Header fetch failure (after line 106, when headerResult is rejected)

    Add a warn-level log when the header fetch fails silently:

    ```js
    const headers = headerResult.status === 'fulfilled' ? headerResult.value : null;
    if (!headers) {
      log(env, 4, 'capture', { event: 'capture.header_fail', captureId });
    }
    ```

    Severity: 4 (warn). Headers are optional; this is graceful degradation.
    This catches systematic header fetch failures that are currently invisible.

    ### Path 3: WACZ bundling failure (replace console.warn at line 153)

    Replace the existing `console.warn(...)` with a structured log. Do NOT keep
    both -- replace, not supplement:

    ```js
    } catch (err) {
      log(env, 4, 'capture', { event: 'capture.wacz_fail', captureId });
    }
    ```

    Severity: 4 (warn). WACZ failure is graceful degradation, not an error.
    Do NOT log `err.message` or `err.stack` (may contain signing key paths
    or internal details). Do NOT log `err.constructor.name` here -- the WACZ
    path has too many internal modules (signing, WARC, CDXJ, ZIP) whose error
    classes could leak implementation details.

    ### Path 4: Capture success (after completeCapture at line 156)

    ```js
    await completeCapture(env.KV, captureId, artifacts, waczInfo);
    log(env, 3, 'capture', {
      event: 'capture.success',
      captureId,
      durationMs: Date.now() - start,
      waczStatus: waczInfo ? 'ok' : 'skipped',
      bundleSize: waczInfo?.size ?? 0,
    });
    ```

    Severity: 3 (info). Log AFTER `completeCapture()` -- only log success once
    KV has confirmed persistence. If `completeCapture()` throws, this line never
    executes and the catch-all handles it (correct behavior).

    ### Path 5: Catch-all original error (before failCapture at line 160)

    Add a log call BEFORE `failCapture()` in the catch-all:

    ```js
    } catch (err) {
      log(env, 5, 'capture', { event: 'capture.fail', captureId, stage: 'catch_all', errorClass: err?.constructor?.name });
      try {
        await failCapture(env.KV, captureId, 'Capture could not be completed', true);
      } catch { /* KV write failed -- nothing more we can do */ }
    }
    ```

    Severity: 5 (error). Log `err.constructor.name` to distinguish error types
    (e.g., `TypeError` vs `RangeError`) without leaking `err.message`.

    ### Path 6: Catch-all KV write failure (inside inner catch at line 161)

    Add a log in the previously empty `catch {}`:

    ```js
      } catch {
        log(env, 5, 'capture', { event: 'capture.kv_fail', captureId });
      }
    ```

    Severity: 5 (error). This is the "black hole" case: original operation failed
    AND KV status update failed. Without this log, the capture stays `pending`
    until TTL expiry with zero observability.

    ## Security constraints (from security-minion)

    - NEVER log the target URL in any capture event. The `captureId` is the
      correlation key.
    - NEVER log `err.message` or `err.stack` from errors originating in R2, KV,
      browser rendering, or signing operations.
    - The `categorizeError()` output IS safe to log (designed for user-facing messages).
    - Do NOT log `err.constructor.name` for WACZ errors (too many internal modules).
      Only use it in the catch-all (Path 5) where the error source is ambiguous.

    ## What NOT to do

    - Do not add a try/catch around the R2 `Promise.all` (lines 110-119). The
      catch-all handles R2 failures. Adding granularity is deferred.
    - Do not modify `categorizeError()`.
    - Do not modify `captureHeaders()`.
    - Do not add any new imports beyond `log`.
    - Do not change the existing control flow or error handling structure.
    - Do not log the target URL.

- **Deliverables**: Modified `src/capture.js` with 6 log calls and a duration timer
- **Success criteria**: Every pipeline outcome (render fail, header fail, R2/catch-all fail, WACZ fail, KV fail, success) emits a structured log. `console.warn` is replaced (not duplicated). No target URLs in logs.

### Task 5: Instrument `src/index.js` security events

- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Add structured security event log calls to `src/index.js` at 6 rejection points.

    ## What to do

    Import the `log` function and add calls at each security rejection point.
    Use `ctx.waitUntil(log(...) ?? Promise.resolve())` to guarantee delivery
    without blocking the response.

    Add this import at the top of the file:
    ```js
    import { log } from './log.js';
    ```

    ### Event 1: Auth failure (line 70, `handleCreateCapture`)

    After `if (!auth.ok)`, before returning `auth.response`:

    ```js
    if (!auth.ok) {
      ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', status: auth.response.status }) ?? Promise.resolve());
      return auth.response;
    }
    ```

    Severity: 5 (error). Log the HTTP status (503 for misconfigured, 401 for
    all auth failures). Do NOT log the API key, auth header, or any portion thereof.
    Do NOT log the request path or CF-Connecting-IP.

    ### Event 2: Per-IP capture rate limit (line 77, `handleCreateCapture`)

    After `if (!success)`:

    ```js
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'capture_per_ip' }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
    ```

    Severity: 4 (warn). Rate limits are capacity protection, not security incidents.

    ### Event 3: Global capacity limit (line 83, `handleCreateCapture`)

    After `if (!success)`:

    ```js
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit' }) ?? Promise.resolve());
      return problemResponse(503, 'Service is at capacity. Retry in 10 seconds.', { 'Retry-After': '10' });
    }
    ```

    Severity: 4 (warn). Service-wide overload signal.

    ### Event 4: SSRF block (line 104, `handleCreateCapture`)

    After `if (!result.ok)`:

    ```js
    if (!result.ok) {
      ctx.waitUntil(log(env, 5, 'security', { event: 'security.ssrf_block', reason: result.detail }) ?? Promise.resolve());
      return problemResponse(result.status, result.detail);
    }
    ```

    Severity: 5 (error). Log the `result.detail` from `validateUrl()` as the
    reason -- this is safe because `validateUrl()` returns static rejection
    messages (never includes the actual URL, hostname, or resolved IP). The
    detail strings are enumerated in `url-validation.js` and all are
    predetermined strings like "Host resolves to a private IP address".

    One exception: the scheme rejection includes `parsed.protocol` in the
    message (`"URL scheme 'ftp' is not allowed"`). The scheme is not sensitive --
    it is from a small fixed set and safe to log.

    ### Event 5: Verify rate limit (line 243, `handleVerifyCapture`)

    After `if (!success)`:

    ```js
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'verify' }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
    ```

    Severity: 4 (warn). Verify endpoint is public/unauthenticated -- rate limit
    hits may indicate capture ID brute-forcing.

    ### Event 6: Signing key rate limit (line 318, `handleGetSigningKey`)

    After `if (!success)`:

    ```js
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'signing_key' }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
    ```

    Severity: 4 (warn).

    ## Accessing `ctx` in handlers

    All handlers receive `(request, env, ctx, match)` as parameters. `ctx` is
    available in all handler functions. However, `handleGetSigningKey` currently
    has the signature `async function handleGetSigningKey(request, env)` -- it
    does not destructure `ctx`. You will need to add `ctx` to its parameter list:
    change `async function handleGetSigningKey(request, env)` to
    `async function handleGetSigningKey(request, env, ctx)`.

    Note: `handleVerifyCapture` already receives `ctx` in its parameter list.

    ## The `ctx.waitUntil(log(...) ?? Promise.resolve())` pattern

    - `log()` returns a Promise when env vars are present, or undefined when absent.
    - `ctx.waitUntil()` requires a Promise argument.
    - `?? Promise.resolve()` handles the undefined case (dev/test environments).
    - This guarantees the fetch completes even after the response is sent.

    ## Security constraints

    - NEVER log CF-Connecting-IP (raw or hashed). Deferred to post-MVP.
    - NEVER log request paths, URLs, or user-supplied content.
    - NEVER log API keys, auth headers, or any portion thereof.
    - Use only static reason codes or `result.detail` from validateUrl (known safe).
    - Use the `limiter` field to distinguish rate limit sources.

    ## What NOT to do

    - Do not log Content-Type rejections (415), malformed JSON (400), missing
      URL field (400), or unmatched routes (404). These are deferred to backlog.
    - Do not modify `verifyApiKey()` or any function in `auth.js`.
    - Do not add IP hashing or any crypto operations.
    - Do not add new rate limiters.
    - Do not change any existing response messages or status codes.
    - Do not log in the main `fetch()` handler or non-rejection paths.

- **Deliverables**: Modified `src/index.js` with 6 security event log calls
- **Success criteria**: Auth failures, SSRF blocks, and all rate limit hits emit structured logs. `ctx.waitUntil` wrapping ensures delivery. No sensitive data in log payloads.

### Task 6: Update backlog

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 4, Task 5
- **Approval gate**: no
- **Prompt**: |
    Update `docs/backlog.md` to reflect the observability work done and items deferred.

    ## What to do

    ### 1. Update the existing structured logging item

    Change:
    ```
    - [should] Structured logging -- "add when debugging becomes painful" (iac-minion, kickoff)
    ```

    To:
    ```
    - ~~[should] Structured logging~~ -- DONE (mvo-coralogix): log() helper ships structured JSON to Coralogix at every pipeline outcome and security rejection point
    ```

    ### 2. Update the existing security monitoring item

    Change:
    ```
    - [should] Security monitoring and alerting -- log SSRF blocks, auth failures, rate limit hits; alert on anomalous patterns (security-minion, kickoff)
    ```

    To:
    ```
    - [should] ~~Security event logging~~ -- PARTIAL (mvo-coralogix): auth failures, SSRF blocks, and rate limit hits logged to Coralogix; alerting rules and dashboards still needed (security-minion, kickoff)
    ```

    ### 3. Add new deferred items to the Operations section

    Add after the updated structured logging entry:

    ```
    - [should] Hashed IP logging -- HMAC-SHA256 of CF-Connecting-IP with daily-rotating key for brute-force correlation; design from security-minion ready for implementation (security-minion, mvo-coralogix)
    - [consider] Additional security event types -- Content-Type 415, malformed JSON 400, missing URL 400, unmatched route 404 rejections; low signal-to-noise for MVP (security-minion, mvo-coralogix)
    - [consider] Auth reason codes -- refactor verifyApiKey() to return reason discriminant (missing_header, wrong_scheme, invalid_key, misconfigured); enables finer-grained auth failure logging (debugger-minion, mvo-coralogix)
    - [consider] R2 write try/catch granularity -- dedicated catch block around R2 Promise.all for stage-level failure logging; catch-all sufficient for MVP (observability-minion, mvo-coralogix)
    - [consider] 404 rate limiting -- unmatched routes have no rate limiter; potential log volume amplification vector under scanning attacks (security-minion, mvo-coralogix)
    - [consider] Coralogix alerting rules -- severity-based alerts, log volume anomaly detection, SSRF spike dashboards (observability-minion, mvo-coralogix)
    ```

    ### 4. Add new deferred item to Security section

    Add after the existing security items:

    ```
    - [consider] Coralogix Send Key IP allowlisting -- restrict to Cloudflare Worker egress IPs; reduces blast radius of key leak to log injection (security-minion, mvo-coralogix)
    ```

    ## What NOT to do

    - Do not rewrite existing items that are unrelated to this phase.
    - Do not change tier assignments ([must], [should], [consider]) for existing items.
    - Do not remove any existing items.

- **Deliverables**: Modified `docs/backlog.md` with items marked done, added deferrals
- **Success criteria**: Structured logging marked done. Security monitoring marked partial. 7 new deferred items added with source attribution.

### Task 7: Run full test suite

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2, Task 3, Task 4, Task 5
- **Approval gate**: no
- **Prompt**: |
    Run the full test suite and verify all tests pass.

    ## What to do

    Run `npm test` from the project root (`/Users/ben/github/benpeter/web-resource-ledger`).

    The project has 17 existing test files plus the new `test/log.test.js`.
    All must pass.

    ## Potential issues

    1. **Unmocked fetch calls**: If `capture.test.js` tests now trigger `log()` calls
       that attempt to fetch Coralogix, they will fail because `fetchMock.disableNetConnect()`
       blocks outbound requests. This should NOT happen because the test environment
       does not set `CORALOGIX_ENDPOINT` or `CORALOGIX_SEND_KEY` in vitest.config.js,
       so `log()` returns immediately (guard clause). If tests fail for this reason,
       the guard clause is not working correctly -- investigate `src/log.js`.

    2. **Integration tests**: `test/capture-integration.test.js` and
       `test/verify-integration.test.js` exercise end-to-end flows. They should
       pass because they also use the miniflare environment without Coralogix vars.

    3. **New log.test.js failures**: If any of the new tests fail, fix them.

    ## What to do if tests fail

    - Read the error output carefully.
    - If a failure is caused by the changes in this phase (Tasks 1-5), fix the
      issue in the relevant file.
    - If a failure is pre-existing (unrelated to this phase), report it but do
      not fix it.

    ## What NOT to do

    - Do not modify vitest.config.js to add Coralogix env vars.
    - Do not skip or disable any tests.

- **Deliverables**: All tests passing (green output)
- **Success criteria**: `npm test` exits with code 0. All 18 test files pass.

---

### Cross-Cutting Coverage

- **Testing**: Task 2 (log helper tests) and Task 7 (full suite verification). Phase 6 post-execution will also run the full suite.
- **Security**: Task 5 (security event instrumentation) incorporates security-minion's recommendations. Security-minion participates in Phase 3.5 architecture review.
- **Usability -- Strategy**: No user-facing interface changes. ux-strategy-minion reviews at Phase 3.5 to confirm observability does not affect user-facing behavior or latency.
- **Usability -- Design**: Not applicable -- no UI changes. Excluded.
- **Documentation**: Task 6 updates the backlog. Phase 8 post-execution handles any remaining documentation needs.
- **Observability**: This IS the observability task. observability-minion's recommendations are directly implemented in Tasks 1, 4, and 5.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: This plan implements observability infrastructure -- the observability specialist should verify the schema, severity mappings, and Coralogix integration pattern are correct before code is written. References Tasks 1, 4, 5.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, user-docs-minion

### Risks and Mitigations

1. **Log function throws inside capture pipeline try block** (HIGH from debugger-minion).
   If `log()` throws, it cascades to the catch-all and marks a successful capture as failed.
   **Mitigation**: `log()` returns a `fetch().catch(() => {})` -- the `.catch(() => {})` swallows
   rejections. But `JSON.stringify()` can throw on circular references. In practice, all data
   objects are plain literals, but this is tested explicitly in Task 2 test case 5. Additionally,
   `fetch()` itself does not throw synchronously in Workers. Risk is LOW after mitigation.

2. **Coralogix endpoint misconfiguration causes silent data loss** (MEDIUM from observability-minion).
   Wrong URL or invalid key = all logs silently dropped. Inherent to fire-and-forget design.
   **Mitigation**: Acceptable for MVP. Operator must verify Coralogix receives logs after deployment.
   Future: health check endpoint. Added to backlog.

3. **Log volume under attack** (MEDIUM from security-minion and debugger-minion).
   Thousands of auth failures or rate limit hits generate thousands of log entries.
   **Mitigation**: Existing rate limiters cap per-IP event rate. The excluded 404 path (no rate limiter)
   is intentionally not instrumented for MVP. Coralogix TCO Optimizer can tier high-volume
   security events to archive. Added to backlog.

4. **Legacy Coralogix endpoint deprecation March 2026** (MEDIUM from observability-minion).
   **Mitigation**: The `CORALOGIX_ENDPOINT` var in wrangler.toml uses the new regional format
   (`ingress.eu1.coralogix.com`). No legacy URLs in the implementation.

5. **Security events in index.js may be dropped without ctx.waitUntil** (LOW from observability-minion).
   **Mitigation**: All security event log calls use `ctx.waitUntil(log(...) ?? Promise.resolve())`.
   `handleGetSigningKey` needs `ctx` added to its parameter list (covered in Task 5 instructions).

### Execution Order

```
Batch 1 (parallel):
  Task 1: Create src/log.js
  Task 3: Add CORALOGIX_ENDPOINT to wrangler.toml

Batch 2 (parallel, blocked by Task 1):
  Task 2: Write tests for log.js
  Task 4: Instrument capture.js
  Task 5: Instrument index.js

Batch 3 (blocked by Tasks 2, 3, 4, 5):
  Task 7: Run full test suite

Batch 4 (blocked by Tasks 4, 5):
  Task 6: Update backlog
```

No approval gates in this plan. All tasks are additive code (easy to reverse) with
low blast radius. The log helper is self-contained, the instrumentation follows
deterministic specs, and the wrangler.toml change is a single var addition.

### Verification Steps

1. `npm test` passes with all 18 test files green (Task 7).
2. `src/log.js` is under 30 lines of code (excluding JSDoc).
3. `src/capture.js` has zero `console.warn` calls (replaced by structured log).
4. `src/capture.js` has log calls at all 6 outcome paths.
5. `src/index.js` has log calls at 6 rejection points, all wrapped in `ctx.waitUntil`.
6. `wrangler.toml` has `CORALOGIX_ENDPOINT` in `[vars]` section.
7. No target URLs, IP addresses, API keys, or capture IDs appear in security event log payloads.
8. No new entries in `package.json` dependencies or devDependencies.
9. `docs/backlog.md` has structured logging marked done and 7 new deferred items.
