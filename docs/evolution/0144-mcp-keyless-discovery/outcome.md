# Outcome

- `src/mcp.js`: `KEYLESS_METHODS`, `isKeylessDiscovery()`, the per-IP limit, and
  `serveMcp()` split out of `handleMcp()` so both paths build the server the same way.
- Tests, red first (7049013): `test/mcp.test.js` "keyless discovery" (seven tests; the
  three 401 guards passed before the change and still do).
- `site/content/mcp.md` (generic client setup, troubleshooting), `site/content/limits.md`,
  `docs/INTERNALS.md` route table, `docs/operations/coralogix-events.md`, CHANGELOG.

## Backlog changes

- benpeter/wrl-backlog#8 and #9: commented; directories that probe `/mcp` can now list
  the tools. Whether Glama's score moves is still open.
