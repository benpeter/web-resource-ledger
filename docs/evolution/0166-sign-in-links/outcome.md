# Outcome

- Red first (2e9f9f0), then green (d973964).
- `landing/public/*.html` (seven headers, the hero), `site/_includes/layouts/base.njk`
  (docs navigation), `site/content/use-cases/marketplace-evidence.md`.
- Tests: `test/sign-in-links-sync.test.js` (in `npm run test:sync`).
- Settings handler: `test/account-settings.test.js` passed on the old code
  (08bd189), then the cleanup in `src/account.js` and a comment in `src/index.js`
  (444a85e).
- Docs: CHANGELOG.

## Backlog changes

- #90: noted that landing visitors could only sign in with GitHub until this
  phase; the issue stays open to see whether sign-ups and first captures move.
- #46: the use-case pages' prose is checked; the marketplace page's sign-in link
  was the one finding.
