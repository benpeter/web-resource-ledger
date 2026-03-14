# Code Review: mvp-step-5-retrieval-endpoint

Reviewed files: `src/capture.js`, `src/index.js`, `openapi.yaml`,
`test/capture-retrieval.test.js`, `test/capture-integration.test.js`
Supporting files read: `src/kv.js`, `src/responses.js`

---

VERDICT: APPROVE

---

FINDINGS:

- [NIT] src/index.js:121-162 -- `handleGetCapture` accesses `record.captureId`
  (line 142) but the KV schema stores the field as `captureId` (confirmed in
  kv.js line 40). This is safe today because `completeCapture` spreads the
  existing record, which preserves the `captureId` key. However, the response
  uses `record.captureId` while every other accessor uses `record.url`,
  `record.createdAt`, etc. directly. If a future refactor renames the KV field,
  this is the only path that breaks silently (the test at line 41 catches the
  value but only via `body.id`). Consider `captureId` local constant or
  confirming `record.captureId === captureId` at the top of the handler for
  explicit clarity.
  AGENT: phase4-frontend-minion (task 1 -- handleGetCapture)
  FIX: No immediate change required. Optional: replace `record.captureId` with
  the already-validated `captureId` local variable (match[1]) which is
  identical by construction. This removes the coupling to the KV field name.

- [NIT] src/index.js:164 -- `handleGetCaptureArtifact` signature includes `ctx`
  parameter but it is never used in the handler body. All other handlers that
  do not use `ctx` still carry it for consistency with the route dispatch
  signature -- that is fine. Just confirming this is intentional and not a
  dropped background task.
  AGENT: phase4-frontend-minion (task 2)
  FIX: No change needed. Pattern is consistent across all handlers.

- [NIT] src/index.js:203 -- `const buffer = await obj.arrayBuffer()` loads the
  full artifact into Worker heap before streaming. For the current MVP artifact
  sizes (screenshots, HTML, WACZ bundles) this is acceptable and matches the
  Cloudflare Workers R2 pattern. Noted for the backlog: if large WACZ bundles
  (>10 MB) become common, switching to `obj.body` (ReadableStream) would reduce
  memory pressure.
  AGENT: phase4-frontend-minion (task 2)
  FIX: Backlog item. No change required for MVP.

- [NIT] test/capture-retrieval.test.js:42-43 -- `expect(body.url).toBeTruthy()`
  and `expect(body.completedAt).toBeTruthy()` are weak assertions. A non-empty
  string would pass. Consider `expect(body.url).toBe(SEED_URL)` and
  `expect(body.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)` to pin the actual
  values. The test verifies shape but not correctness of field values.
  AGENT: phase4-test-minion (task 4)
  FIX: Replace `toBeTruthy()` on `url` with `toBe(SEED_URL)`. Replace
  `toBeTruthy()` on `completedAt` with an ISO date regex match. Both values are
  deterministic from the seed data.

- [NIT] test/capture-retrieval.test.js:54-56 -- The wacz URL assertion
  (`body.wacz.url`) is present but `body.artifacts.headers` is not asserted
  even though SEED_ARTIFACTS includes a headers key. The test at line 44-48
  only checks `screenshot`, `html`, and `wacz`. A regression that drops
  `headers` from the artifact map in `handleGetCapture` would not be caught.
  AGENT: phase4-test-minion (task 4)
  FIX: Add `expect(body.artifacts.headers).toMatch(/^https?:\/\//)` alongside
  the screenshot and html URL assertions in the "200 with correct shape" and
  "artifact URLs are absolute HTTP(S)" tests.

- [NIT] test/capture-retrieval.test.js:105-109 -- The `html artifact served as
  text/plain` test correctly checks `Content-Type` but does not assert
  `Content-Disposition: attachment`. The XSS-critical security property is
  that the browser does NOT render the HTML artifact inline. Content-Type:
  text/plain alone is not sufficient -- a misconfigured browser or proxy can
  sniff the content and override the type. The combination of text/plain AND
  Content-Disposition: attachment is the defence. The security-minion
  pre-review (phase3.5) flagged this gap.
  AGENT: phase4-test-minion (task 4)
  FIX: Extend the html test (and add equivalent for screenshot and wacz) to
  assert `res.headers.get('Content-Disposition')` contains both 'attachment'
  and the correct filename. The test at line 117 checks attachment for html
  only; the screenshot and wacz artifact tests (lines 111-115) have no
  Content-Disposition assertion at all.

