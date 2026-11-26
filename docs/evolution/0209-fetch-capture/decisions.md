# Decisions

- Automatic, no `mode` parameter yet: `performCapture` gives the header
  fetch it already made 3 seconds before the browser starts. A 2xx answer
  with a content type other than `text/html` or `application/xhtml+xml` is a
  file. Redirects, errors, slow answers and answers without a type go to the
  browser as before. HTML captures start up to the header fetch's time later
  (usually well under a second).
- The file is fetched a second time with its body (the header fetch
  discards it), without following redirects, and held whole: 10 MB limit,
  checked on `Content-Length` and while streaming. Over it the capture fails
  without retry. The file sits in memory about four times at its peak (the
  read, the WARC, the zip, the copy being stored), and an isolate runs up to
  10 captures at once in 128 MB, so 20 MB was too close after #99.
- Stored as `captures/<id>/resource`; the WARC's main resource record holds
  the bytes with the site's content type, and there are no screenshot
  records. `captureSettings: { version: 1, method: 'fetch' }`,
  `render: { httpStatus, contentType, bytes, durationMs }`.
- The `resource` artifact is served as `application/octet-stream` with an
  attachment file name whose extension comes from the content type, so an
  HTML or SVG file never runs on the API origin.
- Surfaces: record and webhook `artifacts`, verification page ("Fetched
  file"), dashboard detail, MCP `get_capture`, certificate PDF text.
- Left for later: a `mode` override (screenshot a JSON response, or fetch
  an HTML page raw), change detection for files (scheduled file captures
  compare headers only), the diff view, and verify CLI wording.
- `RenderInfo.required` and `CaptureArtifacts.required` in the spec shrink
  to what both kinds of capture have.
