# Decisions

- Measured first, on staging with main (dedf42c): three captures of
  merriam-webster.com, `render.stages.scrollMs` 38.7, 58.0 and 73.7 seconds
  for pages about 7,000 px tall, captures of 67 to 109 seconds.
- The cause is not the page's height. The scroll was two calls to the
  browser for each step (scroll, then read the height), 10 steps for that
  page, and the page makes about 1,400 ad requests while it is scrolled.
  Every call waits behind that traffic, two to three seconds each.
- So the scroll runs inside the page: one `page.evaluate()` with the loop in
  it (`scrollStepwise`). The steps, the 150 ms pause, the 12,000 px limit and
  the stop for a page that keeps growing are as they were.
- A time budget of 10 seconds for the scroll down, checked inside the page.
  17 steps take 2.6 seconds when the page's timers run on time, so the
  budget only ends a scroll on a page whose main thread is busy. What was
  loaded until then stays; lazy images are told to load afterwards either
  way.
- 30 seconds for the page to answer that one call. A page that doesn't is
  not captured without its scroll: the next calls would wait on the same
  page. The attempt fails with a reason of its own and is retried.
- Whether the budget ran out is logged (`scrollCutShort` on
  `render.default.lazy_load_complete`), not stored on the capture. It did
  not happen in any staging capture, so there is nothing yet that a reader
  of a capture would need it for.
- Not done: folding the "load lazy images" call into the same call. It
  would save one round trip on such pages and change nothing on others.
- Found on the way and fixed here, because it hid what was going on: a
  screenshot that ran into its 90 second limit was reported as "Page did not
  finish loading within 20 seconds". Every Playwright timeout got that text.
- Found on the way and not fixed here:
  - The screenshot is the slow step on that page now: 18 to 27 seconds for
    one screenshot, 46 once, over 90 once.
  - One attempt ended without a failure event. Cloudflare's invocation
    analytics has it as `exceededMemory`: the Worker went over its 128 MB
    while three heavy captures ran at once. The queue delivered the capture
    again and it completed. Production has no such invocation in the last
    30 days.
  - A site that reloads itself during the 3 second wait after its banner
    was declined (theguardian.com, once) is captured without a second
    scroll. That is a gap in phase 0188 and gets its own phase.
