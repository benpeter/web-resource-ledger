## Verdict: ADVISE

The plan is structurally sound. The three-assertion drift test design is correct, the inline-map decision is right, and the task blocking/ordering is appropriate. Two issues need explicit guidance before execution — neither is a blocker, but the implementing agent needs to know what to expect.

---

### Issue 1: poolMatchGlobs will not work — expect the fallback path (medium risk)

The vitest config uses `defineWorkersConfig` from `@cloudflare/vitest-pool-workers`. This wrapper takes control of the pool configuration globally. `poolMatchGlobs` is a standard vitest option for mixing pool types across files, but the cloudflare pool plugin shows no evidence of supporting it in the installed package — no matching symbols found in the package.

The plan already documents the fallback: a separate `vitest.sync.config.ts` with a standard Node pool and a `test:sync` npm script. That is the right path. The task prompt should front-load this: **start with the separate config, do not attempt `poolMatchGlobs` first**. Attempting it, watching it fail, then switching wastes a round-trip.

The CI integration note ("ensure CI runs both") needs to be more specific. The implementing agent should add `test:sync` to the `test` script in `package.json` as a sequential step (e.g., `"test": "vitest run && npm run test:sync"`) or add it to whatever CI workflow file runs tests. Leaving it as a separate script that CI must be manually configured to call is an incomplete deliverable.

**Recommendation**: Update Task 2 to say: create `vitest.sync.config.ts` directly (skip trying `poolMatchGlobs`). Also require updating the `test` npm script or the CI workflow file to include `test:sync`, and name which file to update.

---

### Issue 2: get_certificate test fixture complexity (low-medium risk)

The plan says to seed "a complete capture with WACZ data." `generateCertificate` takes `(capture, signingKeys, origin)` — the signing keys are not part of the capture record, they are loaded from env bindings (`SIGNING_KEY`) and the archived keys table in the MCP handler. The test must either:

- Set up the handler to resolve keys from `env.SIGNING_KEY` (the test binding already has a generated Ed25519 key, so this path should work), or
- Call `generateCertificate` directly, which requires constructing `signingKeys` from the test binding

The implementing agent needs to look at how the `get_certificate` MCP handler (Task 1) retrieves signing keys, then mirror that setup in the test. The plan's instruction "needs a complete capture with WACZ data" glosses over the key-loading concern. If the handler reads `SIGNING_KEY` from the Worker env, the test env already provides it — the fixture complexity is manageable. If it does something more complex (e.g., uses `listArchivedSigningKeys`), the test needs additional DB seeding.

This is not a blocker — the `SIGNING_KEY` env binding exists in the test config and `completeCapture` is exported. But the implementing agent for Task 3 should read the `get_certificate` handler produced by Task 1 before writing the test, rather than proceeding from the plan description alone. The task prompt already says to read Task 1 output, so this is a reminder to actually do it.

---

### Confirmations (no action needed)

- `completeCapture` and `incrementUsage` are both exported from `src/db.js` — fixture setup for `diff_captures`, `get_usage`, `list_schedules` tests is straightforward.
- The three sync test assertions (completeness, no-overlap, no-stale) are complete and correct. No fourth assertion needed.
- Deferring parameter parity checking is correct — the camelCase/snake_case mapping is genuinely fragile and per-tool tests catch regressions more reliably.
- The `delete_schedule` scope note in the plan ("read (implicit)") is accurate but worth verifying: if delete requires `capture` scope in the API, the MCP tool should match. Task 3 should include a scope mismatch test for `delete_schedule` if Task 1 adds a scope check to it.
