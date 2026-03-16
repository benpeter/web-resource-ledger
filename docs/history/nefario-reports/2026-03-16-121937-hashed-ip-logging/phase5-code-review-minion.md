# Code Review: r6-hashed-ip-logging

**Verdict: ADVISE**

No blocking defects. Three advisory findings -- two correctness issues worth fixing before merge, one NIT on test coverage. The crypto implementation, secret handling, and log-injection posture are all correct.

---

## Findings

### [ADVISE] src/ip-hash.js:36-52 -- Module-scoped key cache is not safe across concurrent date rollover

**Description:**
`_cachedKey` and `_cachedDate` are module-level mutable state. The cache invalidation check at line 36 is:

```js
if (today !== _cachedDate || !_cachedKey) {
```

This is correct for sequential requests, but there is a race window under concurrent execution. If two requests arrive simultaneously on a day boundary -- both see `today !== _cachedDate`, both begin `importKey`, and both will eventually write `_cachedKey` and `_cachedDate`. The final write wins. In the Workers isolate model (single-threaded event loop) this is unlikely to cause a real collision because `await` yields cooperative control and re-entry is serialized, but the logic is also not obviously safe as written and deserves a comment or an explicit guard to avoid confusion for future readers.

More importantly: the cache stores the derived `dailyKey` as a `CryptoKey` object, but `_cachedKey` is initialized as `null` (line 20). The check `!_cachedKey` on line 36 evaluates `null` as falsy, which is correct. However if `crypto.subtle.importKey` or `crypto.subtle.sign` fails mid-derivation and the `catch` block returns `undefined`, `_cachedKey` remains `null` from the previous day. The next request will correctly re-derive because `!_cachedKey` is still truthy. This is fine. The code is actually correct but the interaction is subtle enough to warrant a comment noting that partial derivation failures leave the cache in a safe state.

This is not a functional bug; it is a future-maintainability concern.

**AGENT:** nefario (or implementing agent)

**FIX:** Add a comment near the cache invalidation block explaining that partial derivation failures leave `_cachedKey = null`, which forces re-derivation on the next call, and that the cooperative-yield model of the isolate event loop prevents concurrent mutation. No code change required unless you want to make the intent explicit.

---

### [ADVISE] src/capture.js:105 -- `errorName` and `errorMessage` from Playwright are added to the log invariant boundary

**Description:**
The `log.js` INVARIANT comment (updated in this PR) now explicitly acknowledges that truncated framework error messages are acceptable "when the framework does not echo user-supplied content into its error strings." However, line 105 in capture.js logs:

```js
errorName: renderResult.reason?.name,
errorMessage: String(renderResult.reason?.message ?? '').slice(0, 256)
```

`renderResult.reason` is a Playwright-thrown error. Playwright constructs several error messages that include the URL being navigated to (e.g., `page.goto: net::ERR_NAME_NOT_RESOLVED at https://user-supplied-url.com`). This means `errorMessage` at line 105 can contain the caller-supplied URL, which is a user-controlled string.

The `.slice(0, 256)` truncation is present, which limits blast radius, but the raw URL can itself be 256 characters of attacker-controlled text (the URL was already validated by `validateUrl` at the call site in index.js, so it is not fully arbitrary, but it could still contain tracking tokens, path segments, or encoded payloads up to the validated length).

The INVARIANT comment in log.js says callers are responsible for ensuring this contract. The current caller (capture.js line 105) does not fully satisfy it for `errorMessage`.

This does not constitute an injection vulnerability into Coralogix (JSON-serialized log payloads are not interpreted as code by the log sink), but it does mean that validated-but-attacker-chosen URL content will appear in the operational log under a field name that looks like an internal error detail. This could pollute abuse correlation.

**AGENT:** nefario (or implementing agent)

**FIX:** Either (a) strip the URL from `errorMessage` before logging by replacing the known `net::ERR_*` prefix pattern with just the error code, or (b) simply drop `errorMessage` from the stage.fail log call and rely on `errorCategory` (which goes through `categorizeError` and is guaranteed-safe), keeping `errorName` for Playwright error class discrimination. The catch-all log at line 184 has the same issue with `errorMessage` but `err` there is not Playwright-sourced, so it is lower risk.

---

### [NIT] test/ip-hash.test.js -- No cross-day rotation test

**Description:**
The test suite verifies that the same IP on the same day produces the same hash (determinism) but does not verify that the hash changes across days. The two-step HMAC derivation is the entire point of daily rotation for GDPR compliance, and it is untested. Testing it requires mocking `Date` or accepting a fixed date in `computeCip`.

This is non-blocking: the crypto logic is straightforward and the tests cover all the failure modes well. But the GDPR claim in the module docstring ("Daily rotation limits the tracking window to 24 hours") is not backed by a test.

**AGENT:** nefario (or implementing agent)

**FIX:** Add a test that calls `computeCip` with two different `today` values by temporarily overriding `Date` (e.g., `vi.useFakeTimers()` / `vi.setSystemTime()`). Assert that the two outputs differ. This validates the core privacy guarantee.

---

## What is Correct

**Crypto implementation:** Two-step HMAC derivation is sound. Seed -> daily key -> per-IP hash correctly provides key separation. Using `HMAC-SHA256` for both steps is appropriate. Truncation to 16 hex chars (64-bit) is a reasonable pseudonymity/storage tradeoff.

**Secret handling:** `IP_HASH_SEED` is correctly treated as a Wrangler secret (not in `[vars]`, not committed to VCS). The `wrangler.toml` comment and the CI workflow both wire it through `secrets:` / GitHub Actions secrets. No seed value appears anywhere in the codebase including `vitest.config.js` (uses a test-only string, not a real secret).

**Graceful degradation:** `computeCip` returns `undefined` when the seed is absent, and all log call sites accept `cip` as an optional field. No handler fails or throws when `cip` is undefined.

**Log injection posture:** `cip` is a fixed-length hex string (or undefined) -- it cannot carry injection payloads. The INVARIANT comment update in log.js correctly documents the expanded contract.

**CI/CD:** `IP_HASH_SEED` is wired through the `secrets:` block in wrangler-action, not through `env:` vars. This is correct -- secrets passed through the wrangler `secrets:` block are stored as encrypted Worker secrets, not exposed as plaintext environment variables in the Actions runner.

**Test coverage:** The `ip-hash.test.js` suite covers all meaningful code paths: seed present/absent, null/undefined env, empty string, IPv6, and determinism. The `capture.test.js` additions correctly update all `performCapture` call signatures to include the new `cip` parameter and add the five new error-pattern tests.

**No hardcoded credentials anywhere in the diff.**
