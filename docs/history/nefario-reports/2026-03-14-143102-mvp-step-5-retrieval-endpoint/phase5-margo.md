# Margo Review -- MVP Step 5: Retrieval Endpoints

VERDICT: APPROVE

## Assessment Summary

The change set is proportional to the task. Two new handlers (~95 lines of
application code), one new test file (157 lines), one lifecycle smoke test
(48 lines), a small httpMetadata fix in capture.js (5 lines), and the
corresponding OpenAPI documentation. No new dependencies, no new abstraction
layers, no speculative features. The code is flat, direct, and easy to follow.

**Complexity budget impact**: zero new dependencies, zero new abstraction
layers, zero new services. The only additions are two route handlers and
their tests. Well within budget.

## Findings

- [NIT] `src/index.js`:203 -- `const buffer = await obj.arrayBuffer()`
  materialises the entire artifact into Worker memory before sending. For
  screenshots and WACZ bundles this could be multiple megabytes. R2 `get()`
  returns a ReadableStream via `obj.body` that can be passed directly to
  `new Response(obj.body, ...)`, which streams without buffering.
  AGENT: implementation minion
  FIX: Replace `const buffer = await obj.arrayBuffer(); return new Response(buffer, ...)` with `return new Response(obj.body, ...)`. The `Content-Length` header is already available from `obj.size`, so no buffering is needed to know the length. This is not a premature optimisation -- it is the correct use of the R2 API and avoids an unnecessary memory copy on every artifact download.

- [NIT] `openapi.yaml`:103-168 -- CaptureArtifacts and WaczInfo schemas are
  well-structured but verbose (66 lines for 6 fields). The descriptions are
  thorough and security-relevant (XSS warnings on the HTML artifact, redaction
  notes on headers), so the verbosity is justified. No action needed -- noting
  for the record that this is essential complexity, not accidental.
  AGENT: n/a
  FIX: none

- [ADVISE] `src/index.js`:189-201 -- The `contentTypes` and `filenames` maps
  inside `handleGetCaptureArtifact` are fine for four artifacts. If this grows
  beyond ~6-7 entries, extract to a module-level constant. For now, inline is
  the right call -- flagging only so it does not drift into a sprawling lookup
  without anyone noticing.
  AGENT: implementation minion
  FIX: No change now. If artifact types grow, extract to module scope.

## What I checked and found clean

1. **No YAGNI violations.** Both handlers do exactly what the task requires:
   metadata retrieval and artifact download. No configuration options, no
   pagination, no filtering, no query parameters, no accept-header content
   negotiation. Clean.

2. **No unnecessary abstractions.** Handlers call `getCapture()` directly
   from `kv.js` and `env.BUCKET.get()` directly from R2. No service layer,
   no repository pattern, no adapter. Correct for this stage.

3. **No dependency additions.** Zero new imports beyond what already existed.

4. **Security is inline, not over-layered.** The `record.status !== 'complete'`
   guard, the static 404 message, the `text/plain` content type for HTML, and
   the `Content-Disposition: attachment` header are all applied directly in the
   handler. No security middleware abstraction -- appropriate for two handlers.

5. **Test coverage is proportional.** 14 tests for the retrieval endpoints
   plus 1 lifecycle smoke test. Tests cover the happy path, missing/malformed
   IDs, absent optional artifacts, pending captures, security headers, and
   XSS-prevention content types. No test framework additions, no test helpers
   beyond what already existed.

6. **OpenAPI additions match the code exactly.** The schemas, examples, and
   response codes in openapi.yaml correspond 1:1 to what the handlers return.
   No speculative schemas for unimplemented features.

7. **capture.js change is minimal and correct.** Adding `httpMetadata` with
   `contentType: 'text/plain'` and `contentDisposition: 'attachment'` to the
   rendered.html R2 put ensures the artifact is served safely even if accessed
   directly via R2 (defence-in-depth alongside the Worker's own headers).
