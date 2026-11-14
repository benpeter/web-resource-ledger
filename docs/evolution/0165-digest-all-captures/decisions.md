# Decisions

- The digest goes to every account with digest on, a verified email and at least
  one capture in the week, scheduled or not. Weeks without captures still send
  nothing, so an account that stops capturing stops getting mail.
- The schedule rows stay. One extra row, "Other captures (not from an active
  schedule)", counts everything else: dashboard, API and MCP captures, and
  captures of a schedule paused or deleted during the week. It is the period's
  total minus the schedule rows, so the summary numbers always add up to every
  capture of the week.
- No per-URL list for the other captures: an account can make hundreds a week,
  and the dashboard lists them.
- Preference rows are created at sign-up from the GitHub email with the digest on,
  so people who never opened the notification settings get it too. That was true
  for schedule owners already; the digest is about the account's own captures and
  every mail carries the unsubscribe link. The dashboard's description of the
  setting now says "Weekly summary of your captures, in weeks with captures"
  instead of "of your scheduled captures".
- Effect today, checked in prod D1 for the last 7 days: the same single account
  gets a digest under the old and new rule (the founder, whose captures all come
  from a schedule). The change matters for the next accounts that capture.
