# Outcome

- Red first (7853962), then green (1daeabe).
- `src/rescan.js`: `RESCAN_MIN_AGE_MS` (12 hours) instead of a 24-hour cutoff.
- Tests: `test/rescan.test.js` (new).
- Docs: `site/content/security/whitepaper.md` (re-scan scope, DigiCert
  address), `docs/INTERNALS.md` cron table, CHANGELOG.
- To confirm after deploy: `threat_checks` on 2026-11-15 and 2026-11-16 each
  have about 282 rows.

## Backlog changes

- None.
