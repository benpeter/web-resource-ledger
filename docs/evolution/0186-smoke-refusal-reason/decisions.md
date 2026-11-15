# Decisions

- The cause was in the staging logs, not in the job output: the smoke test's
  staging tenant `smoke-test` had used 208 of the 200 captures a free tenant
  gets in a month (`security.quota_exceeded`). Each deploy makes one capture
  with that key and the autoconsent battery made 42 the same afternoon.
- The tenant gets an override of 2000 captures a month through the admin
  API. A separate tenant for the battery would also work, but needs a new
  key and secret; the override is one call and leaves room for about ten
  battery runs and several hundred deploys a month.
- The smoke test prints the refusal's `detail`. It used `curl -f`, which
  drops the body of a 4xx answer, so the job said 429 and nothing else, and
  429 is also what a rate limit answers.
- No alert on a failed staging deploy in this change. Where such an alert
  should go is Ben's call (backlog #103).
- No red test: the script has no test harness. Checked by hand against
  staging with an invalid key (before: status only; after: status and
  "Invalid API key") and with a working key (4/4 passed).
