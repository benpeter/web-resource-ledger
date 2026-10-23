# Decisions

## Bot checks fail the capture

- A page counts as a bot check when two of these signals are present:
  the title "Just a moment..." (or "Attention Required! | Cloudflare"), the
  `cf_chl_opt` script, a `/cdn-cgi/challenge-platform/` URL. One signal alone
  isn't enough, since a page about Cloudflare can mention any of them.
- When the check is found, WRL waits up to a few seconds for it to clear by
  itself, as it would for any visitor, and reads the signals again. It never
  clicks, solves or otherwise interacts with the check
  (`.planning/PROJECT.md` rules that out).
- If the check is still there, the capture fails without retrying. Retrying a
  few minutes later gets the same check, and a signed capture of a check
  screen isn't evidence of anything.
- The check runs after rendering and before the WACZ is built, so no
  timestamp (RFC 3161 or qualified) is spent on it, and usage only counts
  completed captures, so it doesn't count against the quota.

## Failure reasons

- Before: when a retryable failure ran out of attempts, the dead-letter
  handler overwrote the reason with "Capture permanently failed after all
  retry attempts", and the catastrophic path did the same. 11 of the 17
  production failures since July say only that (the `captures` table holds
  no earlier rows).
- Now each failed attempt stores its reason (`recordAttemptError`) while the
  capture stays pending, and the final failure keeps that reason and adds
  "WRL tried 4 times." Status and list responses only show `error` once a
  capture has failed, so a pending capture doesn't show the reason of an
  earlier attempt.
- The final reason reaches the API status response, the capture record, the
  `capture.failed` webhook, the failure email and the dashboard list (new
  `.capture-fail-reason` line under the failed item; screen readers hear
  "Capture failed: <reason>").
- Messages that only made sense to us now read as plain English: "Captured
  page is not target content (blank-page)", "Browser protocol error" and
  "Target site did not respond (possible bot protection or geo-restriction)".
- `limits.md` gets a "Why Captures Fail" table listing every message.
