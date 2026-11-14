# Outcome

- Red first (7b75aa1), then green (8e7ece9).
- `site/content/notifications.md` (new), `site/_data/site.js` (nav),
  `site/content/llms.njk` (docs llms.txt).
- Tests: `test/notifications-sync.test.js` (in `npm run test:sync`): every
  notification type in `DEFAULT_PREFS` has its dashboard label on the page, the
  dashboard has a label for every type, and the nav links the page.
- Docs: CHANGELOG.

## Backlog changes

- None. #35 (an email for a batch refused for exceeding the free captures left)
  stays open; the page describes today's behaviour, a `429` and no email.
