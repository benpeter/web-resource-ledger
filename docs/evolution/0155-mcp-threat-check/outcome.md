# Outcome

- Red first (28fd1f4), then green (0dbb8f3).
- MCP `capture_url` and `batch_capture` screen URLs with Web Risk like the REST
  endpoints and record the result on the capture.
- Docs: MCP troubleshooting entry; whitepaper 8.1 lists every screened capture
  path; security overview and whitepaper say eleven alerts; subprocessor pages
  cover email sign-in and Pirsch.
- Tests: 3 new in `test/mcp.test.js`. Full unit suite 1914 passed, 19 failed (the
  known local DNS failures), sync tests 15/15.

## Backlog changes

- None.
