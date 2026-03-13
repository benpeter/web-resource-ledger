## Domain Plan Contribution: security-minion

### Recommendations

#### 1. Re-validate URL before the Workers `fetch` call -- do not trust prior result

**Verdict: Yes, re-validate. But the real mitigation is DNS pinning, not double-validation.**

The capture pipeline has two network-bound stages that use the validated URL:
(a) Browser Rendering navigates to it, and (b) a separate `fetch` retrieves
HTTP response headers. Between the initial `validateUrl` call and the `fetch`
call, DNS records can change (TOCTOU). But re-validating only narrows the
window -- it does not close it.

The correct approach is **DNS pinning on the `fetch` call**. The `validateUrl`
result already returns the resolved IP. When making the Workers `fetch` for
HTTP headers, construct the request URL with the resolved IP as the hostname
and pass the original hostname via the `Host` header. This eliminates
re-resolution entirely for the `fetch` leg.

```js
// DNS-pinned fetch for HTTP headers
const pinnedUrl = new URL(validated.url);
const originalHost = pinnedUrl.hostname;
pinnedUrl.hostname = validated.ip;
const resp = await fetch(pinnedUrl.toString(), {
  headers: { 'Host': originalHost },
  redirect: 'manual',  // do NOT follow redirects -- each hop needs re-validation
});
```

For the Browser Rendering leg, Chromium re-resolves DNS independently and does
not support connecting to a pre-resolved IP. This is the documented TOCTOU gap
(backlog item). The mitigation there is Puppeteer request interception:
intercept navigation requests and re-check the resolved IP via
`page.setRequestInterception(true)`. However, this adds complexity and the
backlog correctly defers it. For MVP, accept the Browser Rendering TOCTOU gap
but close it on the `fetch` leg.

**Critical: set `redirect: 'manual'` on the pinned fetch.** If the server
responds with a 3xx redirect, the `fetch` API would follow it to a new URL
that has not been validated. Redirects must be captured as-is (the redirect
itself is part of the HTTP response headers we want to record) -- never
followed.

#### 2. Browser isolation: incognito + timeout + size limits are necessary but not sufficient

The proposed controls (fresh incognito context, 30s timeout, 50MB page limit,
200 subresource cap) form a solid baseline. Additional hardening:

**Must-have for this step:**

- **Destroy the browser context in a `finally` block.** If the capture throws
  (timeout, crash, OOM), the context must still be destroyed. A leaked context
  retains cookies, localStorage, and open connections. Use try/finally:
  ```js
  const context = await browser.newContext();
  try {
    // ... capture logic
  } finally {
    await context.close();
  }
  ```

- **Disable JavaScript execution for the screenshot if feasible.** The
  screenshot is a visual record; JS execution enables the target page to
  detect it is being captured (via navigator properties, timing attacks) and
  serve different content. If the HTML capture requires JS (for rendered DOM),
  take the screenshot from the same page load -- do not navigate twice. But
  consider: the rendered DOM IS the JS-executed DOM, so JS must be on for HTML
  capture. The screenshot comes from the same page state. This is acceptable.

- **Block navigation to non-original-domain URLs.** A malicious page could use
  `window.location` or meta-refresh to redirect the browser to an internal URL
  after initial load. Use Puppeteer's request interception to block requests
  to hosts other than the validated target (or at minimum, re-run `isPrivateIP`
  on any new hostname the browser tries to resolve). This directly addresses
  the Browser Rendering TOCTOU gap for same-session redirects.

- **Set a viewport size explicitly.** Without this, the browser uses a default
  that may vary. Consistent viewport prevents content-dependent rendering
  differences.

**Should-have (can defer if scope is tight):**

- **Disable file download prompts / block non-document responses.** Prevent
  the browser from being tricked into downloading large binary files.

- **Block `ServiceWorker` registration.** A malicious page could register a
  ServiceWorker that persists in the browser context. Incognito context
  handles this (SW data is ephemeral), but explicitly blocking registration
  is defense in depth.

#### 3. Timing-safe API key comparison

**Use `crypto.subtle.timingSafeEqual` -- but handle the encoding correctly.**

The API key arrives as a string in the `Authorization: Bearer <key>` header.
`crypto.subtle.timingSafeEqual` operates on `ArrayBuffer`/`BufferSource`.
The implementation must:

1. Extract the token from the header (strip `Bearer ` prefix)
2. Encode both the provided token and the stored key to `Uint8Array` using
   `TextEncoder`
3. **Check lengths first** -- if lengths differ, return 401 immediately.
   Length comparison is not timing-sensitive (the length of the correct key
   is not secret; an attacker can determine it from documentation or by
   submitting keys of varying length and observing non-401 responses). The
   important thing is that when lengths match, the comparison is
   constant-time.
4. Call `crypto.subtle.timingSafeEqual` on the byte arrays

