# Software Docs Minion -- Documentation Impact Analysis

## Summary

Six files will become stale if the /health response gains `commit`, `version`, `env`, and `deployedAt` fields without corresponding documentation updates. One additional file (the smoke test script) needs a new check but that is implementation, not documentation. The documentation site (`site/`) does not reference /health and needs no changes.

## Files That Must Be Updated

### 1. `openapi.yaml` (lines 1615-1660) -- CRITICAL

The OpenAPI spec is the single source of truth for the API contract. The current `/health` response schema (lines 1638-1660) defines exactly two required properties: `status` (const `ok`) and `legal` (object with `terms` and `policy` URIs). The example at line 1655 matches.

**Required changes:**
- Add `commit`, `version`, `env`, and `deployedAt` to the `properties` block under the `/health` 200 response schema
- Decide whether the new fields are `required` or optional (they should be required -- these are compile-time constants, never absent at runtime)
- `commit`: type string, description "Git commit SHA deployed", example "43f8b68..."
- `version`: type string, description "Package version from package.json"
- `env`: type string, enum `[production, staging]`, description "Deployment environment"
- `deployedAt`: type string, format date-time, description "ISO 8601 timestamp of deployment"
- Update the `healthy` example object to include all four new fields

### 2. `README.md` (lines 498-504) -- MUST UPDATE

The "Health Endpoint" section at line 498 documents the response shape as:

```json
{ "status": "ok", "legal": { "terms": "<url>", "policy": "<url>" } }
```

This inline example becomes stale. Update to show the full new shape including `commit`, `version`, `env`, and `deployedAt` fields. Keep the description brief ("Useful for uptime monitoring, smoke tests, and deploy verification").

### 3. `OPERATIONS.md` (lines 14-17) -- SHOULD UPDATE

The "Monitoring" section shows:

```bash
curl https://api.webresourceledger.com/health
```

This bare curl is fine as-is (it still works), but the section should note that the response now includes build identity metadata and that the smoke test uses it for deploy verification. Specifically, add a brief note after the curl example explaining that `/health` returns the deployed commit SHA and environment, which the CI smoke test uses to confirm the correct revision is live.

### 4. `OPERATIONS.md` (line 112) -- SHOULD UPDATE

The emergency rollback section says:

```bash
curl https://api.webresourceledger.com/health
```

as a manual verification step. After the change, operators can now verify not just that the service is alive but confirm the exact commit deployed. Consider adding a note: "Check the `commit` field matches the expected SHA."

### 5. `CONTRIBUTING.md` (line 75) -- SHOULD UPDATE

Currently states:

> The smoke test validates four things: health endpoint returns `200 { status: "ok" }`, ...

After this change, the smoke test validates a fifth thing: that the deployed commit SHA matches `$GITHUB_SHA`. Update this sentence to mention the deploy verification check.

### 6. `OPERATIONS.md` -- Deploy to Staging / Deploy to Production sections -- CONSIDER

The deploy sections (lines 31-66) describe the staging and production deploy pipelines. The new smoke test check (commit SHA verification) is a meaningful addition to the pipeline behavior. Add a one-liner noting that the smoke job now also verifies the deployed commit matches the expected SHA. This helps operators understand that a smoke failure after deploy could mean either "service is broken" or "wrong revision deployed" -- two different diagnostic paths.

## Files That Do NOT Need Updating

- **`docs/operations/alerts.md`** -- No /health references. Alert rules trigger on capture failures, auth failures, and 5xx errors, not on health check content.
- **`docs/mcp.md`** -- Does not reference /health.
- **`site/` (documentation site)** -- No references to /health found in the Eleventy-based docs site content.
- **`docs/backlog.md`** -- No /health references.
- **`docs/evolution/` and `docs/history/`** -- Immutable historical records. Never update these retroactively.
- **`test/health.test.js`** -- Needs updating (assertions for new fields), but this is implementation work, not documentation. Noting for completeness.
- **`scripts/smoke-test.sh`** -- Needs the new $GITHUB_SHA check, but this is implementation, not documentation.

## Recommendations for the Implementer

1. **OpenAPI spec first**: Update `openapi.yaml` before writing code. This is the design-first contract. The new fields should be `required` since they are compile-time constants injected at build time and will always be present.

2. **Keep README example compact**: The README health example should show the full JSON but does not need a field-by-field explanation. The OpenAPI spec is the detailed reference.

3. **OPERATIONS.md is the operator's runbook**: Operators use the health endpoint for deploy verification. Make sure OPERATIONS.md explains that `commit` in the response should match the deployed SHA, and `env` should match the target environment. This is the "why do I care about these new fields" context.

4. **Smoke test description in CONTRIBUTING.md**: The smoke test validation list is a useful orientation for contributors. Keep it in sync -- add the fifth check.

5. **Do not document build-time injection mechanism in README**: How `commit`, `version`, etc. get injected (wrangler define, environment variables, etc.) belongs in CONTRIBUTING.md or a code comment, not in README. README documents what the API returns, not how the sausage is made.
