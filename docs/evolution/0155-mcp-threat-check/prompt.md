# Prompt

Same session as phases 0133 to 0154. Checking the subprocessor page for the docs
pass (wrl-backlog#46): Google Web Risk "checks submitted URLs before initiating a
capture". `checkUrl` is called by the REST capture handlers, the scheduler and the
daily re-scan, not by `src/mcp.js`.
