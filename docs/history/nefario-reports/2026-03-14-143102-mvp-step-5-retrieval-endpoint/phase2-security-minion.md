## Domain Plan Contribution: security-minion

### Recommendations

#### 1. Serving `rendered.html` -- XSS Prevention

The backlog item is correct and must be addressed in this step, not deferred
further. `rendered.html` contains attacker-controlled content (arbitrary
web page markup rendered by a headless browser). Serving it as `text/html`
without a sandboxing boundary would make WRL a stored-XSS delivery vector:
any browser opening the artifact URL would execute whatever script the
captured page contained.

**Required approach: serve as `text/plain` with `Content-Disposition: attachment`.**

Both controls are needed as defense-in-depth:

- `Content-Type: text/plain` tells the browser not to parse the content as HTML,
  preventing script execution even if `Content-Disposition` is stripped by a proxy.
- `Content-Disposition: attachment; filename="rendered.html"` forces a download
  dialog rather than inline rendering, even if a future code path accidentally
  passes `text/html`.
- `X-Content-Type-Options: nosniff` (already set at the response layer in
  `index.js`) prevents MIME sniffing that could override the `text/plain` declaration.

Do not serve `rendered.html` as `text/html` under any circumstances -- not even
with a CSP header. A `sandbox` CSP attribute might seem like a mitigation, but
it has browser-specific edge cases and adds complexity with no benefit here.
The content is a forensic artifact, not a document meant to be rendered by
end users.

The other artifacts (`screenshot.png`, `headers.json`) have no equivalent XSS
surface: PNG is never executed, and `headers.json` served as `application/json`
with `nosniff` is safe.

For the WACZ bundle, it already sets `Content-Disposition: attachment` in
`capture.js` at R2 write time (`httpMetadata`). That pattern is correct; extend
it to `rendered.html` at write time as well for belt-and-suspenders coverage.

**Do not serve artifacts directly from a public R2 URL without controlling
these headers.** If artifacts are served via R2 public bucket URLs, the R2
object metadata written in `capture.js` must set the correct `contentType`
and `contentDisposition` at write time. The retrieval handler cannot override
R2 public bucket headers after the fact. Set them at write time in `capture.js`.

#### 2. Capture ID as Access Secret -- Is It Sufficient?

The current capture ID is `cap_` + `crypto.randomUUID().replace(/-/g, '')`,
producing `cap_[a-f0-9]{32}`. `crypto.randomUUID()` uses a CSPRNG, giving 122
bits of randomness (the UUID v4 variant). This is well above the 80-bit
threshold for brute-force resistance at rest and exceeds NIST SP 800-131A
recommendations for secret tokens.

The ID-as-secret model is acceptable for MVP under these conditions (all of
which are currently met or must be met):

1. **No enumeration surface**: there is no list endpoint and the status
   endpoint requires the full ID with regex validation
   (`cap_[a-f0-9]{32}`). This must remain true. If a list endpoint is added
   later (backlog item), it will require authentication gating.

2. **No ID disclosure in logs**: the existing `SECURITY` comment in
   `index.js` (`do NOT echo captureId back in response body`) must also apply
   to server-side logs. Log the capture event, not the full ID, or hash it for
   correlation without exposure.

3. **No sequential IDs or predictable patterns**: `crypto.randomUUID()` is
   non-sequential and non-guessable. This is fine.

4. **HTTPS only**: the ID travels over TLS. If served over HTTP, it would be
   trivially sniffable and the access-secret model would collapse. Ensure
   Cloudflare enforces HTTPS-only (already the case for Workers).

5. **Cache-Control**: the status endpoint already sets `private, no-store`.
   The retrieval endpoint must set the same header. If a CDN or reverse proxy
   caches a capture response keyed by ID, that ID becomes publicly reachable
   without knowing the secret.

**Additional mitigation worth noting but not required for MVP**: the 404
response for unknown IDs must be returned in constant time. The KV get
is inherently constant-time at the network layer (same round-trip regardless
of hit/miss), so this is satisfied without extra work. Do not add any
early-exit logic that would create a timing difference between "invalid format"
and "valid format but not found."

The 32-hex UUID pattern is sufficient. No token upgrade is needed for MVP.

#### 3. Information Disclosure -- Fields to Exclude from API Response

The KV record shape is:

