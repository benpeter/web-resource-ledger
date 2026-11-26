# Decisions

- Why both files reached the browser: `performCapture` gives the header
  probe 3 seconds to say "this is a file". Both servers answered slower than
  that from Cloudflare at 01:15 UTC; on staging at 05:42 both answered in
  time and both failed correctly with "larger than 10 MB". So the browser
  path has to handle files that the probe missed.
- The zip: Chromium starts a download, and Playwright's `page.goto` throws
  "Download is starting". `performCapture` now hands such a capture to the
  file fetch (`performFetchCapture`, 60-second limit, 10 MB cap), which
  fails a large file at once by its Content-Length or signs a small one.
- The PDF: the response listener saw the 24 MB answer (HTTP 200,
  `totalBytes` 24,184,126), but `page.goto` returned no response, so the
  "main response is a file" check never ran. `pickFileAnswer` now falls back
  to the main-frame navigation response the listener recorded, and
  `exceedsFetchLimit` fails a file over 10 MB before its body is read into
  the Worker.
- The header probe now cancels the response body: it only keeps the
  headers, and for the zip it left a 359 MB download streaming.
- New messages where the catch-all hid the cause: "The browser tab crashed
  on this page, often because the page needs too much memory" (retried: on
  staging some heavy pages pass on a later attempt), "The site answered
  HTTP N when WRL asked for the file" (retried for 429 and 5xx only), "The
  URL redirects to a file, and WRL does not follow redirects when it fetches
  a file", and "The URL starts a file download, which WRL could not fetch".
- No retry rules per category. Two days of `capture.retry` events (prod
  and staging) show one capture failing for different reasons on each
  attempt (screenshot, then session closed, then timeout, then tab crash),
  and retries do recover pages: about seven captures passed on attempt 2,
  two on attempt 4. Cutting retries by the reason of one attempt would have
  lost those. What retries wasted was errors that can never pass, and those
  are now not retried.
- Following redirects in the file fetch (with `validateUrl` on every hop,
  as `src/sitemap.js` does) is left for later; a redirect to a file now says
  so plainly.
