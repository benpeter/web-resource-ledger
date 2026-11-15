# Decisions

- A site that answered WRL's browser with an error status on either run is
  not compared. The gate asks one question, whether the autoconsent update
  made a capture worse, and a block page can't answer it: the consent step
  ran on "Access Denied", so "banner dismissed" on the baseline against "no
  banner" on the candidate would be blamed on the update. The same holds the
  other way round, where a site blocked on the baseline would count as an
  improvement.
- Such a row gets its own verdict, `blocked`, and its own count in the last
  line of the report, so the update PR shows which sites were left out. It
  sits beside `skipped` (robots.txt) and works the same way.
- The status comes from `render.httpStatus` for a completed capture and from
  the failure text ("The site answered HTTP 403 ...") for a failed one, since
  a failed capture has no render record.
- A blocked site is not retried. The retry exists for regressions, and sites
  that block Cloudflare's browser tend to keep doing so for hours.
- The battery's own exit code is unchanged: a blocked page still counts as
  "passed" there, because the capture did complete. The table has an HTTP
  column now, which is where a person running it by hand sees the block.
- No CHANGELOG entry: nothing a user of the service can see changes.
