## Domain Plan Contribution: api-design-minion

### Recommendations

#### Question 1: CORS -- No changes needed for same-origin UI

Since the browser UI will be served from the same Cloudflare Worker origin (e.g., `https://wrl.benpeter.workers.dev`), all `fetch()` calls from the UI to `/v1/...` endpoints are same-origin requests. The browser does not send an `Origin` header and does not perform preflight checks for same-origin requests, so CORS is entirely irrelevant.

The existing CORS setup is correctly scoped:

- **POST /v1/captures** has CORS gated by `CORS_ORIGINS` env var (allowlist). This is for cross-origin API consumers (e.g., third-party sites embedding a capture widget). The UI does not need this.
- **GET /v1/captures/:id** and artifact endpoints already set `Access-Control-Allow-Origin: *` because these are public, unauthenticated endpoints intended for cross-origin access.
- **GET /v1/captures** (list, authenticated) has no CORS headers at all, and should not get them -- it is tenant-scoped and authenticated. The same-origin UI fetches this without CORS.

**Verdict: Zero CORS changes required.** The same-origin architecture is the cleanest possible approach. Do not add CORS headers to authenticated endpoints just because a UI exists -- that would weaken the security posture for no benefit.

One minor caveat: if the UI is ever served from a different origin (e.g., `app.webresourceledger.com` vs `api.webresourceledger.com`), CORS would become necessary. But for a Worker serving both HTML and API from the same origin, this is not a concern.

#### Question 2: List response shape -- sufficient with one small enhancement

The current list response per item is:

```json
{
  "id": "cap_...",
  "status": "complete",
  "url": "https://example.com",
  "createdAt": "2026-03-22T...",
  "completedAt": "2026-03-22T...",
  "renderQuality": "full"
}
```

(For `failed` status: `failedAt`, `error`, `retryable` instead of `completedAt`/`renderQuality`.)

**This is sufficient for a useful list view.** Here is my field-by-field assessment:

| Field | Present? | UI Value |
|-------|----------|----------|
| `id` | Yes | Row identifier, link to detail view |
| `status` | Yes | Status badge (pending/complete/failed) |
| `url` | Yes | Primary content -- what was captured |
| `createdAt` | Yes | Timestamp display, relative time |
| `completedAt` | Yes (complete only) | Duration display, sort indicator |
| `renderQuality` | Yes (complete only) | Quality badge (full vs partial) |
| `error` | Yes (failed only) | Failure reason in list |
| `retryable` | Yes (failed only) | "Retry" button conditional |

**Thumbnail URLs: NOT needed in the list endpoint.** The screenshot artifact URL is deterministic -- for any capture ID, the screenshot lives at `/v1/captures/{id}/artifacts/screenshot`. The UI can construct this URL client-side without the API sending it. This is the right pattern: the list endpoint returns identifiers and metadata; the client constructs artifact URLs from the well-known URL template. Adding thumbnail URLs to the list response would increase payload size and introduce coupling between the list shape and the artifact routing.

The UI should lazy-load thumbnails (e.g., `<img loading="lazy">`) using the constructed URL, and only for `complete` status items. This gives a rich list view without any API change.

**Verification status: NOT available in the current schema, and not needed for MVP.** The verification endpoint (`GET /v1/verify/:id`) performs live cryptographic verification at request time -- it is not stored as a column. Adding a cached verification status would be a schema change, a new column, and new write logic. This is a post-MVP enhancement. The UI can link to the verify endpoint from the detail view.

**One recommended enhancement: include `hasWacz` boolean in list items.** The current list projection does not indicate whether a capture has a WACZ archive. This is a single boolean that helps the UI show a "verified" or "archive available" badge in the list without requiring a detail fetch for every row. The data is already loaded (`r.wacz` is available in the list projection code at line 890-905 of `index.js`) -- it just needs one line added:

```js
if (r.status === 'complete') {
  summary.completedAt = r.completedAt;
  summary.renderQuality = r.renderQuality ?? 'full';
  summary.hasWacz = Boolean(r.wacz);  // <-- add this
}
```

This is an additive, non-breaking change. Existing API consumers ignore the new field.

#### Additional API Observations for the UI

**Auth gate design:** The UI needs to handle the `Authorization: Bearer <api-key>` flow for `POST /v1/captures` and `GET /v1/captures`. The simplest pattern:

- Store the API key in `sessionStorage` (not `localStorage` -- cleared on tab close, not persisted across sessions)
- On 401 response, redirect to the auth gate view
- The auth gate is a simple form that accepts an API key, validates it with a lightweight request (e.g., `GET /v1/captures?limit=1`), and stores it on success
- Do NOT create a session/cookie auth system -- the API key model is sufficient and avoids adding server-side session state