```
pending:  { status, url, ip, captureId, createdAt }
complete: { ...pending, status: 'complete', completedAt, artifacts, [wacz] }
failed:   { ...pending, status: 'failed', failedAt, error, retryable }
```

**Fields that must NOT appear in the `GET /v1/captures/{id}` response:**

- **`ip`**: The resolved IP at submission time. This is internal infrastructure
  information (the IP of the target server at capture time). Exposing it leaks
  network topology, aids reconnaissance of the target, and depending on
  jurisdiction may constitute processing of personal data without a valid basis
  (GDPR consideration for IPs attributed to individuals). Strip it.

- **`artifacts.html` / `artifacts.screenshot` / `artifacts.headers` as raw R2 keys**:
  The internal R2 key paths (`captures/{captureId}/screenshot.png`, etc.) must
  not be returned as-is. They expose the internal storage layout and bucket
  naming convention. Return artifact URLs instead -- either pre-signed R2 URLs
  or Worker-proxied URLs -- never raw R2 keys.

- **`wacz.key`**: Same as above. The R2 key for the WACZ file is an internal
  path. Expose a URL, not the key.

- **`wacz.bundleHash`** and **`wacz.size`**: These are safe to expose -- they
  are verification-relevant metadata that a caller can use to confirm
  integrity and know what they're downloading.

**Fields that ARE safe and useful to return:**

```
id, status, url, createdAt, completedAt (if complete), failedAt (if failed),
error (if failed), retryable (if failed), artifacts (as URLs, not keys),
wacz.bundleHash, wacz.size
```

**Artifact URL strategy -- decision required:**

Two options exist:

Option A: **Pre-signed R2 URLs** with short TTL (e.g., 1 hour). These give
time-limited direct access to R2 without proxying. They expose the bucket domain
name (`*.r2.cloudflarestorage.com` or a custom domain) but not internal key
paths if the URL is opaque enough. Preferred if the bucket has a custom domain.
The TTL decision should be documented: short TTL means the caller must re-fetch
the capture metadata before each artifact download; long TTL means the URL could
be shared and persist longer than intended.

Option B: **Worker-proxied URLs** (e.g., `/v1/captures/{id}/artifacts/screenshot`).
These keep all R2 access internal to the Worker, allow the Worker to enforce
access control and set correct response headers at serve time, and never expose
R2 internals. Slightly more latency than direct R2. This is the architecturally
cleaner choice and aligns with the existing routing pattern.

For MVP, Worker-proxied URLs are recommended. They avoid the pre-signed URL TTL
complexity, keep access control in one place (the Worker), and allow header
control (critical for `rendered.html` XSS prevention). The performance impact
is negligible at this scale.

**Whatever option is chosen, it must be documented in the response schema** as
the issue specifies: "document the choice" and note that "the capture ID acts
as the access secret."

#### 4. CORS for the Retrieval Endpoint

The backlog notes CORS as a `[should]`: "verification endpoint should allow `*`,
capture endpoint restrict origins." The retrieval endpoint is a de facto
verification endpoint -- a caller who knows the ID needs to retrieve the
capture. Given the ID-as-secret model, a wildcard CORS policy on retrieval is
acceptable because possession of the ID IS the authorization. A CORS restriction
would only prevent browser-based clients from retrieving captures, not
server-side callers.

Recommended: `Access-Control-Allow-Origin: *` on `GET /v1/captures/{id}`.
No credentials are involved (no cookies, no auth header required), so wildcard
CORS is safe here. Document this in the handler.

#### 5. 404 Response -- RFC 9457

The issue requires RFC 9457 format for 404s. The existing `problemResponse()`
helper already produces RFC 9457 responses (as used by `handleCaptureStatus`).
Use the same helper. The body must use a static string -- do not reflect the
capture ID or any input into the error detail field. The existing `SECURITY`
comment in `handleCaptureStatus` (line 122) establishes this pattern correctly.

---

### Proposed Tasks

**Task 1: Set correct R2 metadata for `rendered.html` at write time**

- In `capture.js`, add `httpMetadata` to the `env.BUCKET.put` call for
  `rendered.html`, setting `contentType: 'text/plain'` and
  `contentDisposition: 'attachment; filename="rendered.html"'`.
- Dependency: must be in the same PR as the retrieval endpoint. Serving the
  artifact from R2 public URLs before this is in place would be a live XSS
  vulnerability.
