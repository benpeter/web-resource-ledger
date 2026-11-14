# Outcome

- Red first (84986ee), then green (0ceb0d5).
- `landing/public/.well-known/security.txt` (new); `src/index.js` route,
  `HEAD_PATHS` and verify allowlist; `site/src/index.js` redirect.
- Tests: `test/security-txt.test.js` and `test/security-txt-sync.test.js`
  (new), `test/docs-worker.test.js`.
- Docs: `docs/INTERNALS.md` route table and HEAD paths, `SECURITY.md`,
  CHANGELOG.
- Renew `Expires` by 2027-10-02; the sync test
  fails from that day.

## Backlog changes

- #97 (new, Someday): renew the `Expires` date by 2027-10-02.
