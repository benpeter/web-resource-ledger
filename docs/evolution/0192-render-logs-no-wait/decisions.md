# Decisions

- Measured on staging, a capture of example.com
  (`cap_ac9b309a64274ae1ab62cc0223a57d9b`). Where two log lines follow each
  other with nothing but the log call between them, 183 to 237 ms pass:
  `consent_result` to `screenshot_after` 237 ms, to `content_extracted` 188
  (14 of them reading the HTML), to `complete` 183. The renderer writes ten
  lines for such a capture, so about 2 of its 8.6 seconds were waits for the
  log endpoint, with the browser session held.
- `log()` sends the line when it is called; waiting only delays what comes
  next. So the renderer no longer waits line by line. It keeps the promises
  and waits for all of them once, in its `finally`, after the browser
  context is closed. A line still leaves when its event happens, and its
  timestamp is taken then, so the order in Coralogix is the same.
- Only the renderer. `performCapture()` waits for a handful of lines of its
  own, outside the browser session; they stay as they are.
- The three lines the request interception wrote were not waited for at all
  and could be lost when the capture ended first. They go through the same
  list now.
- No limit on the final wait. A log endpoint that does not answer already
  holds a capture at its first line, `capture.start`, before the renderer
  runs; that is not new and not part of this.
- `render.stages` no longer include the waits, so each stage is shorter by
  one or two log round trips. `scrollMs` was the one with most in it.
- This also removes the gap phase 0190 closed for one place: no page event
  can arrive during a log call the renderer waits for, because it waits for
  none until the page is gone.
