# Outcome

- `site/package-lock.json` updated; no red test (dependency update, no
  behaviour change).
- `npm audit` in `site/`: 8 vulnerable packages before, 0 after.
- Docs build: 41 files from each build, 40 byte-identical, `sitemap.xml` with
  the same URLs in another order.
- `npm run build:docs` and `npm run test:sync` (46/46) pass.

## Backlog changes

- None.
