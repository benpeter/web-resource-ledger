# Outcome

- `ci.yml` accepts `workflow_dispatch`; the autoconsent workflow dispatches it on
  its PR branch.
- `scripts/lib/battery-compare.js` (pure, 15 unit tests, red first) and the
  `scripts/battery-compare.js` wrapper decide regressions; `test-battery.js`
  takes `--out`, `--only` and a 20-minute poll window and prints the staging
  build it ran against.
- `autoconsent-update.yml`: baseline run, candidate deploy, candidate run,
  compare with one retry, staging restored to `main`, PR body with the verdict
  and table, CI dispatched on the branch.
- `deploy-staging.yml`: the deploy job joins the `staging-deploy` concurrency
  group.

Verified after merge by closing #307 and running the workflow by hand; results
in the PR it opens.

## First run (2026-10-22) and follow-up

The first manual run (workflow run 39863433062) opened #313 and dispatched CI
on it, which passed. The battery half failed in a useful way:

- Both battery runs crashed on a single `ECONNRESET` while polling. The error
  escaped `Promise.all`, so neither run wrote its results, the comparison had
  no input and the gate failed the job with verdict "error". The PR body said
  the battery did not finish. Polling now lives in
  `scripts/lib/battery-poll.js`, retries network errors, non-2xx responses and
  non-JSON bodies until the deadline, and polls every 10 seconds instead of 3.
- A test run with a stale key showed a second gap: a baseline in which every
  capture errored compared as "0 regressions" and passed. The comparison now
  refuses a baseline without a completed capture.
- The crashed runs left about 40 captures queued on staging. The next staging
  deploy's smoke test, which waits 90 seconds for one capture, failed twice
  behind that backlog. The fixed script waits for its own captures, so a run
  that finishes normally leaves no backlog.
