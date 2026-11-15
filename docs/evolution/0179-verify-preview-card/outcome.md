# Outcome

- Red first (cf9c03b): 17 tests failed (no Open Graph tags, JSON for every
  preview client, `_fmt=json` cache key), then green (fe79fda). The two
  "keeps JSON" tests passed before and after, as guards.
- `src/cache.js`: `wantsHtml()` and `LINK_PREVIEW_AGENTS`; `buildCacheKey`
  uses it. `src/index.js`: the verify handler uses it and passes the capture's
  URL, time and result to the page. `src/verify-page.js`: `previewCardTags`.
- Docs: `verification.md`, the `GET /v1/verify/{captureId}` description in
  `openapi.yaml`, `docs/INTERNALS.md`, CHANGELOG under added.
- `npm run test:sync` 57/57, `npm run lint:api` exit 0, `npm run build:docs`,
  full suite 86 files, 2017 passed, 2 skipped.

## Backlog changes

- #94 closed with the two decisions (card names the URL, image is the WRL
  card).
