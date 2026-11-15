# Decisions

- The capture: `cap_4bbcd2dfb276426185759ee155d8711f` on staging. Attempt 1
  logged `render.default.screenshot_before` at 20:32:53 UTC and nothing
  after it until `Render deadline exceeded` at 20:41:34. The second attempt
  completed in 33 seconds.
- What comes after the first screenshot is the consent step. Its time limits
  (2 to 10 seconds) run on timers and cannot hang. Before them the step
  makes two calls to the browser and waits for each: `page.exposeBinding()`
  for autoconsent's messages, which Playwright sets up in every frame of
  the page, and the autoconsent script into the main frame. The page had 340
  frames. Neither call had a limit.
- Which of the two stayed unanswered is not known; the log has no event
  between them. Measured on a capture of the same page that went through:
  13.0 of the step's 15.1 seconds were this setup.
- The setup gets 15 seconds, counted from the start of the step. The
  longest setup seen that did finish was 13.0 seconds; on pages without
  hundreds of frames it takes 0.1 to 0.6.
- When the 15 seconds run out the step ends as any other consent error
  does: `captureSettings.consent.result` is `failed`, the capture goes on
  with the first screenshot, and `capture.consent_error` has the reason. A
  banner that was there stays in the capture, and the capture says so.
- Not a failed attempt. The page had loaded and the first screenshot was
  taken; a retry costs the user minutes and has the same odds on such a
  page.
- Not done here: sending the script to fewer frames (up to 50 child frames
  get the 300 KB script each), and whether WRL's interception of every
  request is what makes calls to the browser slow on such pages. Both are
  being measured, see backlog #105.