- [NIT] test/capture-retrieval.test.js:136-143 -- The "pending capture returns
  404 on artifact route" test covers `handleGetCaptureArtifact` correctly, but
  there is no equivalent test for a pending capture against
  `GET /v1/captures/{id}` (the metadata endpoint, `handleGetCapture`). The
  `record.status !== 'complete'` branch in that handler is the design-decision
  branch (ux-strategy-minion vs api-spec-minion conflict). It should have its
  own test.
  AGENT: phase4-test-minion (task 4)
  FIX: Add one test in the `GET /v1/captures/{id}` describe block:
  ```js
  it('404 for pending capture on metadata endpoint', async () => {
    const pendingId = 'cap_' + 'f'.repeat(32);
    await env.KV.delete(`capture:${pendingId}`);
    await createCapture(env.KV, pendingId, SEED_URL, '93.184.216.34');
    const res = await SELF.fetch(`https://worker.test/v1/captures/${pendingId}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ type: 'about:blank', status: 404 });
  });
  ```

- [NIT] test/capture-retrieval.test.js -- `Cache-Control: no-store` is not
  asserted on any 404 response in the retrieval tests. The metadata handler
  (line 127) and artifact handler (lines 179, 186) all pass
  `{ 'Cache-Control': 'no-store' }` to `problemResponse`. The security-minion
  pre-review (phase3.5) flagged this as a required header. The implementation
  is correct, but the test suite does not verify it.
  AGENT: phase4-test-minion (task 4)
  FIX: Add `expect(res.headers.get('Cache-Control')).toBe('no-store')` to the
  RFC 9457 404 tests for both unknown ID (metadata, line 75) and unknown ID
  (artifact route, line 122).

---

## Security Checklist Verification

All critical security requirements from the review brief were checked against
the implementation:

| Requirement | Status | Location |
|---|---|---|
| `ip` field absent from all responses | PASS | `handleGetCapture` builds body with explicit field map; `ip` is never included |
| R2 keys absent from all responses | PASS | artifacts map returns worker-relative URLs, not R2 keys; `record.wacz.key` is never serialised |
| HTML artifact served as `text/plain` | PASS | contentTypes dispatch table at index.js:191; also set at R2 write time in capture.js:75 |
| `Content-Disposition: attachment` on HTML | PASS | filenames dispatch table at index.js:196; also set at R2 write time |
| Static 404 message (no ID reflection) | PASS | All problemResponse calls use 'Capture not found' static string; test at line 85 asserts no ID leak |
| `Cache-Control` on all responses | PASS for 200 | `private, no-store` on metadata 200; `public, max-age=31536000, immutable` on artifact 200; `no-store` on all 404s |
| No spread on raw KV records in handlers | PASS | `handleGetCapture` and `handleGetCaptureArtifact` do not spread the record; they access named fields only |
| `record.status === 'complete'` guard in artifact handler | PASS | Line 171 verifies this is present in the shipped code |

The `kv.js` spread (`...existing` in completeCapture/failCapture) is internal
to the KV layer and never reaches a response serialiser, so it is not an
exposure vector. The concern in the brief applies only to spreading raw records
into HTTP responses, which does not occur here.

---

## Summary

The implementation is correct and the critical security constraints are all
enforced in the production code paths. All findings are nits: weak test
assertions, missing test cases for documented code branches, and one backlog
observation about memory pressure. Nothing blocks shipping. The test gaps
identified under the NIT findings are recommended improvements for the next
iteration, not blockers.

The pre-review specialist inputs from security-minion (phase3.5) and
test-minion (phase3.5) were largely acted on in the implementation. The
remaining test gaps (Content-Disposition not asserted on all artifacts,
pending-capture 404 not tested on metadata endpoint, Cache-Control not
asserted on 404 responses) match what test-minion predicted would be missing.
