## Context

You are working on `web-resource-ledger`, a Cloudflare Worker. The existing
`src/index.js` has three routes (health, create capture, capture status).
You are adding two new routes to close the capture lifecycle:

- `GET /v1/captures/{captureId}` -- returns capture metadata and artifact links
- `GET /v1/captures/{captureId}/artifacts/{name}` -- proxies artifact bytes from R2

The KV record shape (from `src/kv.js`) is:
```
complete: {
  status: 'complete',
  url: string,
  ip: string,          // MUST NOT appear in response (strip this)
  captureId: string,
  createdAt: ISO 8601,
  completedAt: ISO 8601,
  artifacts: {
    screenshot: string,  // R2 key, e.g. captures/{id}/screenshot.png
    html: string,        // R2 key, e.g. captures/{id}/rendered.html
    headers?: string,    // R2 key, optional
  },
  wacz?: {
    key: string,         // R2 key (do NOT expose in response)
    bundleHash: string,
    size: number,
  }
}
```

The existing `getCapture(kv, captureId)` function in `src/kv.js` is already
imported. `problemResponse` and `jsonResponse` are imported from
`src/responses.js`. Follow all patterns established in the existing code.

## Route 1: GET /v1/captures/{captureId}

Add to the routes array (before the catch-all, after the status route):
```js
['GET', /^\/v1\/captures\/(cap_[a-f0-9]{32})$/, handleGetCapture],
```

Note: this pattern must be ordered BEFORE the artifacts route to avoid
shadowing. Check that the status route `/status` suffix prevents collision.
The routes array already has the status route with the `/status` suffix, so
there is no collision.

Handler logic for `handleGetCapture(request, env, ctx, match)`:
1. Extract `captureId` from `match[1]`
2. Call `getCapture(env.KV, captureId)` -- the existing function
3. If null OR `record.status !== 'complete'`: return
   `problemResponse(404, 'Capture not found')` with `Cache-Control: no-store`
   - SECURITY: single static message for all non-200 cases (no enumeration of
     whether the ID exists)
4. Build the response body. Field mapping:
   - `id`: from `record.captureId`
   - `status`: `"complete"` (const)
   - `url`: from `record.url`
   - `createdAt`: from `record.createdAt`
   - `completedAt`: from `record.completedAt`
   - `artifacts`: object with named URL fields (NOT R2 keys):
     - `screenshot`: absolute worker-proxied URL
     - `html`: absolute worker-proxied URL
     - `headers`: absolute worker-proxied URL (only if `record.artifacts.headers` is present)
   - `wacz` (if `record.wacz` is present):
     - `url`: absolute worker-proxied URL
     - `size`: from `record.wacz.size`
     - `bundleHash`: from `record.wacz.bundleHash`
   - DO NOT include: `ip`, raw R2 keys (`record.artifacts.screenshot` value),
     `record.wacz.key`, or any other internal fields
5. Construct artifact URLs using:
   ```js
   const base = new URL(request.url).origin;
   const artifactBase = `${base}/v1/captures/${captureId}/artifacts`;
   ```
   Then: `screenshot: \`${artifactBase}/screenshot\``, etc.
   For WACZ: `url: \`${artifactBase}/wacz\``
6. Set response headers: `Cache-Control: private, no-store`,
   `Access-Control-Allow-Origin: *`
   (CORS wildcard is safe -- the capture ID is the only credential)
7. Return `jsonResponse(body, 200, headers)`

Add a SECURITY comment block above the function (consistent with the pattern
used above `handleCaptureStatus`):
```js
// SECURITY: No authentication required -- capture ID acts as the access secret.
// Response MUST NOT include: ip, raw R2 keys (artifacts.* values, wacz.key).
// Static 404 message for all non-200 cases -- no enumeration of ID existence.
// Cache-Control: private, no-store prevents caching of access-secret responses.
```

## Route 2: GET /v1/captures/{captureId}/artifacts/{name}

Add to routes array (AFTER the getCapture route, more specific paths first):
```js
['GET', /^\/v1\/captures\/(cap_[a-f0-9]{32})\/artifacts\/(screenshot|html|headers|wacz)$/, handleGetCaptureArtifact],
```

The regex restricts `{name}` to exactly the four valid artifact names. Any
other name hits the catch-all 404 without reaching the handler.

