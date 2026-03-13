## Security Review Verdict: mvp-step-3-capture-endpoint

ADVISE

---

- [security]: The timing-safe comparison in Task 2 (auth.js) has a length-check bypass that reveals key length through a non-timing-safe early return.
  SCOPE: `src/auth.js` -- `verifyApiKey` function, the `byteLength` comparison branch
  CHANGE: Do not return early on length mismatch. Instead, use `crypto.subtle.timingSafeEqual` directly by padding both buffers to the same fixed length, OR accept that length leakage is acceptable for API keys of fixed, known length. If the API key is always a UUID or similar fixed-length token, document that the length of `CAPTURE_API_KEY` must be a fixed, publicly-known length to eliminate the oracle. If variable-length keys must be supported, use a constant-time length comparison (fill a fixed-size buffer, copy both encoded values in, compare the full buffer).
  WHY: The plan's code returns a 401 immediately when `a.byteLength !== b.byteLength`. An attacker submitting tokens of increasing length and measuring response time can determine the exact byte length of `CAPTURE_API_KEY`. This is a partial timing oracle (CWE-208). Depending on key format, it may be irrelevant, but the plan does not document this assumption.
  TASK: Task 2

---

- [security]: The `captureHeaders` fetch in Task 4 (capture.js) does not validate that the URL has not changed between `validateUrl` (called in the POST handler) and the background fetch, and it does not restrict the URL scheme at the fetch layer.
  SCOPE: `src/capture.js` -- `captureHeaders` function, the `fetch(url, ...)` call
  CHANGE: Inside `captureHeaders`, assert that the `url` argument uses `https:` or `http:` scheme before calling `fetch`. This is a defence-in-depth check independent of what `validateUrl` did, since `performCapture` receives the url string and passes it directly. The check costs one line and eliminates any future code path where a non-HTTP URL reaches this function.
  WHY: The plan explicitly acknowledges the TOCTOU gap (DNS re-resolution at render time) but does not add a scheme guard at the fetch boundary. If a future caller passes a non-HTTP URL to `performCapture` (e.g., during testing or from a future code path), `fetch` would execute it. Defence-in-depth demands validating the scheme at every trust boundary (CWE-918). This is a low-cost control.
  TASK: Task 4

---

- [security]: The `page.on('response')` byte-counting in Task 4 uses `content-length` headers only, which are optional and spoofable; actual transferred bytes may exceed `MAX_PAGE_BYTES` without triggering the limit.
  SCOPE: `src/capture.js` -- `defaultRenderer` function, the `page.on('response', ...)` handler
  CHANGE: Either (a) accept the known limitation and document it in a code comment so a future maintainer does not assume the 50MB limit is reliably enforced, or (b) switch to accumulating `resp.buffer()` sizes in the response handler (if the Puppeteer API on Cloudflare supports it). At minimum, add a comment: `// NOTE: content-length may be absent or incorrect; this limit is best-effort, not guaranteed`.
  WHY: A page returning chunked-encoded bodies or omitting `content-length` entirely will bypass the size limit check. An adversarial page can exhaust Worker memory. Documenting the limitation ensures it is not silently relied upon as a hard security control. Closing this gap fully is backlogged (Queue migration, isolation improvements) but the code should not claim stronger guarantees than it delivers.
  TASK: Task 4

---

- [security]: The status endpoint (`GET /v1/captures/{id}/status`) uses the capture ID as the access secret (no auth), but the plan does not specify rate limiting on this endpoint, leaving it open to brute-force enumeration of the `cap_[a-f0-9]{32}` keyspace.
  SCOPE: `src/index.js` -- `handleCaptureStatus` handler; `wrangler.toml` rate limiting configuration (Task 6)
  CHANGE: Apply the platform rate limiter to the status endpoint as well. The existing `CAPTURE_RATE_LIMITER` binding and the conditional check pattern can be reused. Alternatively, document explicitly in the OpenAPI spec and code comments that the 32-hex-character ID provides 128 bits of entropy and that brute-force is computationally infeasible, justifying no rate limit. Either way, the decision should be explicit.
  WHY: The plan correctly treats the capture ID as the access secret for status responses (including `captureUrl` on complete, which will eventually link to the full artifact bundle). With 128 bits of entropy the brute-force risk is negligible, but an unauthenticated endpoint with no rate limit is also an avenue for resource exhaustion (KV read amplification). A low rate limit (e.g., 60 req/min per IP) prevents abuse without impacting legitimate polling. The plan's silence on this creates an inconsistency between the auth model stated in the OpenAPI spec and the actual access controls in place.
  TASK: Task 6 (wrangler.toml rate limiting) and Task 5 (route handler)

---

- [security]: The `problemResponse(404, ...)` in `handleCaptureStatus` uses the capture ID from the match group in the detail message: `Capture ${match[1]} not found`. This reflects user-supplied input (the URL path) into the response body.
  SCOPE: `src/index.js` -- `handleCaptureStatus`, the 404 response detail string
  CHANGE: Use a static message: `return problemResponse(404, 'Capture not found')`. The capture ID is already in the URL path; repeating it in the response body adds no information value and creates a reflection point. The existing `src/responses.js` comment explicitly says "Never leak internals" and "never reflect user input" -- this pattern violates that convention.
  WHY: Reflecting path parameters into error bodies is a class of information disclosure (CWE-209) and, depending on downstream handling, can contribute to response injection. More importantly, it is inconsistent with the existing codebase convention (see `src/index.js` line 22 comment) and would introduce a pattern that future contributors may replicate for other IDs.
  TASK: Task 5

---

Note: The following risks are correctly identified and adequately handled in the plan:
- Timing-safe comparison using `crypto.subtle.timingSafeEqual` is specified (Task 2).
- `redirect: 'manual'` is mandated on `captureHeaders` fetch to prevent redirect-based SSRF exploitation.
- Browser context isolation (`createBrowserContext` per capture, destroyed in `finally`) is correctly specified.
- `Set-Cookie` redaction in captured headers is present.
- Security response headers (`Referrer-Policy`, `X-Content-Type-Options`) are centralized in the fetch handler.
- KV keys never appear in error responses (`capture:${captureId}` stays internal to `src/kv.js`).
- The captured HTML XSS risk is correctly backlogged for the retrieval endpoint (Step 5) rather than ignored.
- TOCTOU gap acceptance is documented and backlogged for holistic closure.
- `CAPTURE_API_KEY` is correctly specified as a wrangler secret (never in source or env files).

None of the above advisories are blockers. All are addressable within the implementation tasks as written.
