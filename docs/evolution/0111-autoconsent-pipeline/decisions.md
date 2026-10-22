# Decisions

## What was wrong

- CI never ran on the weekly PRs. The workflow opens them with its own
  `GITHUB_TOKEN`. GitHub doesn't start `pull_request` workflows for events made
  with that token. Since late August GitHub creates the run but never starts
  it: it ends as a failure with no jobs, or waits for an approval
  (`action_required`) that nobody gave. 25 PRs went unmerged and
  production still runs autoconsent 14.75.0 from April.
- The battery never tested the update. It installed the new autoconsent in the
  runner, then sent its captures to staging, which runs whatever `main` holds.
  Every battery since March measured the old version.
- It also couldn't finish. It submitted 21 sites at once and gave each five
  minutes, but staging renders two captures at a time (`max_concurrency = 2`
  matches the browser session pool), so about 7 sites finished and the rest
  timed out. With `continue-on-error` on the job and the step, and `| tee`
  hiding the exit code, the PR said "Battery tests: passed" anyway.

## CI on the PRs

The workflow now starts CI itself with `gh workflow run ci.yml --ref <branch>`.
`workflow_dispatch` is the one event the workflow token is allowed to trigger,
and the run's checks attach to the branch head, so they show on the PR. `ci.yml`
takes `workflow_dispatch` and, without a PR or push base, diffs against the
merge base with `origin/main`.

A personal access token or a GitHub App would also make `pull_request` fire,
but both need a credential to create and rotate, for one weekly PR.

## A battery that measures the update

The battery job now captures every site twice on staging, first on the deployed
version (baseline) and then after deploying the update (candidate), and
compares the two runs site by site (`scripts/lib/battery-compare.js`):

- A site regresses when it completed on the baseline and fails, times out or is
  missing on the candidate; when its render drops from full to partial; or when
  the baseline dismissed its cookie banner and the candidate doesn't.
- Sites that fail on both runs are the site's problem, not the update's. Several
  battery sites block automated browsers, so "fail when sites error", as the
  plan put it, would have failed every week.
- Regressed sites are retried once on the candidate; the job fails only if they
  regress again. Two runs of the same site differ now and then.

Each capture now gets 20 minutes from submission instead of 5, so a full run
finishes at staging's rate (about ten minutes for 22 sites). The job holds the
`staging-deploy` concurrency group, which `Deploy to Staging` now shares, so a
push to `main` can't deploy in the middle of a battery. At the end the job
redeploys the latest `main` to staging, even when the battery failed.

The candidate deploy reports `<version>+autoconsent.<new version>` as its build
version on `/health`, so it is visible which build staging serves.

The battery uses the legacy staging key, which skips the monthly quota, so the
doubled number of captures needs no quota change.

## Also

- The update is pinned to the version the first job found, not `@latest` in
  every job, so a release in the middle of a run can't mix versions.
- Stale autoconsent PRs are closed with their branches deleted, and the branch
  push is forced, so re-running the workflow for a version works.
- The PR body says whether the battery found regressions and includes the
  comparison table, instead of the raw log.
