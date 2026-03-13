# 0005: Capture Endpoint Outcome

## What Was Produced

### New source files

| File | Lines | Purpose |
|------|-------|---------|
| `src/auth.js` | 82 | Timing-safe Bearer token verification; discriminated result object |
| `src/kv.js` | 99 | KV access layer; pending/complete/failed lifecycle; 24h TTL on pending |
| `src/capture.js` | 226 | Browser rendering pipeline; injectable renderer; R2 artifact storage |
| `openapi.yaml` | 380 | Contract-first OpenAPI 3.1 spec for all three endpoints |

### Modified source files

| File | Change |
|------|--------|
| `src/index.js` | Route table extended with `POST /v1/captures` and `GET /v1/captures/{id}/status`; security headers centralized in fetch handler |
| `src/responses.js` | 415 response title corrected |
| `wrangler.toml` | Rate limiting rule (~10 req/min via `CAPTURE_RATE_LIMITER`), R2 bucket binding (`BUCKET`), KV namespace IDs |
| `vitest.config.js` | `CAPTURE_API_KEY` binding added; `isolatedStorage: true` for KV test isolation |

### New test files

| File | Tests | Coverage |
|------|-------|---------|
| `test/auth.test.js` | auth pipeline | Missing header, wrong scheme, bad key, correct key, misconfigured env, timing-safe path |
| `test/kv.test.js` | KV lifecycle | create/complete/fail transitions; missing record guard; TTL on pending |
| `test/capture.test.js` | capture pipeline | Renderer injection; render failure categorization; header fetch; R2 storage; KV transitions |
| `test/capture-integration.test.js` | route handlers | POST /v1/captures and GET /v1/captures/{id}/status end-to-end |

### Dependency added

- `@cloudflare/puppeteer` -- Cloudflare's Puppeteer fork for the Browser Rendering API

## Endpoints

### POST /v1/captures

Accepts `{ url }` JSON body. Authenticates via `Authorization: Bearer`. Validates URL via
existing `validateUrl` (SSRF prevention). Generates `cap_` + 32 hex chars capture ID (122-bit
entropy). Writes pending KV record. Fires `ctx.waitUntil(performCapture(...))`. Returns 202:

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "statusUrl": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status",
  "note": "No list endpoint is available. Store the capture ID -- it is the only way to access this capture."
}
```

Response includes `Retry-After: 5`.

### GET /v1/captures/{id}/status

No authentication required (capture ID is the access secret). Returns 200 with state-conditional
body. Pending response includes `Retry-After: 5`. All status responses carry
`Cache-Control: private, no-store`.

### Capture pipeline (background)

`performCapture` runs in `ctx.waitUntil()`:
1. Concurrent: `defaultRenderer(BROWSER, url)` + `captureHeaders(url)`
2. On render failure: categorize error, call `failCapture()`, return
3. On render success: store screenshot, HTML, and (if available) headers to R2 under
   `captures/{captureId}/`
4. Call `completeCapture()` with R2 keys as artifact paths

Header fetch uses `redirect: 'manual'` to avoid following redirects to unvalidated URLs.
Set-Cookie values are redacted in the stored headers JSON.

## Constraints and Known Limitations

**ctx.waitUntil() 30-second budget**: Navigation timeout is 25 seconds; 5 seconds remain for
R2 writes and KV updates. Pages that take longer than 25 seconds to reach `networkidle2` will
produce a timeout failure (retryable).

**Screenshot height cap**: Pages taller than 8000px are capped at 8000px in the viewport
before the screenshot. Content below the cap is not captured.

**TOCTOU gap (both legs)**: `validateUrl` resolves DNS once; the Browser Rendering API
re-resolves independently. The `captureHeaders` fetch also uses the original hostname. Both legs
have the same TOCTOU gap documented in the 0003 outcome. Mitigation is accepted risk for MVP.

**Concurrency**: No application-level concurrency guard. The Browser Rendering platform
imposes its own cap; excess requests produce errors recorded as failed captures.

## Deferred Items

- **Queue migration**: `ctx.waitUntil()` has a 30-second hard limit. Cloudflare Queue with a
  consumer Worker provides 15-minute processing time. Migration path when slow-page timeouts
  become recurring.
- **Cross-domain navigation blocking in browser**: Puppeteer request interception is implemented
  for subresource counting but does not block navigations to cross-domain URLs (TOCTOU
  defense-in-depth). Accepted risk for MVP.
- **Captured HTML XSS**: Serving stored HTML as `text/html` at a retrieval endpoint enables XSS.
  Must serve as `text/plain` or with `Content-Disposition: attachment`. Issue for the retrieval
  endpoint (not yet built).
- **Per-tenant rate limiting**: Rate limit currently keys on `CF-Connecting-IP`. Should key on
  tenant ID when per-tenant API keys are added.

## Backlog Changes

### Partially addressed

**Rate limit headers in responses** (`[should]`, API section): `Retry-After` is now present
on 429 (rate limit exceeded) and 202/pending status responses. `X-RateLimit-*` headers
(limit, remaining, reset) are still not implemented. Item updated to reflect partial
implementation.

### New items added

**Queue migration for capture processing** (`[should]`, Operations/API): `ctx.waitUntil()` has
a 30-second hard limit; Cloudflare Queue gives 15-minute processing budget. Add when captures
of slow pages reliably time out. (edge-minion, capture-endpoint)

**Puppeteer request interception for cross-domain navigation blocking** (`[should]`, Security):
Defense-in-depth against TOCTOU gap in browser session. Request interception is in place for
subresource counting but does not block cross-domain navigations. Currently accepted risk.
(security-minion, capture-endpoint)

**Captured HTML XSS prevention** (`[should]`, Security): Serving captured HTML as `text/html`
enables stored XSS. Must serve as `text/plain` or with `Content-Disposition: attachment` at the
retrieval endpoint. (security-minion, capture-endpoint)

**Screenshot height cap is 8000px** (`[consider]`, Capture Fidelity): Pages taller than 8000px
produce capped screenshots. May need configurable viewport height. (edge-minion, capture-endpoint)

**Per-tenant rate limiting** (`[consider]`, API): Current rate limit uses `CF-Connecting-IP`;
should switch to tenant ID when per-tenant keys are added. (edge-minion, capture-endpoint)

### Existing item updated

**TOCTOU gap mitigation** (`[should]`, Security): Updated to note that both the browser
rendering leg and the `captureHeaders` fetch leg share the same gap and should be addressed
together when mitigation is implemented.
