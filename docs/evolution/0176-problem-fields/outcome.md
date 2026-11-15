# Outcome

- Red first (d02e305): five fields undocumented (`limitType`, `quota`,
  `threatTypes`, `quarantineReason`, `quarantinedAt`), then green (e207abe).
- `openapi.yaml`: `ProblemLimit`, `ProblemThreat`, `ProblemQuarantined`; the
  429, 422 and 451 responses use them; 451 added to verify and diff; 451
  examples corrected. `npm run lint:api`: 12 warnings before, 3 after.
- `site/content/webhooks.md`: verification of a quarantined capture answers
  451 too. CHANGELOG under fixed.
- `npm run test:sync` 51/51, `npm run build:docs`.

## Backlog changes

- None.
