## Context

You are working on `web-resource-ledger`, a Cloudflare Worker that captures
web pages (screenshot, rendered HTML, HTTP headers, WACZ bundle) and stores
artifacts in R2. The KV layer tracks capture lifecycle.

This is MVP step 5 (retrieval endpoint). A sibling task will implement
`GET /v1/captures/{id}` and `GET /v1/captures/{id}/artifacts/{name}`, which
proxies R2 artifacts through the Worker. The HTML artifact (`rendered.html`)
must never be served as `text/html` -- it contains attacker-controlled content
from a headless browser render and is a stored-XSS vector if served with
`Content-Type: text/html`.

The WACZ artifact already has correct `httpMetadata` set at write time
(see `capture.js` lines 94-98). The pattern must be extended to
`rendered.html`.

## What to do

In `src/capture.js`, update the `env.BUCKET.put` call for `rendered.html`
(currently line 73) to add `httpMetadata`:

```js
env.BUCKET.put(`${prefix}/rendered.html`, html, {
  httpMetadata: {
    contentType: 'text/plain',
    contentDisposition: 'attachment; filename="rendered.html"',
  },
})
```

This is belt-and-suspenders coverage: the artifact-serving route (Task 2)
already overrides Content-Type at serve time. Setting it at write time
ensures the object is safe even if it is ever accessed via R2 public URLs
(future operational scenario).

## What NOT to do

- Do not modify screenshot.png or headers.json -- they have no XSS surface
- Do not change any other part of capture.js
- Do not modify tests in this task (test changes are in Task 4)

## Deliverables

- Modified `src/capture.js` with httpMetadata on the `rendered.html` put call
- No other file changes

## Success criteria

- `src/capture.js` has the httpMetadata block on the rendered.html BUCKET.put call
- The existing test suite (`test/capture.test.js`) still passes

When you finish your task, mark it completed with TaskUpdate and
send a message to the team lead with:
- File paths with change scope and line counts (e.g., "src/auth.ts (new OAuth flow, +142 lines)")
- 1-2 sentence summary of what was produced
