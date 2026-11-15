# Decisions

- The four functions `src/capture.js` uses (`connect`, `acquire`, `sessions`,
  `limits`) have the same signatures in 1.4.0, and `sessions()` and `limits()`
  still return Browser Run's JSON (`connectionId`, `sessionId`,
  `allowedBrowserAcquisitions`). 1.4.0 lists `playwright-core` as an optional
  peer dependency; nothing in its `lib/` imports it, so the Worker bundle
  doesn't pull it in.
- The compatibility date stays 2026-03-13. 1.4.0 sends and parses JSON text
  frames, which the binary-type flag doesn't touch, so it works on either side
  of 2026-03-17. Moving the date is now possible but is a change of its own.
- The Worker bundle grows from 1388 KiB to 1665 KiB gzipped (dry-run), and the
  library took about 26 ms of startup CPU instead of about 5 ms (local
  `wrangler check startup`, 48 ms in all before, 90 to 106 ms after). Every
  cold start paid that, also for `/health`, verify pages and API calls that
  never open a browser.
- So `getOrCreateSession` loads the library with `await import()` on its first
  call. esbuild keeps it in the one bundle and evaluates it only then. Startup
  CPU went to 35 to 36 ms, below the 48 ms of 1.1.2 with the static import.
  `test/browser-import-sync.test.js` fails if a file in `src/` imports it
  statically again.
- The browser itself is Cloudflare's Chromium on Browser Run; the library is
  only the client. WACZ files name the WRL release, not the library or browser
  version, so no capture output changes.
- Checked on staging before merging to production: the same six URLs captured
  before and after the deploy (`bin/staging-capture-compare.py` in the session
  folder), comparing status, render quality, load state, page and screenshot
  height, consent result, WACZ size and stage timings.
