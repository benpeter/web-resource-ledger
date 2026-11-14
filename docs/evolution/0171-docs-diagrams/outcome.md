# Outcome

- Red first (506a13f), then green (9c04e02).
- `site/diagrams/*.mmd` (5 sources), `site/assets/diagrams/*.svg`,
  `scripts/render-diagrams.mjs` and `npm run docs:diagrams`,
  `site/content/architecture.md` and `site/content/security/whitepaper.md`
  (linked images with alt text), `site/css/docs.css`,
  `site/_includes/layouts/base.njk` (inline script removed),
  `site/eleventy.config.js`.
- Tests: `test/docs-diagrams-sync.test.js` (registered in
  `vitest.sync.config.ts`, excluded in `vitest.config.js`).
- Checked in the browser against the local build at 1440 px: all five load,
  no horizontal scroll, labels readable.
- Docs: CHANGELOG.

## Backlog changes

- None.