**Status polling for pending captures:** After `POST /v1/captures` returns `202` with a `statusUrl`, the UI should poll `GET /v1/captures/:id/status` with a 10-second interval (matching the `Retry-After: 10` header the API sends for pending status). The status endpoint returns `{ status: 'pending' | 'complete' | 'failed' }` which the UI can use to update the list item in-place. Consider exponential backoff after 2 minutes to avoid burning rate limit budget on slow captures.

**Pagination:** The API uses offset-based pagination with `{ total, offset, limit, hasMore }`. For the UI list view, this maps naturally to a "Load More" button or traditional page navigation. The `hasMore` boolean makes the "Load More" pattern trivial -- show the button when `hasMore === true`. The `total` count can be displayed as "Showing N of M captures". The default `limit=20` and max `limit=100` are reasonable for a UI page size.

**Error handling in the UI:** The API returns RFC 9457 Problem Details (`application/problem+json`) for all errors. The UI should parse these and display the `detail` field to the user. The `status` field can drive UI behavior (e.g., 429 shows a "slow down" message with the retry time from the response).

### Proposed Tasks

**Task 1: Add `hasWacz` to list projection** (optional, low effort)
- What: Add `summary.hasWacz = Boolean(r.wacz)` to the `handleListCaptures` response projection
- Deliverables: One-line code change in `src/index.js` (~line 899), update to any API spec/docs
- Dependencies: None -- purely additive, non-breaking
- Effort: Trivial (< 5 minutes)

**Task 2: Implement screenshot URL construction in the UI** (frontend task, no API change)
- What: The UI list view should construct thumbnail URLs as `/v1/captures/{id}/artifacts/screenshot` for complete captures, and use `<img loading="lazy">` for performance
- Deliverables: Client-side JS that constructs URLs from capture IDs
- Dependencies: List endpoint data (already sufficient)
- Note: The screenshot endpoint already sets `Access-Control-Allow-Origin: *` and returns the image directly from R2 with correct `Content-Type`

**Task 3: Implement auth gate with sessionStorage** (frontend task, no API change)
- What: Auth gate view that accepts an API key, validates it, and stores it in `sessionStorage`
- Deliverables: Auth gate HTML/JS, fetch wrapper that adds `Authorization` header, 401 redirect logic
- Dependencies: None
- Risk: API key validation -- using `GET /v1/captures?limit=1` as a validation probe means the key needs `read` scope. If a key only has `capture` scope, this will fail. Consider whether the UI should accept keys with either scope. Alternatively, the UI could try POST and GET separately to determine available scopes, but that adds complexity. For MVP, require a key with both `capture` and `read` scopes.

**Task 4: Implement capture submission with status polling** (frontend task, no API change)
- What: Capture form submits to `POST /v1/captures`, receives `202` with `statusUrl`, polls until complete/failed
- Deliverables: Submission form, polling logic with exponential backoff
- Dependencies: Auth gate (Task 3)
- Note: The `statusUrl` in the 202 response is an absolute URL -- the UI can use it directly

### Risks and Concerns

1. **Rate limit budget for polling:** Each status poll hits `GET /v1/captures/:id/status`, which is unauthenticated and falls under the `capture` rate limit group. If a user submits multiple captures and polls all of them simultaneously, they could hit the global rate limiter. The UI should batch poll (one timer for all pending captures) or stagger requests. This is a UI-side concern, not an API change.

2. **API key scope mismatch:** The UI needs both `capture` (to submit) and `read` (to list) scopes. Existing tenant keys may not have both. The tenant onboarding docs should specify that UI keys need `["capture", "read"]` scopes. This is a documentation concern, not a code change.

3. **No logout/key rotation in UI:** With `sessionStorage`-based auth, "logout" is just clearing the key. But if a key is revoked server-side, the UI will get 401s and should redirect to the auth gate. Make sure the fetch wrapper handles 401 globally, not just on initial auth.

4. **List response includes `ip` field internally but strips it in projection:** The current code correctly strips `ip` from the list response. Verify that the detail view (`handleGetCapture`) also does not expose `ip` -- confirmed, it does not. No leak risk.

5. **No CORS needed today, but document the assumption:** The zero-CORS approach depends on same-origin serving. If the architecture ever splits (separate UI host), this assumption breaks silently -- the UI would get opaque fetch failures with no helpful error message. Add a comment in the routing code noting that the UI depends on same-origin and that CORS changes would be needed if the serving origin changes.

### Additional Agents Needed

None. The current team is sufficient. The questions posed were squarely in API design territory, and the answers do not require additional specialist input. The frontend implementation tasks are standard vanilla JS work that does not need a separate frontend specialist for planning purposes.
