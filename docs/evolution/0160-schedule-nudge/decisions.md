# Decisions

- The nudge lives in the dashboard only. A new email would be marketing to people
  who signed up for a product, with the consent and opt-out questions that brings;
  a link where they already are needs none of that.
- Two places: a capture's page ("To see how this page changes over time, capture
  it on a schedule", in the compare section, which a schedule is what fills) and
  the captures list (once per page load, after a capture made there completes,
  only when the account has no schedules). Both open `#/schedules?url=...` with
  the create form's URL filled in; the user still picks the frequency and submits.
- Only for session users: the schedules view needs a session, so API-key users of
  the dashboard would be sent back to the captures list. Not on captures a
  schedule made.
- "Not now" removes the hint without remembering it. It comes back on a later
  page load only while the account has no schedules; nothing is stored in the
  browser.
- The prefilled URL goes into the input's value, never into markup, and only
  http(s) URLs are accepted; the server validates it again on submit.
- MCP and the REST API are unchanged: agents see `create_schedule` in the tool
  list, and an API response is no place for a suggestion.
- The digest widening (a digest for any captures in the period, not only
  scheduled ones) stays in #19. It would reach ad-hoc users only in the weeks
  they capture, and needs a template change; the nudge comes first.