Handler logic for `handleGetCaptureArtifact(request, env, ctx, match)`:
1. Extract `captureId` from `match[1]`, `artifactName` from `match[2]`
2. Call `getCapture(env.KV, captureId)`
3. If null OR `record.status !== 'complete'`: return `problemResponse(404, 'Capture not found')` with
   `Cache-Control: no-store`
   - SECURITY ADVISORY: artifact handler MUST check status === 'complete' same as metadata endpoint
4. Resolve the R2 key from the KV record:
   The KV artifacts object keys are: `screenshot`, `html`, `headers`.
   The artifact name param is: `screenshot`, `html`, `headers`, `wacz`.
   Mapping is direct for screenshot/html/headers. For wacz: use `record.wacz.key`.
   ```js
   const r2Key = artifactName === 'wacz'
     ? record.wacz?.key
     : record.artifacts?.[artifactName];
   ```
5. If the resolved R2 key is undefined/null: return
   `problemResponse(404, 'Capture not found')` with `Cache-Control: no-store`
   (covers: wacz not present, headers not present)
6. Fetch from R2: `const obj = await env.BUCKET.get(r2Key)`
7. If obj is null: return `problemResponse(404, 'Capture not found')` with
   `Cache-Control: no-store`
   - SECURITY ADVISORY: Cache-Control: no-store on ALL error paths
8. Determine Content-Type. This dispatch table is exhaustive -- the regex
   already constrains to four names, but be explicit:
   ```js
   const contentTypes = {
     screenshot: 'image/png',
     html:       'text/plain',       // CRITICAL: never text/html (XSS)
     headers:    'application/json',
     wacz:       'application/wacz+zip',
   };
   const ct = contentTypes[artifactName] ?? 'application/octet-stream';
   ```
9. Determine filename for Content-Disposition:
   ```js
   const filenames = {
     screenshot: 'screenshot.png',
     html:       'rendered.html',
     headers:    'headers.json',
     wacz:       'bundle.wacz',
   };
   ```
10. Return a Response streaming the R2 object body with headers:
    - `Content-Type`: from dispatch table above
    - `Content-Disposition`: `attachment; filename="${filenames[artifactName]}"`
    - `Content-Length`: `String(obj.size)`
    - `Cache-Control`: `public, max-age=31536000, immutable`
      (captures are content-addressed and immutable; enables edge caching)
    - `Access-Control-Allow-Origin: *`

The response body is `obj.body` (the R2 object's ReadableStream). Do not
buffer it.

## What NOT to do

- Do not modify any existing handler (handleHealth, handleCreateCapture, handleCaptureStatus)
- Do not use spread operators on raw KV records (field mapping must be explicit)
- Do not reflect user input (captureId, artifactName) into error response bodies
- Do not add the `ip` field to any response
- Do not hardcode a base URL -- always derive from `request.url`
- Do not set Content-Type: text/html for the html artifact under any circumstances

## Deliverables

- `src/index.js` with two new handler functions and two new route entries
- Routes array must have the artifact route AFTER the getCapture route
  (the $ anchor on each regex prevents shadowing, but put artifact route
  after for readability)

## Success criteria

- `GET /v1/captures/{id}` returns 200 with correct JSON shape for a KV-seeded complete record
- `GET /v1/captures/{id}` returns RFC 9457 404 for unknown IDs
- `GET /v1/captures/{id}` returns RFC 9457 404 for pending/failed captures (same static message)
- `GET /v1/captures/{id}/artifacts/html` sets `Content-Type: text/plain` (not text/html)
- `GET /v1/captures/{id}/artifacts/screenshot` sets `Content-Type: image/png`
- `GET /v1/captures/{id}/artifacts/wacz` sets `Content-Type: application/wacz+zip`
- `ip`, raw R2 keys, and `wacz.key` are absent from all responses
- `Cache-Control: private, no-store` on metadata response
- `Cache-Control: public, max-age=31536000, immutable` on artifact responses
- `Cache-Control: no-store` on ALL error/404 responses
- `Access-Control-Allow-Origin: *` on both routes
- Artifact handler checks `record.status === 'complete'` before serving

When you finish your task, mark it completed with TaskUpdate and
send a message to the team lead with:
- File paths with change scope and line counts (e.g., "src/auth.ts (new OAuth flow, +142 lines)")
- 1-2 sentence summary of what was produced
