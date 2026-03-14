ADVISE

- [testing]: Round-trip test imports `signBytes` and `verifySignature` from `src/signing.js`, but the Task 5 prompt instructs test-minion to call `getSigningKeys()` directly to obtain the private key for signing — `signing.js` uses a module-scoped cache and `node:crypto` that behaves differently between the Worker runtime and the test harness; the round-trip test should rely only on `SELF.fetch()` for the public-key half and use the `env` binding directly for the signing half, mirroring how `verify-integration.test.js` already calls `performCapture` with `env`.
  SCOPE: `test/signing-key.test.js` test case 9 (round-trip verification)
  CHANGE: Import `env` from `cloudflare:test` and call `getSigningKeys(env)` + `signBytes()` using the injected test binding rather than constructing keys independently; then fetch the public key via `SELF.fetch('/.well-known/signing-key')` and import it with `crypto.subtle.importKey('raw', ...)` to verify — this keeps the test honest about what the endpoint actually returns
  WHY: If the round-trip test bypasses the Worker's own key derivation path and constructs keys directly, it can pass even when the endpoint is returning the wrong public key bytes; the cache in `signing.js` means a stale `_cachedPublicKeyBytes` could be returned without the round-trip detecting it
  TASK: Task 5

- [testing]: `test/security-headers.test.js` test case 4 (`GET /.well-known/signing-key`) will return 503 if `SIGNING_KEY` is absent, but in the test environment `vitest.config.js` injects a `SIGNING_KEY` so it returns 200 — the plan is consistent here; however the `expectSecurityHeaders` helper does not assert the exact HSTS directive string (`includeSubDomains`), only that `max-age=` is present; a future change that drops `includeSubDomains` would not be caught.
  SCOPE: `test/security-headers.test.js` `expectSecurityHeaders` helper function
  CHANGE: Add `expect(hsts).toContain('includeSubDomains')` alongside the existing `max-age=` check in the helper, since the synthesis explicitly locks in `includeSubDomains` as the required directive
  WHY: The HSTS directive `includeSubDomains` is a security property, not merely formatting; an assertion that only checks `max-age=` will silently pass if `includeSubDomains` is accidentally omitted
  TASK: Task 5

- [testing]: The content-negotiation test in Task 5 (step 3) depends on `TEST_CAPTURE_ID` and existing fixture setup from `verify-integration.test.js`, but that file uses module-level `beforeEach` with `fetchMock` activation — adding a new test case to this file without a corresponding `beforeEach`/`afterEach` pair risks `fetchMock` state leaking into or from surrounding tests.
  SCOPE: `test/verify-integration.test.js` new content-negotiation test case
  CHANGE: The new test should be placed inside an existing `describe` block that already has `beforeEach`/`afterEach` wired (e.g. the happy-path describe block), or test-minion should note explicitly that the test relies on the file-level `beforeEach` — either is fine but the decision must be intentional rather than implicit
  WHY: `verify-integration.test.js` uses `fetchMock.activate()` / `fetchMock.deactivate()` at file scope; a test added outside the existing describe structure without awareness of this will either fail (fetchMock not active) or leave mock state active for subsequent files
  TASK: Task 5
