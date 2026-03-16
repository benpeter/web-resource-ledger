## Delegation Plan

**Team name**: hashed-ip-logging
**Description**: Implement HMAC-SHA256 hashed IP logging for abuse correlation (#36) and fix categorizeError to surface raw Playwright error messages (#52). Combined into a single PR.

### Conflict Resolutions

1. **Field name for hashed IP**: observability-minion recommended `cip`, security-minion recommended `ipHash`. **Resolution: `cip`**. Shorter (saves bytes on every log entry), follows CDN convention, and does not invite "where's the unhashed version?" questions. The observability-minion's reasoning about query ergonomics is more relevant here -- this field will be queried thousands of times.

2. **Raw error field names**: security-minion recommended `rawError`/`rawErrorName`, observability-minion recommended `errorName`/`errorMessage`. **Resolution: `errorName`/`errorMessage`**. The existing schema already uses `errorClass` and `errorCategory` as flat top-level fields. `errorName`/`errorMessage` extends this pattern consistently. The `raw` prefix adds no information -- the field name is already distinct from `errorCategory`.

3. **Error message truncation length**: security-minion recommended 200 chars, observability-minion recommended 256 chars. **Resolution: 256 chars**. The observability-minion's reasoning is better grounded -- 256 chars covers all known Playwright error patterns while providing a clean power-of-two boundary. The difference between 200 and 256 is negligible for blast radius.

4. **HMAC key derivation**: security-minion recommended two-step derivation `daily_key = HMAC(seed, date)` then `hash = HMAC(daily_key, ip)`. iac-minion recommended single-step `HMAC(seed + date, ip)`. **Resolution: two-step derivation**. Security-minion's reasoning is correct -- the two-step pattern follows HKDF-like extract-then-expand, cleanly separates temporal component from secret material, and allows caching the daily key without re-importing the seed.

5. **Hash truncation**: security-minion suggested first 16 hex chars (64 bits), iac-minion noted collision risk is negligible at current volume. **Resolution: 16 hex chars**. At WRL's traffic volume (~hundreds/day), 64 bits gives effectively zero collision risk. Shorter hashes save log storage and are easier to copy/paste in Coralogix queries. Full 256-bit hashes are unnecessary.

6. **Where to inject `cip`**: observability-minion and security-minion both agreed: compute once per request in `index.js`, pass through to all log calls. Do NOT modify `log()` to know about IP hashing. **Resolution: agreed**. The `log()` function stays as a generic structured log shipper.

7. **IPv6 normalization**: security-minion flagged this as the highest-risk concern. **Resolution: hash the raw `CF-Connecting-IP` string as-is**. Cloudflare normalizes `CF-Connecting-IP` to a consistent representation per request. The same client hitting the same PoP gets the same string. Different PoPs may theoretically format IPv6 differently, but for same-day abuse correlation (the stated use case), this is acceptable. Adding a full IPv6 normalization layer is YAGNI -- the project is single-tenant with low traffic. Document the assumption and add a backlog item if IPv6 correlation issues are observed.

### Task 1: Hashed IP module + integration into all log events
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are implementing HMAC-SHA256 hashed IP logging for abuse correlation in a Cloudflare Workers project. This resolves GitHub issue #36.

    ## Context

    The web-resource-ledger (WRL) is a Cloudflare Worker that captures web page screenshots, HTML, and headers. It logs structured events to Coralogix. The goal is to add a pseudonymized client IP hash (`cip`) to every log entry so operators can correlate activity from the same IP within a single day, without storing raw IPs in logs.

    ## What to build

    ### 1. New file: `src/ip-hash.js`

    Create a module that exports a single function `computeCip(env, ip)`:

    - **Two-step HMAC-SHA256 key derivation**:
      1. `dailyKey = HMAC-SHA256(IP_HASH_SEED, YYYY-MM-DD)` -- derives a daily key from the seed
      2. `cip = HMAC-SHA256(dailyKey, ip)` -- hashes the IP with the daily key
    - Uses `crypto.subtle.importKey` + `crypto.subtle.sign` (Web Crypto API, already used elsewhere in this project -- see `src/signing.js` for the pattern)
    - Returns the first 16 hex characters of the hash (64 bits -- sufficient for correlation at current traffic volume)
    - **Caches the imported CryptoKey in module scope**, keyed by date string. Pattern: keep a `let cachedKey = null; let cachedDate = '';` pair in module scope. On each call, compare current UTC date to `cachedDate`. If different, re-derive and cache. This amortizes the `importKey` cost to once per isolate per day.
    - Returns `undefined` when `env.IP_HASH_SEED` is absent (graceful degradation for local dev / tests without the secret)
    - **Never throws** -- wrap the crypto operations in try/catch and return `undefined` on any error
    - Hash the raw `CF-Connecting-IP` string as-is (Cloudflare normalizes this per request; no additional IPv6 normalization needed)

    ```js
    // src/ip-hash.js
    // Module-scoped cache for daily HMAC key
    let cachedKey = null;
    let cachedDate = '';

    export async function computeCip(env, ip) {
      // implementation here
    }
    ```

    ### 2. Modify `src/index.js`

    In the `fetch()` handler, compute `cip` once per request and thread it through:

    **In `handleCreateCapture()`:**
    - After auth check succeeds, compute: `const cip = await computeCip(env, request.headers.get('CF-Connecting-IP') || 'unknown');`
    - Add `cip` to the `security.auth_fail` log call (line 82): `{ event: 'security.auth_fail', status: auth.response.status, cip }`
    - Add `cip` to the `security.rate_limit` log call (line 93): `{ event: 'security.rate_limit', limiter: 'capture_per_ip', cip }`
    - Add `cip` to the `security.capacity_limit` log call (line 102): `{ event: 'security.capacity_limit', cip }`
    - Add `cip` to the `security.ssrf_block` log call (line 126): add `cip` to the data object
    - Pass `cip` to `performCapture()` -- see capture.js changes below

    **In `handleListCaptures()`:**
    - Compute `cip` after auth check
    - Add `cip` to the `security.auth_fail` log call
    - Add `cip` to the `security.rate_limit` log call
    - Add `cip` to the `security.capacity_limit` log call
    - Add `cip` to the `list.error` and `list.success` log calls

    **In `handleVerifyCapture()`:**
    - Compute `cip` after rate limit check
    - Add `cip` to the `security.rate_limit` log call

    **In `handleGetSigningKey()` and `handleGetSigningKeys()`:**
    - Compute `cip` at the top
    - Add `cip` to the `security.rate_limit` log call

    **IMPORTANT**: For `security.auth_fail` log calls, the `cip` must be computed BEFORE the auth check (since we want the IP hash even for failed auth). But `computeCip` needs `env`, not auth. So compute `cip` early in the handler, before the auth check.

    Wait -- actually, look at the current code carefully. The `security.auth_fail` log happens inside the `if (!auth.ok)` block. We need `cip` available at that point. The simplest approach: compute `cip` once at the top of each handler function that has log calls.

    For handlers that don't have log calls (handleHealth, handleCaptureStatus, handleGetCapture, handleGetCaptureArtifact), don't compute `cip` -- no logging means no need.

    **Import**: Add `import { computeCip } from './ip-hash.js';` at the top of index.js.

    ### 3. Modify `src/capture.js`

    **Change `performCapture()` signature** to accept `cip` as a parameter:
    ```js
    export async function performCapture(env, url, ip, captureId, tenantId, cip, renderer = defaultRenderer)
    ```

    Note: `cip` is inserted BEFORE `renderer` (which has a default value). This means the call site in `index.js` changes from:
    ```js
    ctx.waitUntil(performCapture(env, result.url, result.ip, captureId, tenantId));
    ```
    to:
    ```js
    ctx.waitUntil(performCapture(env, result.url, result.ip, captureId, tenantId, cip));
    ```

    **Add `cip` to ALL log calls inside `performCapture()`**. There are 7 log calls:
    1. Line 104: `capture.stage.fail` -- add `cip`
    2. Line 112: `capture.header_fail` -- add `cip`
    3. Line 156: `capture.key_archive_fail` -- add `cip`
    4. Line 168: `capture.wacz_fail` -- add `cip`
    5. Line 172-179: `capture.success` -- add `cip`
    6. Line 182: `capture.fail` (catch-all) -- add `cip`
    7. Line 186: `capture.kv_fail` -- add `cip`

    Simply spread `cip` into each data object. When `cip` is undefined (no seed configured), the field is omitted from the JSON naturally.

    **Update JSDoc** for `performCapture()` to document the new `cip` parameter:
    ```
    * @param {string} [cip] Hashed client IP (undefined when IP_HASH_SEED not configured)
    ```

    ### 4. Modify `src/log.js`

    **Update the INVARIANT comment only** (no functional changes to `log()`):
    ```
    * INVARIANT: `data` must contain only static values and predetermined
    * strings, never attacker-controlled input. HMAC-derived values from
    * request data (e.g., hashed IP) are acceptable because the output is a
    * fixed-length hex string that cannot contain injection payloads.
    * Truncated framework error messages (e.g., Playwright) are acceptable
    * when the framework does not echo user-supplied content into its error
    * strings. Callers are responsible for ensuring this contract.
    ```

    ### 5. Modify `wrangler.toml`

    Update the secrets documentation comment (around line 39):
    ```toml
    # Observability: Coralogix log ingestion
    # CORALOGIX_SEND_KEY must be set via: wrangler secret put CORALOGIX_SEND_KEY
    # IP_HASH_SEED must be set via: wrangler secret put IP_HASH_SEED
    ```

    And the staging comment (around line 46):
    ```toml
    # Secrets (CAPTURE_API_KEY, SIGNING_KEY, CORALOGIX_SEND_KEY, IP_HASH_SEED) are set via:
    ```

    ### 6. Modify `.github/workflows/deploy-staging.yml`

    Add `IP_HASH_SEED` to the secrets block and env block:
    ```yaml
          secrets: |
            CAPTURE_API_KEY
            SIGNING_KEY
            CORALOGIX_SEND_KEY
            IP_HASH_SEED
        env:
          CAPTURE_API_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}
          SIGNING_KEY: ${{ secrets.WRL_STAGING_SIGNING_KEY }}
          CORALOGIX_SEND_KEY: ${{ secrets.WRL_STAGING_CORALOGIX_SEND_KEY }}
          IP_HASH_SEED: ${{ secrets.WRL_STAGING_IP_HASH_SEED }}
    ```

    ### 7. Modify `vitest.config.js`

    Add `IP_HASH_SEED` to miniflare bindings:
    ```js
    bindings: {
      CAPTURE_API_KEY: 'test-api-key-for-vitest',
      SIGNING_KEY: testSigningKey,
      TEST_ARCHIVED_KEY: testArchivedKey,
      IP_HASH_SEED: 'test-ip-hash-seed-for-vitest',
    },
    ```

    ## Files you will modify
    - `src/ip-hash.js` (NEW)
    - `src/index.js` (modify -- add import, compute cip in handlers, pass to log calls and performCapture)
    - `src/capture.js` (modify -- add cip param, add cip to all log data objects)
    - `src/log.js` (modify -- update INVARIANT comment only)
    - `wrangler.toml` (modify -- update comments)
    - `.github/workflows/deploy-staging.yml` (modify -- add IP_HASH_SEED)
    - `vitest.config.js` (modify -- add IP_HASH_SEED binding)

    ## What NOT to do
    - Do NOT modify the `log()` function signature or behavior
    - Do NOT add IPv6 normalization logic
    - Do NOT add npm dependencies
    - Do NOT change the rate limiting logic
    - Do NOT touch KV storage of raw IPs (out of scope)
    - Do NOT modify test files (Task 3 handles tests)

    ## Reference files to read
    - `src/signing.js` -- for the crypto.subtle pattern used in this project
    - `src/log.js` -- to understand the log function
    - `src/index.js` -- all the handlers you need to modify
    - `src/capture.js` -- performCapture signature and all log calls

- **Deliverables**: New `src/ip-hash.js` module; updated `src/index.js`, `src/capture.js`, `src/log.js`, `wrangler.toml`, `deploy-staging.yml`, `vitest.config.js`
- **Success criteria**: `computeCip()` returns a 16-char hex string when seed is present, `undefined` when absent. Every log call in index.js and capture.js includes `cip` in its data object. No functional change to `log()` itself.

### Task 2: Fix categorizeError + raw error logging
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1 (needs the updated capture.js with cip parameter)
- **Approval gate**: no
- **Prompt**: |
    You are fixing error logging in the WRL capture pipeline. This resolves GitHub issue #52: "categorizeError swallows actual Playwright error messages."

    ## Context

    The `categorizeError()` function in `src/capture.js` maps Playwright errors to user-safe messages. The problem: when debugging, operators see only the sanitized message in Coralogix (e.g., "Browser session was unexpectedly closed") but not the actual Playwright error that caused it. They need the raw error.name and error.message alongside the categorized message.

    ## What to build

    ### 1. Add new error patterns to `categorizeError()` in `src/capture.js`

    Add these patterns BEFORE the generic catch-all return at the bottom of `categorizeError()`:

    ```js
    // Session lifecycle errors (keep_alive expiry, CDP breakdown)
    if (msg.includes('Session expired') || msg.includes('session has been closed')) {
      return { message: 'Browser session expired', retryable: true };
    }
    if (msg.includes('Protocol error')) {
      return { message: 'Browser protocol error', retryable: true };
    }
    if (msg.includes('Connection refused') || msg.includes('ECONNREFUSED')) {
      return { message: 'Browser connection refused', retryable: true };
    }
    ```

    Place these AFTER the existing `session pool` check and BEFORE the final catch-all `return`.

    ### 2. Add raw error fields to `capture.stage.fail` log entry

    In `performCapture()`, the `capture.stage.fail` log call (around line 104) currently logs:
    ```js
    { event: 'capture.stage.fail', captureId, tenantId, stage: 'browser_render', errorCategory: message, retryable, cip }
    ```

    Add `errorName` and `errorMessage`:
    ```js
    {
      event: 'capture.stage.fail',
      captureId,
      tenantId,
      stage: 'browser_render',
      errorCategory: message,
      retryable,
      cip,
      errorName: renderResult.reason?.name,
      errorMessage: String(renderResult.reason?.message ?? '').slice(0, 256),
    }
    ```

    ### 3. Add raw error field to `capture.fail` catch-all log entry

    The catch-all at the bottom of `performCapture()` (around line 182) currently logs:
    ```js
    { event: 'capture.fail', captureId, tenantId, stage: 'catch_all', errorClass: err?.constructor?.name, cip }
    ```

    Add `errorMessage`:
    ```js
    {
      event: 'capture.fail',
      captureId,
      tenantId,
      stage: 'catch_all',
      errorClass: err?.constructor?.name,
      errorMessage: String(err?.message ?? '').slice(0, 256),
      cip,
    }
    ```

    The 256-char truncation bounds the field size. It is safe because:
    - Playwright error messages are framework-generated, not user input
    - The value goes through JSON.stringify (no injection vector)
    - Target URLs that may appear in messages were already validated by validateUrl()

    ## Files you will modify
    - `src/capture.js` (modify -- add error patterns, add errorName/errorMessage fields)

    ## What NOT to do
    - Do NOT modify the `log()` function
    - Do NOT modify `index.js` (Task 1 handles that)
    - Do NOT modify test files (Task 3 handles tests)
    - Do NOT add any dependencies
    - Do NOT change the KV error messages (those are user-facing)
    - Do NOT log `error.stack` -- only `error.name` and `error.message`

    ## Reference files to read
    - `src/capture.js` -- the file you are modifying (read the current state, which includes Task 1's cip changes)

- **Deliverables**: Updated `src/capture.js` with new error patterns and raw error fields in log entries
- **Success criteria**: New Playwright session error patterns are handled. `capture.stage.fail` log entries include `errorName` and `errorMessage`. Catch-all includes `errorMessage`. All error messages truncated to 256 chars.

### Task 3: Tests for IP hashing and error logging
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    You are writing tests for two new features in the WRL project: HMAC-SHA256 hashed IP logging (#36) and improved error logging (#52).

    ## Context

    The project uses vitest with `@cloudflare/vitest-pool-workers`. Tests run in a miniflare environment. The existing test patterns are in `test/capture.test.js` and `test/log.test.js` -- follow the same style (fetchMock, mockEnv, etc.).

    ## What to build

    ### 1. New file: `test/ip-hash.test.js`

    Unit tests for `src/ip-hash.js`:

    ```js
    import { describe, it, expect } from 'vitest';
    import { computeCip } from '../src/ip-hash.js';
    ```

    **Test cases:**
    - `computeCip(env, ip)` returns a 16-character hex string when `IP_HASH_SEED` is present
    - Same IP + same day (same mock env) = same hash (deterministic)
    - Different IPs + same env = different hashes
    - Returns `undefined` when `env.IP_HASH_SEED` is absent
    - Returns `undefined` when `env.IP_HASH_SEED` is empty string
    - Never throws -- pass null, undefined, empty string as ip; all return without throwing

    For the "different day = different hash" test: this is hard to test without mocking Date. You can skip this test or add a brief note explaining why. The daily rotation is an implementation detail that relies on `new Date().toISOString().slice(0, 10)` -- testing it would require either exposing the date parameter or mocking the global Date, both of which add complexity for low value.

    **Mock env for tests:**
    ```js
    const mockEnv = { IP_HASH_SEED: 'test-seed-for-unit-tests' };
    ```

    ### 2. Add tests to `test/capture.test.js`

    Add new describe blocks for the new Playwright error patterns and raw error logging.

    **New categorizeError patterns** (add a describe block for each):

    ```js
    describe('performCapture -- session expired errors', () => {
      it('handles "Session expired" as retryable', async () => {
        const renderer = async () => { throw new Error('Session expired'); };
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
        const record = await getCapture(env.KV, TEST_ID);
        expect(record.status).toBe('failed');
        expect(record.retryable).toBe(true);
        expect(record.error).toBe('Browser session expired');
      });

      it('handles "session has been closed" as retryable', async () => {
        // similar pattern
      });
    });
    ```

    Do the same for:
    - `'Protocol error'` -> `'Browser protocol error'`, retryable: true
    - `'Connection refused'` -> `'Browser connection refused'`, retryable: true
    - `'ECONNREFUSED'` -> `'Browser connection refused'`, retryable: true

    **IMPORTANT**: Note the updated `performCapture()` signature. After Task 1, it is:
    ```js
    performCapture(env, url, ip, captureId, tenantId, cip, renderer)
    ```
    The `cip` parameter is now between `tenantId` and `renderer`. In tests, pass `undefined` for `cip`:
    ```js
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    ```

    You must also update ALL existing `performCapture()` calls in the test file to include `undefined` for the new `cip` parameter. The existing calls look like:
    ```js
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', stubRenderer);
    ```
    These must become:
    ```js
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);
    ```

    **Search for every call to `performCapture` in the test file and update them ALL.** There are approximately 20+ calls. Missing even one will cause that test to pass `stubRenderer` as the `cip` parameter and `undefined` as the renderer, which will break the test.

    ### 3. Do NOT modify `test/log.test.js`

    The `log()` function itself is unchanged. No new log tests needed.

    ## Files you will create/modify
    - `test/ip-hash.test.js` (NEW)
    - `test/capture.test.js` (modify -- add new error pattern tests, update all performCapture call signatures)

    ## What NOT to do
    - Do NOT modify source files (src/*)
    - Do NOT modify log.test.js
    - Do NOT add integration tests that require Coralogix (the log function no-ops in tests)
    - Do NOT try to test the daily key rotation (requires Date mocking, low value)
    - Do NOT add npm dependencies

    ## Reference files to read
    - `test/capture.test.js` -- existing test patterns (follow the same style)
    - `test/log.test.js` -- for reference on mockEnv patterns
    - `src/ip-hash.js` -- the module you are testing
    - `src/capture.js` -- to understand the new error patterns and performCapture signature

- **Deliverables**: New `test/ip-hash.test.js`; updated `test/capture.test.js` with new error pattern tests and updated call signatures
- **Success criteria**: All new tests pass. All existing tests pass with updated signatures. `computeCip` is tested for determinism, uniqueness, and graceful degradation.

### Cross-Cutting Coverage

- **Testing**: Task 3 (test-minion) covers unit tests for both features. Phase 6 will run the full test suite.
- **Security**: security-minion contributed to planning. The HMAC-SHA256 scheme is cryptographically sound. No separate security execution task needed -- the scheme is implemented directly by iac-minion per security-minion's design.
- **Usability -- Strategy**: Not applicable. These changes are operator-facing (log fields), not end-user-facing. No user journey or cognitive load impact.
- **Usability -- Design**: Not applicable. No UI changes.
- **Documentation**: wrangler.toml comment updates are included in Task 1. The INVARIANT comment update in log.js documents the new field policy. No external documentation needed for an internal logging change. Phase 8 will handle any remaining doc needs.
- **Observability**: observability-minion contributed to planning. Field naming (`cip`, `errorName`, `errorMessage`) and Coralogix indexing implications are addressed in the design. No separate observability task needed.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: Plan adds 3 new log fields (`cip`, `errorName`, `errorMessage`) to production logging infrastructure. Coordinated field naming and indexing strategy review is warranted. References Task 1 and Task 2.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, user-docs-minion

### Risks and Mitigations

1. **Clock skew at day boundary** (from security-minion, observability-minion): If `cip` is computed with a different date than a later log call, hashes won't correlate within the same request. **Mitigation**: `computeCip` is called once per request in `index.js` and the result is passed through. The date is captured inside `computeCip` at call time. Since all log calls for one request use the same `cip` value, they are consistent.

2. **IPv6 string representation variance** (from security-minion): Different string representations of the same IPv6 address would produce different hashes. **Mitigation**: Hash the raw `CF-Connecting-IP` string as-is. Cloudflare normalizes this per request. Accept that cross-PoP IPv6 representation differences may cause correlation gaps. This is acceptable for the single-tenant, low-traffic use case. Add to backlog if observed.

3. **IP_HASH_SEED not provisioned at deploy time** (from iac-minion): Feature degrades gracefully (cip field omitted). Not a correctness issue. **Mitigation**: Document in wrangler.toml comments. The GitHub Actions workflow change ensures staging deploys include the secret.

4. **performCapture() signature expansion** (from observability-minion): Adding `cip` as a 6th positional parameter makes the signature fragile. **Mitigation**: Acceptable for this PR. Flag for future refactor to options object if more parameters are added. The test update in Task 3 catches any missed call sites.

5. **Playwright error messages could change** (from security-minion, observability-minion): String-based pattern matching in `categorizeError()` is brittle. **Mitigation**: The new `errorMessage` field ensures the raw message is always visible even when categorization falls through to the catch-all. This actually reduces the risk of the existing pattern-matching approach.

### Execution Order

```
Task 1: Hashed IP module + integration     (no dependencies)
  |
  v
Task 2: Fix categorizeError + raw errors   (depends on Task 1: needs updated capture.js)
  |
  v
Task 3: Tests for both features            (depends on Task 1 + Task 2: needs final source)
```

**Batch 1**: Task 1 (parallel: none, it's the foundation)
**Batch 2**: Task 2 (sequential: needs Task 1's capture.js changes)
**Batch 3**: Task 3 (sequential: needs both Tasks 1 and 2 complete)

No approval gates. All tasks auto-approve per user directive.

### Verification Steps

1. `npm test` passes all existing and new tests
2. `computeCip()` returns deterministic 16-char hex for same inputs
3. `computeCip()` returns `undefined` when `IP_HASH_SEED` is absent
4. Every `log()` call in `index.js` and `capture.js` includes `cip` in its data object
5. `categorizeError()` handles new session error patterns
6. `capture.stage.fail` log entries include `errorName` and `errorMessage`
7. `capture.fail` catch-all includes `errorMessage` truncated to 256 chars
8. `deploy-staging.yml` includes `IP_HASH_SEED` in secrets and env blocks
9. `vitest.config.js` includes `IP_HASH_SEED` in miniflare bindings