- Deliverable: modified `capture.js` R2 put call with httpMetadata.

**Task 2: Implement `GET /v1/captures/{id}` with sanitized response**

- Add route `['GET', /^\/v1\/captures\/(cap_[a-f0-9]{32})$/, handleGetCapture]`
  to the routes array.
- Handler reads KV, returns RFC 9457 404 for missing records using
  `problemResponse(404, 'Capture not found')` (static string, no ID reflection).
- Response body includes: `id`, `status`, `url`, `createdAt`, and
  status-specific fields (`completedAt`/`artifacts` for complete, `failedAt`/
  `error`/`retryable` for failed).
- Response body excludes: `ip`, raw R2 keys (`artifacts.screenshot` etc. as
  storage paths, `wacz.key`).
- Set `Cache-Control: private, no-store` on all responses.
- Set `Access-Control-Allow-Origin: *` (CORS for verification use case).
- Deliverable: `handleGetCapture` function in `index.js`.

**Task 3: Artifact URL generation (Worker-proxied)**

- Artifact fields in the response should be absolute Worker URLs, not R2 keys.
  Example: `https://worker.example.com/v1/captures/{id}/artifacts/screenshot`.
- Add stub routes for artifact serving (can return 501 Not Implemented if
  artifact serving is out of scope for this step), OR generate R2 pre-signed
  URLs if Worker proxying is deferred.
- If pre-signed URLs are used: document the TTL choice and note in the response
  schema that URLs expire.
- If Worker-proxied: the artifact routes must enforce `Content-Type: text/plain`
  and `Content-Disposition: attachment` for `rendered.html` specifically.
- Deliverable: documented artifact URL strategy in `docs/evolution/` for this
  phase; URL generation logic in the handler.

**Task 4: Document access model in response schema**

- The issue explicitly requires documenting that the capture ID is the access
  secret and that no authentication is required on this endpoint.
- Add a comment block to `handleGetCapture` explaining this, consistent with
  the `SECURITY:` comment pattern already in `index.js`.
- Deliverable: comment block in handler, note in evolution log.

---

### Risks and Concerns

**Risk 1 (HIGH): XSS if `rendered.html` is served as `text/html`**

If the R2 object is written without `contentType: text/plain` and served via a
public bucket URL, a caller opening that URL in a browser will execute whatever
JavaScript the captured page contained. This is a live stored-XSS vector. Any
deployment that exposes R2 artifacts publicly before Task 1 is complete is
vulnerable. The fix must be in the same deployment as the retrieval endpoint.

**Risk 2 (MEDIUM): R2 keys in response reveal storage layout**

If the handler naively spreads the KV record into the response
(`JSON.stringify(record)`), internal R2 key paths and the `ip` field will be
exposed. The handler must explicitly construct the response object. Do not use
spread operators on the raw KV record.

**Risk 3 (MEDIUM): Pre-signed URL TTL creates usability vs. security tradeoff**

If pre-signed URLs are chosen over Worker proxying, a short TTL (e.g., 1 hour)
means a stored capture URL will expire and require a fresh GET to obtain a
new link. Callers who cache the artifact URL will get 403s from R2 after
expiry. Document this behavior clearly. A long TTL undermines the access-secret
model by creating long-lived public links.

**Risk 4 (LOW): Capture ID logged in server-side telemetry**

If the Cloudflare Worker logs request URLs (which would include the capture ID
in the path), the ID-as-secret is exposed in log infrastructure. Review what
Cloudflare Workers Logpush captures for URL paths and confirm it's restricted
to internal/trusted log access. This is an operational concern, not a code
change for this PR.

**Risk 5 (LOW): Cache headers missing on 404 responses**

If a CDN or Cloudflare cache caches a 404 for a pending capture (one that will
later become complete), callers would get stale 404s. The `problemResponse()`
helper should set `Cache-Control: no-store` on 404 responses. Verify this is
the case, or add the header explicitly in the handler.

---

### Additional Agents Needed

None. The three questions are architectural decisions that can be resolved with
the current security guidance. The implementation is straightforward enough that
a dedicated agent beyond the standard coding role is not required.

The CORS decision could benefit from api-design-minion review if there are
concerns about the wildcard policy interacting with future authentication
requirements, but given the ID-as-secret model and the verification-endpoint
use case, the security analysis is clear enough to proceed without it.
