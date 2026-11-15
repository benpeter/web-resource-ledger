# Decisions

- The capture: `cap_538e274e170a4ee38bde4f677bb7704b` on staging. The first
  screenshot is whole (16.8 MB), the second is 4.3 MB, and the stored HTML
  has 89 lazy images of 108. `render.default.post_consent` says
  `reloaded: false, pass: 1` after 5.0 seconds, and there was no second pass.
- After a banner is declined WRL watches for a reload for 2 seconds (phase
  0185), then waits up to 3 seconds for the page's open requests, then takes
  the screenshot. Phase 0188 added a second pass for a reload that starts
  while the screenshot is taken or the HTML is read, and counts navigations
  from the moment the wait for requests is over.
- A reload that starts during those 3 seconds fell between the two. The
  watch was over, and the count for the second pass had not begun. The wait
  ran to its 3 second limit on the reloading page, and WRL took the
  screenshot of a document a second or two old.
- The Guardian page was busy (39 requests open when the first settle hit
  its limit), which is why the wait ran its full 3 seconds there. On a quiet
  page the wait ends after half a second and the window is that short.
- First fix: after the wait for open requests, ask again whether the main
  frame has navigated. If it has, the page gets what a reload within the 2
  seconds gets: load event, wait for requests, scroll.
- That was not all of it. On staging with the first fix, 2 of 5 captures of
  theguardian.com were still of the page a moment into its reload
  (`cap_ec61dae194f44dd88020af1bca2c29e9`,
  `cap_2ba4c126334a455689fa38c1ff40bb1d`), with `reloaded: false` and no
  second pass. Both pages were quiet, so the wait ended after one second.
- Between the end of the wait and the start of the screenshot WRL writes a
  log line, and the count of navigations for the second pass was taken
  after it. In tests a log call returns at once. On staging and in
  production it is a request to Coralogix, tens to hundreds of
  milliseconds, and a reload that commits in that time was counted before
  the baseline was taken: it belonged neither to the wait nor to the second
  pass. Why that hit 2 captures of 5 is not measured. A guess: the site
  reloads shortly after its own requests have gone quiet, which is also
  when WRL's wait ends and the log line is written.
- Second fix: the baseline is taken the moment the wait returns, before the
  log line. When the wait itself fails, the baseline is the count from
  before it, so a navigation during the failed wait gets the second pass.
- The integration test for it sends WRL's log lines to the test server,
  which holds the answer to that one event for 1.5 seconds.
