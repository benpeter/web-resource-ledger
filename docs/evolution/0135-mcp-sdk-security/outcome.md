# Outcome

- `package.json`/`package-lock.json`: `@modelcontextprotocol/sdk` ^1.32.2, `zod` ^4.6.7,
  transitive updates from `npm audit fix`.
- `src/mcp.js`: `maxToolInputElements: 1000` and `maxRequestBodySize: 256 KiB`.
- `test/mcp.test.js`: a 1,001-URL `batch_capture` gets the element-limit error, a
  300 KB body gets 413. Red first (a4efdf3).
- `site/content/mcp.md`: troubleshooting entry for both limits. CHANGELOG: Security.

## Backlog changes

- New in benpeter/wrl-backlog: move the test stack to vitest 4 and
  vitest-pool-workers 0.23 (clears the remaining dev-only audit findings).
