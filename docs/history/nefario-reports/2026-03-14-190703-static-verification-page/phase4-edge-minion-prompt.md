# Task 2: Add Content Negotiation to `handleVerifyCapture` in `src/index.js`

Add an `Accept` header check at the end of `handleVerifyCapture` in
`src/index.js` to serve HTML when a browser requests the verification URL.

## What to Change

**File: `src/index.js`**

1. Add import at the top:
   ```js
   import { htmlVerifyResponse } from './verify-page.js';
   ```

2. In `handleVerifyCapture`, after Step 7 (building the response body) and
   Step 8 (determining cacheControl), add the content negotiation check
   BEFORE the return statement:

   ```js
   // Step 9: Content negotiation -- serve HTML to browsers
   const accept = request.headers.get('Accept') || '';
   if (accept.includes('text/html')) {
     return htmlVerifyResponse(captureId, new URL(request.url).origin, cacheControl);
   }
   ```

3. Add `Vary: Accept` to the JSON response (the existing return statement):
   ```js
   return jsonResponse(body, 200, {
     'Cache-Control': cacheControl,
     'Access-Control-Allow-Origin': '*',
     'Vary': 'Accept',
   });
   ```

This adds approximately 5 lines to `index.js`.

## Content Negotiation Rules

- If `Accept` header contains `text/html` -> serve HTML
- Otherwise (including `*/*`, `application/json`, absent header) -> serve JSON
- JSON is the default. This preserves backward compatibility.
- `Accept: */*` (sent by curl) MUST return JSON, not HTML.
- The `text/html` check is intentionally simple (no quality-value parsing).
  Full RFC 9110 conneg is YAGNI.

**Known limitation (documented, not fixed):** A client sending
`Accept: text/html;q=0, application/json` technically says "I do NOT want
HTML" but will receive HTML because the check is a simple `includes('text/html')`
substring match. This is acceptable for MVP — no real browser sends this.

## Important Details

- The HTML path passes `captureId` and `origin` to `htmlVerifyResponse`,
  NOT the verification result body. The HTML page fetches its own data
  client-side.
- `Vary: Accept` must be on BOTH the JSON and HTML responses. The HTML
  response already has it (set in `verify-page.js`). You must add it to
  the JSON response path.
- Error paths (429, 503, 404) do NOT need HTML variants. Keep `problemResponse`
  for all error cases. The `Accept` check only applies to the 200 success path.
  A browser hitting a 404 or 429 will display the JSON problem response --
  acceptable for MVP.
- Do NOT add `Vary: Accept` to the global response handler (lines 47-48).
  Only the verify endpoint does content negotiation.

## What NOT to Change

- Do NOT modify `src/verify-page.js` (Task 1 owns that)
- Do NOT modify the verification logic (steps 1-7)
- Do NOT modify the JSON response shape
- Do NOT add HTML variants for error responses
- Do NOT add routes -- content negotiation uses the existing route
- Do NOT modify `src/responses.js`
- Do NOT modify `wrangler.toml`
- Do NOT add quality-value parsing for Accept headers

## Deliverables

Modified file: `src/index.js` with:
- Import of `htmlVerifyResponse`
- Accept header check in `handleVerifyCapture`
- `Vary: Accept` on the JSON response

## Completion

When you finish, mark the task as completed with TaskUpdate and send a message
to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
