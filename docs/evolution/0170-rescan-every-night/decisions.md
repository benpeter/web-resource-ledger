# Decisions

- The cause: `handleRescanTick` asked for captures checked more than exactly 24
  hours ago. The run starts at 03:00:00 and records its checks from about
  03:00:37 on, so the next night every check of the night before was still a
  few seconds too young and was skipped. URLs with more than one capture still
  came up, because the run records the check on one capture per URL
  (`MIN(id)`) and the others stayed old; that was the 16 a night.
- The cutoff is now 12 hours (`RESCAN_MIN_AGE_MS`). The run is daily and takes
  well under a minute (30 s for 282 URLs), so anything checked more than 12
  hours ago was checked by an earlier run, and anything checked by this run is
  not picked up twice. Any value between the run time and 24 hours minus the
  run time would do; 12 hours leaves room on both sides.
- The per-capture `last_threat_check_at` of other captures of the same URL is
  still not updated. The URL is checked every night either way, and a hit
  quarantines every capture of the URL, so this changes nothing a user sees.
  Updating all siblings would only make the column tidier.
- `test/rescan.test.js` is the first test of the re-scan. It stubs `fetch`
  with Web Risk's empty answer (`{}`, no threat) and checks `threat_checks`
  rows: a check from 24 hours minus 40 seconds ago is re-checked, one from an
  hour ago is not.
- The whitepaper now says each URL is checked once a night, up to 500 a run
  with the longest unchecked first, which is what the code does. Its DigiCert
  address was `https://`; `TSA_URL` in `wrangler.toml` is
  `http://timestamp.digicert.com`.
