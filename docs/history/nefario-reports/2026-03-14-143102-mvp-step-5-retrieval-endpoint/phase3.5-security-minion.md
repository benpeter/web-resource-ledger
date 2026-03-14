## Security Review: mvp-step-5-retrieval-endpoint

ADVISE

---

- [security]: The `handleGetCaptureArtifact` handler does not verify `record.status === 'complete'` before serving artifact bytes.
  SCOPE: Task 2 -- `handleGetCaptureArtifact` in `src/index.js`
  CHANGE: After the KV lookup (step 2 of handler logic), add a status check: if `record.status !== 'complete'`, return `problemResponse(404, 'Capture not found')` with `Cache-Control: no-store`. This mirrors the guard in `handleGetCapture`.
  WHY: A caller who guesses or retains an artifact path from a previously-completed capture (or enumerates the path directly) can request artifact bytes for a pending or failed capture whose R2 objects may be partially written or corrupt. More critically, without the status check the artifact endpoint is inconsistent with the metadata endpoint: the metadata endpoint 404s for non-complete captures, but the artifact endpoint would serve whatever R2 contains at the expected key. The prompt as written only checks `if null` (record not found), not `if not complete`.
  TASK: Task 2

- [security]: `Cache-Control: no-store` is missing from the `handleGetCaptureArtifact` 404 path when the resolved R2 key is undefined/null (steps 5 and 7 in the handler logic).
  SCOPE: Task 2 -- `handleGetCaptureArtifact` error paths in `src/index.js`
  CHANGE: All `problemResponse` calls in `handleGetCaptureArtifact` must pass `{ 'Cache-Control': 'no-store' }` as the headers argument. The prompt specifies this for step 3 (record not found) but the instruction must be explicit for steps 5 (key undefined) and 7 (R2 object null) as well. The existing `problemResponse` helper does not set Cache-Control automatically (confirmed in `src/responses.js`).
  WHY: A CDN or shared cache receiving a 404 without explicit Cache-Control may cache the response indefinitely. If the artifact later becomes available (e.g., a retry completes), callers receive stale 404s. Risk is LOW, but the fix is a one-liner and the pattern is already established in the metadata handler.
  TASK: Task 2

- [security]: The `Content-Disposition: attachment` header for the HTML artifact relies entirely on the dispatch table in `handleGetCaptureArtifact`; the Task 1 httpMetadata at write time sets `contentDisposition: 'attachment; filename="rendered.html"'` but the serve-time handler prompt does not explicitly confirm the `Content-Disposition` header will be set for ALL four artifact types -- only the dispatch table comment in step 9/10 implies it.
  SCOPE: Task 2 -- `handleGetCaptureArtifact` response construction in `src/index.js`
  CHANGE: The implementation prompt must be unambiguous: `Content-Disposition: attachment; filename="${filenames[artifactName]}"` must be set on ALL artifact responses, not only on the HTML artifact. The prompt does state this at step 10, but the Success Criteria (line 290) only spot-checks `Content-Type: text/plain` for html -- add an explicit success criterion: "Content-Disposition: attachment is present on all artifact responses including screenshot, headers, and wacz."
  WHY: Without `Content-Disposition: attachment` on the screenshot and WACZ artifacts, a browser that receives `image/png` or `application/wacz+zip` may render or execute the content inline depending on browser/OS file association handling. The concern is low for WACZ but non-trivial for PNG (drag-and-drop phishing scenarios). The test coverage (Task 4) currently only asserts Content-Type for html, screenshot, and wacz -- it does not assert Content-Disposition on any artifact. Adding one assertion closes the gap.
  TASK: Tasks 2 and 4

- [security]: The `handleGetCaptureArtifact` KV lookup reads any status (pending, failed, complete) before the plan recommends returning 404 for non-complete captures; but separately, a timing side-channel exists: an attacker can distinguish "capture ID exists but is not complete" from "capture ID does not exist" by measuring response latency, even though the response body is identical.
  SCOPE: Task 2 -- `handleGetCaptureArtifact` in `src/index.js`; risk accepted by design
  CHANGE: No code change required -- this is an accepted residual risk of the capture-ID-as-access-secret model. Document it explicitly in the SECURITY comment block above `handleGetCaptureArtifact`: "Timing side-channel: KV hit (pending/failed) vs KV miss produce statistically different latency. ID-as-secret model accepts this -- an attacker who can measure sub-millisecond latency already has the ID." This makes the acceptance explicit rather than implicit.
  WHY: The plan documents anti-enumeration for the response body (single static 404 message) but does not address timing. Recording the acceptance prevents a future reviewer from flagging it as an oversight.
  TASK: Task 2

---

### Assessment

The plan is well-designed for the stated security goals. The critical controls are all present: XSS prevention (text/plain + Content-Disposition at both write and serve time), ip/R2 key stripping via explicit field mapping, Cache-Control: private, no-store on the metadata endpoint, CORS wildcard with documented rationale, static 404 message, worker-proxied artifact serving, and 122-bit CSPRNG capture IDs. The four items above are gaps or missing enforcement in the Task 2 implementation prompt -- they do not require replanning, only targeted prompt clarification before the agent executes.

The most important fix is item 1 (status check in artifact handler): without it the artifact endpoint is inconsistent with the metadata endpoint in a security-relevant way.