```js
function verifyApiKey(provided, expected) {
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}
```

**Do NOT use `===` for comparison.** String equality in V8 short-circuits on
the first differing byte, leaking key length and prefix information.

**Key source:** The `CAPTURE_API_KEY` must come from `env` (Cloudflare Worker
environment binding), never hardcoded. Verify it is set at startup and return
503 if missing (fail closed -- do not serve captures without auth).

**Missing key handling:** If `CAPTURE_API_KEY` is not configured in the
environment, the capture endpoint must return 503 (Service Unavailable), not
silently allow unauthenticated access. This is a fail-closed requirement.

#### 4. Capture ID enumeration and status oracle risks

**Enumeration risk: LOW, acceptable for MVP.**

`crypto.randomUUID()` produces 122 bits of entropy (UUIDv4). Even with
hyphens stripped, the ID space is 2^122 -- brute-force enumeration is not
feasible. The `cap_` prefix is static and adds zero entropy, but that is fine;
it serves as a type discriminator, not a security control.

**Status oracle risk: MEDIUM, requires mitigation.**

The status endpoint reveals whether a capture ID exists. An attacker who
obtains a partial ID (e.g., from a log leak or URL referrer) can confirm its
validity by querying the status endpoint. More importantly:

- **404 vs 200 oracle:** The difference between "ID not found" (404) and
  "capture pending/complete/failed" (200) confirms ID existence. This is
  acceptable because the ID IS the access secret (bearer-token-like model
  documented in MVP.md). Anyone with the ID is authorized.

- **Timing oracle on KV lookup:** KV `get` for existing vs non-existing keys
  may have measurable latency differences. This is not exploitable given the
  122-bit ID space -- the attacker cannot narrow the search space enough for
  timing to matter.

- **Status value oracle (pending vs complete vs failed):** This is by design.
  The status endpoint exists for polling. No mitigation needed.

**One real risk: log/referrer leakage of capture IDs.**

Since the ID is the sole access control, any leak of the ID grants full
access. Mitigations:

- **Never log capture IDs in plaintext.** If logging is added, hash or
  truncate IDs in log entries.
- **Set `Referrer-Policy: no-referrer` on all responses.** Prevents the
  capture ID from leaking via the `Referer` header when the user follows
  links from WRL pages.
- **Set `Cache-Control: private, no-store` on status responses.** Prevents
  intermediate caches (CDN, browser) from storing capture IDs.

### Proposed Tasks

#### Task S1: Timing-safe API key authentication module

**What:** Create `src/auth.js` exporting a `verifyApiKey(request, env)`
function that extracts the Bearer token, performs timing-safe comparison
against `env.CAPTURE_API_KEY`, and returns a result object (following the
`{ ok, status, detail }` pattern from `validateUrl`).

**Deliverables:**
- `src/auth.js` with `verifyApiKey` function
- Fail-closed behavior when `CAPTURE_API_KEY` is not set (return 503)
- Unit tests: correct key accepted, wrong key rejected, missing header
  returns 401, malformed header returns 401, missing env var returns 503,
  empty key returns 401

**Dependencies:** `src/responses.js` (for status/detail convention)

#### Task S2: DNS-pinned fetch for HTTP headers

**What:** Implement the Workers `fetch` call that retrieves HTTP response
headers using the IP from the `validateUrl` result instead of re-resolving
DNS. Must use `redirect: 'manual'` to prevent unvalidated redirect following.

**Deliverables:**
- Fetch helper function (could be in the capture handler or a utility module)
- `Host` header set to original hostname
- `redirect: 'manual'`
- Timeout on the fetch (separate from browser timeout; recommend 10s)
- Error handling: network errors, timeouts, non-2xx responses all result in
  capture status `failed` with a reason string in KV

**Dependencies:** Task S1 (auth must gate access before any fetch occurs),
`validateUrl` result providing the resolved IP

#### Task S3: Browser context lifecycle hardening

**What:** Ensure browser context is created and destroyed safely with proper
isolation controls.

**Deliverables:**
- Context creation with incognito isolation
- `try/finally` pattern for context destruction
- Request interception that re-checks `isPrivateIP` for any navigation
  to a host different from the validated target (addresses in-session
  redirect TOCTOU)
- 30s navigation timeout, 50MB page size limit, 200 subresource cap
- Explicit viewport size (e.g., 1280x720)
- All controls documented in code comments with threat references

**Dependencies:** Browser Rendering binding, `isPrivateIP` from
`src/url-validation.js`

#### Task S4: Security response headers and cache control

**What:** Add security headers to all capture and status endpoint responses.

