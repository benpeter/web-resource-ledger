# Decisions

- A page that hit the navigation timeout with its HTML loaded goes through
  the same steps as a loaded page: settle, blank-page check, bot check,
  scroll, screenshot, consent, second screenshot. The timeout branch only
  sets `timedOut` and falls through, so there is one pipeline instead of a
  short copy without settle, scroll, consent step, blank-page check and bot
  check.
- The blank-page and bot-check rules apply to a timed-out page too. A blank
  page that never finished loading was stored as a partial capture, signed
  and counted against the tenant. It now fails with the same text as any
  blank page; no new failure reason.
- The capture stays `partial` with `timedOut: true`. What changes is what the
  partial capture contains, not what it is called: its load event still
  never came, so content can be missing.
- The 120 s budget and the one-second limit on reading the HTML stay for the
  timed-out path. A page that is still loading can hold `page.content()`
  back; a loaded page has no such limit and gets none.
- Errors in a timed-out page's later steps are no longer wrapped in "Partial
  capture failed: ...". The wrapper would hide "Bot check" and "not target
  content" from `categorizeError`, which matches on the start of the message.
  `render.default.partial_fail` is still logged with the message.
- `render.default.partial_complete` stays as the event name for a timed-out
  page that was captured, so existing log queries keep working. It no longer
  carries `screenshotMs` and `contentMs`; `screenshot_before`,
  `screenshot_after` and `content_extracted` have them, as for a loaded page.
- No API field changes. `render.stages.settleMs` and `consentMs` were
  nullable for this case and are numbers now; `scrollMs` and
  `captureSettings` were absent and are present.
