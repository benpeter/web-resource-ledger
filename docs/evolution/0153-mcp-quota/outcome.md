# Outcome

- Red first (3fbe426, 25aa47a), then green (ccd7f84, c71d547).
- MCP `capture_url` and `batch_capture` refuse when the free captures or storage are
  used up, the account is blocked or a deletion is pending, with the texts the REST
  endpoints send. `get_usage` shows the real numbers for those accounts.
- `site/content/mcp.md` has troubleshooting entries for both refusals and a note on
  batch quotas; `site/content/limits.md` quotes the real 429 bodies and covers MCP
  and the 403; `site/content/batch.md` has the real 422 example.
- Tests: 7 new in `test/mcp.test.js`. Full unit suite 1911 passed, 19 failed (the
  known local DNS failures), sync tests 15/15.

## Backlog changes

- None filed. The capture count lagging behind in-flight captures is noted above;
  it may explain the founder account's 201 captures in 2026-07.
