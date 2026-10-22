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
