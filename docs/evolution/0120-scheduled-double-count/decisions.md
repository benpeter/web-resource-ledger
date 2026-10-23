# Decisions

- Evidence: the founder tenant completed 100 scheduled captures in each of
  August, September and October 2026 (D1 `captures`), and its usage counter
  shows 200 for each month. The free limit stopped the hourly schedule after
  about four days instead of eight.
- Impact: the Stripe meter reports `usage_counters.capture_count`, so a paying
  tenant with schedules would have been billed twice. No tenant has paid yet and
  only the founder tenant has a schedule, so nobody was overcharged.
- Fix: the scheduler no longer increments usage. A capture counts once, when it
  completes, the same as captures from the API, MCP and the dashboard.
- Trade-off: queued but unfinished captures don't count toward the limit, so a
  tenant near the limit can go over it by the captures in flight. The API path
  has always worked this way.
- Data: the founder tenant's October counter is corrected from 200 to the
  number of completed captures after this deploys. Earlier months don't matter
  (no billing, period over).
