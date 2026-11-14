# Decisions

- Upgrade `@playwright/test` from 1.58.2 to 1.65.1 instead of pinning the E2E job to
  `ubuntu-24.04`. 1.65.1 lists `ubuntu26.04-x64` as an officially supported host
  (checked in its `playwright-core` bundle), so the job keeps `ubuntu-latest` and won't
  break again when 24.04 images are retired. Only the E2E suite uses it; the Worker
  renders with `@cloudflare/playwright`, which this doesn't touch.
- Only `e2e-tests.yml` installs Playwright browsers, so the deploy pipelines were never
  at risk from the runner change. The scheduled E2E runs on 2026-11-09 and 2026-11-12
  failed at the install step and tested nothing.
- Every pinned action moves to its newest Node 24 release, pinned by SHA with the
  version in a comment as before: checkout v7.0.1, setup-node v7.1.0, upload-artifact
  v7.0.2, download-artifact v8.0.2, wrangler-action v4.1.3, and `actions/cache` v6 in
  the vibe-badge composite action (it used a tag, so it keeps a tag). The breaking
  changes in those majors don't apply here: checkouts are same-repo, setup-node gets an
  explicit `cache: npm`, artifacts are uploaded and downloaded by name in the same run,
  and wrangler-action v4 only changes the default Wrangler for projects that don't
  install one (this repo pins `wrangler` 4.73.0).
- The local E2E run against staging with 1.65.1 passed 9 of 10. The failure,
  `quota-enforcement`, is a race in the test, not the upgrade: the queue consumer marks
  the capture complete and only then increments the usage counter in `ctx.waitUntil`,
  so a second POST right after completion can still get a 202. CI retries E2E once,
  which covers it. The proper fix needs a usage endpoint that accepts API keys, which
  is phase 0134.
