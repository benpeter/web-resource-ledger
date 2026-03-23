## Verdict: APPROVE

The test plan is thorough and well-matched to the feature scope. The specified cases cover the critical paths cleanly. A few gaps worth noting — none block execution, but the implementer should address them.

---

### Gaps to address during implementation

**1. Share token used for list endpoint should return 401, not gate bypass (explicitly test the gate boundary)**

The plan says "If the share token path is hit and the route is `/v1/captures` (list), return 401." The test list includes "Token cannot be used for list endpoint -> 401", which is correct. Make sure the test uses `GET /v1/captures` (no trailing capture ID), not just a capture-scoped path, to exercise the specific branch where `scopedCaptureId` is set but the route is the list route.

**2. Missing: share token on `/status` endpoint with in-progress capture**

The plan specifies `captureUrl` in the status response should include `?token=` when accessed via share token and status is 'complete'. There is no test case for what happens when status is `pending` (the capture is still running). The `captureUrl` field may not exist in that case, but the test should assert the shape explicitly. Add: "Share token on status for pending capture -> 200 with no captureUrl token propagation."

**3. Missing: `expiresIn` boundary validation tests in `share-token.test.js`**

The spec defines `expiresIn` min=300 and max=31536000. The test plan lists no boundary cases for this. Add tests for `expiresIn: 299` -> 400, `expiresIn: 0` -> 400, `expiresIn: 31536001` -> 400, `expiresIn: "abc"` -> 400. These are the inputs most likely to be accidentally accepted.

**4. Missing: `capture-retrieval.test.js` auth header tests for artifact sub-routes**

The plan says "Test all sub-routes with cross-tenant isolation: status, screenshot, html, wacz." It does NOT explicitly call out that the AUTHENTICATED owner happy path should also be tested for each artifact sub-route (not just cross-tenant rejection). The existing test file tests unauthenticated access to artifacts -- after the rewrite, confirm each artifact type (screenshot, html, wacz, status) has a 200 case with valid auth, not just a 404 cross-tenant case. Without this, a bug that breaks auth on artifact handlers but not metadata handlers would go undetected.

**5. Missing: legacy `default` tenant backward compat test for artifact routes**

The plan specifies "Test legacy auth (`authMethod: 'legacy'`, `tenantId: 'default'`) can still access captures owned by `default`." This is mentioned for `GET /v1/captures/{id}` but should also cover artifact sub-routes and status, since the legacy path could be broken separately on those handlers. Extend the legacy auth test to include at least one artifact route.

**6. Missing: `cleanDb()` ordering assertion**

The plan correctly says "add `DELETE FROM share_tokens` before `DELETE FROM captures` due to FK." Since this is easy to get wrong and would cause all multi-tenant tests to fail with a constraint error rather than a test failure, add a note in the fixture update for the implementer to verify the FK dependency order is correct by running the full suite in random order (Vitest's `--sequence.shuffle`). Not a test to write -- just a verification step.

**7. Verify endpoint: plan says "add explicit assertion in `test/verify-integration.test.js` header comment"**

A comment is not an assertion. The plan should also add an actual test case: `GET /v1/verify/{id}` with no auth headers returns 200. The existing tests exercise this implicitly since they send no auth, but an explicit "no auth required" test case (mirroring the one being REMOVED from capture-retrieval) makes the intent clear and will catch a future regression if the auth gate pattern is expanded carelessly. Add it as a named test.

---

### Things the plan gets right

- Two-tenant fixture pattern (A and B) is the correct approach for isolation tests.
- Identical 404 body for cross-tenant and non-existent capture is tested and specified correctly.
- The `wrl_share_` prefix and 256-bit entropy are specified; testing the format (prefix present, length 53) in share-token.test.js would be a nice addition but is not required.
- Expired = 410, revoked = 401 (indistinguishable from not-found) is a good security design and the test plan reflects it correctly.
- `cleanDb()` update with FK ordering is called out explicitly.
- E2E and integration test updates are scoped correctly (auth headers, not wholesale rewrites).
