# Outcome

- Red first (6928827), then green (af6e221).
- `src/ui/ui-submit.js`: `capturesEmptyText` says what a capture produces;
  `submit_emptyState` and `submit_renderEmptyState` build the empty list.
  `src/ui/ui-css.js`: spacing inside the empty box and the accent colour for its
  links, like the schedule nudge.
- Tests: `test/ui-submit.test.js` (text, example, links, filtered list);
  `test/ui-schedules.test.js` follows the new text.
- Checked in a browser against a local stub of the API, at desktop and phone
  width: the example fills and focuses the URL box, Enter captures, the empty box
  goes away, and the schedule nudge from phase 0160 follows.
- Docs: CHANGELOG. The getting-started page describes the capture form in one
  sentence and needs no change.

To see whether it helps: `SELECT t.id, t.created_at, (SELECT COUNT(*) FROM captures c
WHERE c.tenant_id = t.id) FROM tenants t WHERE t.created_at >= '2026-11-15'`.

## Backlog changes

- #90: the empty-page ideas are built (example URL, API and MCP pointers); the
  one-click capture was left out on purpose, see decisions. The issue stays open
  until new accounts show whether it helps.