**Deliverables:**
- `Referrer-Policy: no-referrer` on all responses (prevents capture ID leakage)
- `Cache-Control: private, no-store` on status endpoint responses
- `X-Content-Type-Options: nosniff` on all responses
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` on all
  responses (Cloudflare handles TLS, but HSTS prevents downgrade)
- Consider centralizing header injection in the Worker's fetch handler
  (after route dispatch) to avoid per-handler repetition

**Dependencies:** None (can be done in parallel with other tasks)

#### Task S5: Capture ID generation and KV status tracking security review

**What:** Review and harden the capture ID generation and KV status tracking
implementation.

**Deliverables:**
- Verify `crypto.randomUUID()` is used (not `Math.random()` or similar)
- KV key format: use a prefix like `capture:` to namespace capture data away
  from other KV uses
- KV value should include only non-sensitive metadata (status, timestamp,
  URL hash -- not the full URL, to limit exposure if KV is dumped)
- Alternatively, storing the full URL in KV is acceptable for MVP since KV
  access requires Worker-level credentials. Document the trust boundary.
- Validate capture ID format on the status endpoint (`/^cap_[a-f0-9]{32}$/`)
  to reject malformed IDs before hitting KV (defense in depth, reduces KV
  read costs from scanners)

**Dependencies:** None

### Risks and Concerns

#### RISK 1: Browser Rendering TOCTOU (MEDIUM, accepted for MVP)

Browser Rendering re-resolves DNS independently. A target with a short TTL
could return a public IP during validation and a private IP when the browser
connects. The `fetch` leg is mitigable with DNS pinning. The Browser Rendering
leg requires Puppeteer request interception (Task S3 partially addresses this
for same-session redirects, but not for the initial navigation). This is a
documented and accepted risk per the backlog.

#### RISK 2: Malicious page content in captured artifacts (MEDIUM)

Captured HTML and screenshots are stored in R2 and served back. If a malicious
page contains XSS payloads in its HTML, serving that HTML with
`Content-Type: text/html` to a verification consumer would execute the payload.
**All captured artifacts must be served with `Content-Disposition: attachment`
or with a `Content-Type` that prevents execution (e.g., `text/plain` for
HTML).** This is a Step 5 concern (retrieval endpoint) but should be
documented now.

#### RISK 3: Resource exhaustion via large pages (LOW-MEDIUM)

The 50MB page limit and 200 subresource cap are good. But a page could still
consume significant CPU (crypto mining JS, infinite loops) within the 30s
timeout window. Cloudflare's Worker CPU limits provide a backstop, but the
browser context runs outside the Worker's CPU budget. The practical mitigation
is the timeout -- 30s is the maximum cost per capture. Combined with rate
limiting (~10/min, ~3 concurrent per IP), the total resource exposure is
bounded.

#### RISK 4: Concurrent capture race conditions in KV (LOW)

If the same URL is submitted simultaneously, two captures proceed
independently. Each gets a unique ID, so there is no data corruption. The
risk is wasted resources, not security. Rate limiting (3 concurrent per IP)
mitigates this.

#### RISK 5: API key in logs or error messages (HIGH if it happens)

If any error path or logging statement includes the `Authorization` header
value, the API key is exposed. **The auth module must never log or include
the provided key in error responses.** Error messages should say
"Invalid or missing API key" -- never echo the provided value.

#### RISK 6: Workers `fetch` to DNS-pinned IP with TLS certificate mismatch (MEDIUM)

When fetching `https://1.2.3.4/path` with `Host: example.com`, the TLS
certificate is issued for `example.com` but the connection is to `1.2.3.4`.
Standard TLS validation will reject this. Options:
- Accept the mismatch for the header-fetch leg only (reduces TLS security
  for this specific call)
- Use the original URL (with hostname) for the fetch and accept the TOCTOU
  risk on this leg
- Use HTTP-only for the header fetch (loses nothing -- we are recording the
  response headers, not the content)

**Recommendation:** For MVP, use the original URL for the Workers `fetch`
and accept the minor TOCTOU risk on the header-fetch leg. The DNS pinning
approach has the TLS-SNI mismatch problem that requires either `cf.resolve`
overrides (Cloudflare-specific) or accepting broken TLS. The honest approach:
document that the header fetch has the same TOCTOU gap as Browser Rendering,
and close both gaps together in the backlog item. Do NOT disable TLS
validation to force DNS pinning to work.

**Revised recommendation for Task S2:** Use the validated URL as-is for the
`fetch` call. Do set `redirect: 'manual'`. The TOCTOU gap on this leg is
identical to the Browser Rendering gap and should be addressed holistically
when the backlog item is tackled.

### Additional Agents Needed

None. The current team is sufficient for planning. The security concerns
raised here can be addressed within the existing task structure. The one
caveat: when the capture handler is implemented, the **test-minion** should
write tests that verify:
- Auth bypass attempts (missing header, wrong key, empty key, Bearer prefix
  variations)
- DNS-pinned fetch does not follow redirects
- Browser context is destroyed even when capture fails
- Capture IDs are validated on the status endpoint before KV lookup
- Error responses never contain the API key or internal state
