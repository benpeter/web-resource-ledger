ADVISE

---

- [security]: The signing-key endpoint's `btoa(String.fromCharCode(...keys.publicKeyBytes))` spread pattern will throw a RangeError for large typed arrays because it expands all bytes as function arguments; it works for 32 bytes now but is a fragile pattern that will silently break if the key derivation path ever changes.
  SCOPE: Task 3 -- `handleGetSigningKey` in `src/index.js`, the base64 encoding line
  CHANGE: Replace the spread-to-btoa pattern with `Buffer.from(keys.publicKeyBytes).toString('base64')` (node:buffer is available via nodejs_compat) or `btoa(Array.from(keys.publicKeyBytes, b => String.fromCharCode(b)).join(''))` if Buffer is not preferred. The existing `signBytes()` in `signing.js` uses the same fragile pattern -- the Task 3 implementer should match whichever fix is chosen consistently.
  WHY: The `...spread` into a variadic function hits the JavaScript engine's argument count limit (typically 65536). At 32 bytes this is safe, but the encoding logic should not depend on key size staying constant. Using `Array.from()` with map is the idiomatic safe alternative.
  TASK: Task 3

- [security]: The signing-key endpoint reuses `VERIFY_RATE_LIMITER` but does not have its own rate limiter binding. A burst of requests to `/.well-known/signing-key` will consume rate-limit quota shared with `/v1/verify/{captureId}`, potentially denying service on the higher-value verification endpoint.
  SCOPE: Task 3 -- `handleGetSigningKey` rate-limit design; `wrangler.toml`
  CHANGE: Either add a dedicated `SIGNING_KEY_RATE_LIMITER` binding with a generous limit (e.g., 60/min, since the endpoint is unauthenticated and cacheable), or document explicitly that sharing VERIFY_RATE_LIMITER is an accepted trade-off. If sharing is accepted, add a code comment explaining the decision so a future maintainer does not add a dedicated limiter that conflicts.
  WHY: The endpoint serves `Cache-Control: public, max-age=3600` so well-behaved CDNs and browsers will cache aggressively. The rate-limiting concern is primarily about uncached direct requests or a targeted DoS. Sharing with verify means a determined attacker hammering the key endpoint can rate-limit legitimate verification requests. This is medium severity because the endpoint is cheap and the shared limit is per-IP.
  TASK: Task 3

- [security]: The `handleGetSigningKey` handler calls `getSigningKeys(env)` which caches the derived `publicKeyBytes` as a module-scoped `Uint8Array`. The handler then passes that same `Uint8Array` to `btoa(String.fromCharCode(...))`. Because the cache holds a live reference, a future refactor that mutates `publicKeyBytes` after caching would silently corrupt all subsequent responses. The plan does not mention this and the implementer may not notice.
  SCOPE: Task 3 -- `handleGetSigningKey` and `signing.js` cache
  CHANGE: In `handleGetSigningKey`, encode a copy: `const bytes = keys.publicKeyBytes.slice()` before encoding. This is a one-liner defensive copy that eliminates the shared-reference risk without changing behavior today.
  WHY: The cached `Uint8Array` at `_cachedPublicKeyBytes` is a view into the SPKI DER buffer (it uses an offset: `new Uint8Array(spkiDer.buffer, byteOffset + 12, 32)`). Any buffer mutation would affect it silently. This is CWE-362 (race condition via shared resource) in embryonic form.
  TASK: Task 3

- [security]: The OpenAPI spec task (Task 4) adds `X-Frame-Options` and `Strict-Transport-Security` headers to `components/headers/` and requires them on ALL endpoint responses including all error status codes. The `StrictTransportSecurity` schema is typed `string` with no `enum` constraint, which means the spec allows any HSTS value. If the spec is used for contract testing or SDK generation, this permits a compliant implementation to send `max-age=0` (which disables HSTS).
  SCOPE: Task 4 -- `openapi.yaml`, `components/headers/StrictTransportSecurity`
  CHANGE: Add a `pattern` constraint to the `StrictTransportSecurity` header schema: `pattern: '^max-age=\d+'` to enforce that the value is a valid HSTS directive. Alternatively, use `example: 'max-age=31536000; includeSubDomains'` to at minimum document the expected value. The spec-level constraint makes contract tests meaningful.
  WHY: A spec that documents security-sensitive headers should constrain their values, not just their types. Without a constraint, automated compliance checks pass trivially. This is informational severity on its own but undermines the value of adding the header to the spec.
  TASK: Task 4

- [security]: Task 5 instructs test-minion to skip the 503-when-no-key test "if the test framework does not easily support per-test env overrides." This creates a known gap in the test coverage for a security-relevant code path (the guard that prevents key material from being served when misconfigured).
  SCOPE: Task 5 -- `test/signing-key.test.js`, the unconfigured-signing-key scenario
  CHANGE: Explicitly require the test to be written, even if it uses a workaround. The `handleVerifyCapture` handler has the same guard and is presumably tested -- check `test/verify-integration.test.js` for how that test achieves an unconfigured-key state and replicate the pattern. If no pattern exists, instruct test-minion to use a second `describe` block with a stub env object that omits `SIGNING_KEY`, which is supported by the vitest pool workers environment.
  WHY: The guard `if (!keys) return problemResponse(503, ...)` is the only defense against serving a misleading 503 when the key is misconfigured vs. a legitimate key response. Untested guard paths have a poor track record of surviving refactors. This is A09 (Security Logging and Alerting Failures) adjacent -- if the guard silently stops working, the misconfiguration will not be caught until production.
  TASK: Task 5

---

No blocking issues. All findings are advisory. The core security decisions in the plan are sound: HSTS without preload, X-Frame-Options globally, 503 for unconfigured signing, CORS wildcard on the public key endpoint, rate-limiting on the signing-key handler, fail-closed DNS validation, and the TOCTOU risk documentation in Task 7 are all correct. The CSP remaining page-specific is the right call. The plan can proceed with the above advisories noted for the implementing agents.
