## Security Review: Static Verification Page (Phase 3.5)

ADVISE

---

- [security]: The `<img>` alt text attribute is set using fetched data (`url` and `date` from retrieval endpoint), but the plan's prohibition on `innerHTML` does not explicitly cover `setAttribute` on `alt`. The task prompt says "ONLY `textContent` or `setAttribute`" -- this is correct, but the implementation guidance must be explicit that `setAttribute('alt', ...)` on user-controlled URL strings is safe ONLY because HTML attribute context does not execute script. The real risk is that `setAttribute('src', screenshotUrl)` could be set to a `javascript:` URL if the screenshotUrl returned by the retrieval endpoint were attacker-controlled. The screenshot URL comes from the same-origin retrieval endpoint, so this is low likelihood, but the plan should add explicit screenshot URL scheme validation (same `http:`/`https:` check already prescribed for `capture.url`) for defense-in-depth.
  SCOPE: `src/verify-page.js` -- client-side JS, screenshot `<img>` src assignment
  CHANGE: Before `img.src = screenshotUrl`, validate that `screenshotUrl` starts with the expected same-origin prefix (e.g., `new URL(screenshotUrl).origin === window.location.origin`) or at minimum passes the `http:`/`https:` scheme check. Apply the same scheme validation already required for the captured URL's `<a href>`.
  WHY: LLM output (and retrieval endpoint responses) should be treated as untrusted input per LLM05. A compromised or misconfigured retrieval response containing a `data:` or `javascript:` URL in `artifacts.screenshot` would result in that value landing in `img.src`. Defense-in-depth at the assignment site is cheap and consistent with the URL scheme check already prescribed for the `<a>` href.
  TASK: Task 1

---

- [security]: The content negotiation check (`accept.includes('text/html')`) is intentionally simple and the plan documents this as a deliberate YAGNI decision. However, one edge case is unaddressed: a request with `Accept: text/html;q=0` (explicit refusal of HTML) will still match the substring check and return HTML. This is a correctness issue and a minor cache-correctness issue: the response served does not match what the client requested, and `Vary: Accept` does not help when the cache key logic diverges from actual content negotiation.
  SCOPE: `src/index.js` -- content negotiation logic in `handleVerifyCapture`, Task 2 prompt
  CHANGE: Explicitly document in the Task 2 prompt that `text/html;q=0` is an accepted known limitation for MVP, OR add a secondary check: only branch to HTML if `text/html` appears in Accept without `q=0`. A regex like `/text\/html(?!;q=0)/.test(accept)` is still simple and handles the main case.
  WHY: `text/html;q=0` is sent by some API clients to explicitly opt out of HTML. Serving HTML in response is a cache correctness problem -- a cache that stores this response keyed on `Vary: Accept` may incorrectly serve HTML to a subsequent `application/json` request if the `Vary` header is not handled exactly right by the CDN. For MVP the impact is low, but documenting the known limitation prevents a future bug report from being misread as a vulnerability.
  TASK: Task 2

---

- [security]: The `Vary: Accept` instruction correctly requires the header on both HTML and JSON response paths. However, the plan does not address the 200 path for an **unverified** capture. Looking at `src/index.js` lines 286-293: when `result.verified` is false, `cacheControl` is `no-store`. The HTML branch in Task 2 reuses this `cacheControl` value for the HTML response. This means an unverified capture returns `Cache-Control: no-store` on both paths, which is correct. But if `no-store` is set, the CDN will not cache the response, meaning `Vary: Accept` has no effect and cache poisoning is not possible. This is fine. Confirming the plan is correct here -- no change needed, but the test in Task 4 (case #19/20, cache parity) should assert that an **unverified** capture also has `no-store` on the HTML path, not just the JSON path. This is currently not explicitly called out in Task 4's test cases.
  SCOPE: `test/verify-html.test.js` -- Task 4 test cases for cache-control on unverified captures
  CHANGE: Add a test case: HTML response for an **unverified** capture has `Cache-Control: no-store`. The existing test cases #19-20 only describe the verified case ("verified capture has `public, max-age=...`"). The unverified HTML path is not tested.
  WHY: If the cacheControl parameter passing from `handleVerifyCapture` to `htmlVerifyResponse` is accidentally hardcoded to a public value (a plausible copy-paste error given the main template shows the public value), an unverified result would be publicly cached and served to browsers without re-verification. This is the exact cache poisoning risk the `Vary: Accept` + `cacheControl` parameter design was built to prevent.
  TASK: Task 4

---

- [security]: The `<noscript>` fallback interpolates `captureId` and `origin` directly into the HTML template string server-side (acknowledged in the plan as safe because `captureId` is regex-validated). The plan requires `escapeHtml(captureId)` even though it is hex-safe (defense-in-depth). The `origin` parameter is derived from `new URL(request.url).origin` in Task 2's integration code. This is safe in the Cloudflare Workers context because `request.url` is the trusted incoming URL, and `.origin` cannot contain HTML-significant characters in a valid URL. However, if a future refactor passes an externally-sourced origin string, the `origin` interpolated into the HTML `<a href>` in `<noscript>` would be an injection point. The plan should require `escapeHtml(origin)` in the noscript block for the same defense-in-depth reason it requires `escapeHtml(captureId)`.
  SCOPE: `src/verify-page.js` -- `<noscript>` block template interpolation of `origin`
  CHANGE: Apply `escapeHtml(origin)` to the origin value when it is interpolated into the noscript `<a href>` and surrounding text, parallel to the required `escapeHtml(captureId)` treatment.
  WHY: Defense-in-depth. `origin` is trusted today but the escaping requirement in the plan applies the principle that all server-side-interpolated values should be HTML-escaped regardless of current validation guarantees. Inconsistent escaping (captureId escaped, origin not) creates a maintenance hazard where future reviewers may not understand why one was treated specially.
  TASK: Task 1

---

All four advisories are low-to-medium severity with clear, cheap fixes. No blocking issues. The plan's core security architecture -- `textContent`-only DOM insertion, URL scheme validation for `<a href>`, `escapeHtml` for server-side interpolation, `Vary: Accept` on both response paths, and CSP `default-src 'none'` -- is sound.
