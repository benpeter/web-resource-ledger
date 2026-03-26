# Margo Review: sync-mcp-api-drift-prevention

## Verdict: APPROVE

This plan is proportional to the problem. The synthesis made the right calls on every conflict resolution -- each one chose the simpler option and cited YAGNI/KISS correctly.

### What the plan got right

1. **11 tools, not 15 or 31.** The webhook and artifact download exclusions are correct. Webhooks require infrastructure knowledge agents do not have. Binary content is a poor MCP fit. The scope boundary (tenant-facing agent jobs only) is clean.

2. **Inline maps over separate JSON manifest.** 25 lines of mapping data do not warrant a separate file. The test file is the single source of truth. Correct KISS call.

3. **No parameter parity checking.** The camelCase/snake_case mapping would be fragile and require its own maintenance. Per-tool tests catch parameter regressions more reliably. Correct deferral.

4. **Manual docs over generator script.** 11 tools that change infrequently do not justify a build step. The drift-detection test already catches structural changes. Correct YAGNI call.

5. **No new dependencies.** The plan adds no packages. `yaml` is already in devDependencies. `zod` and the MCP SDK are already imported.

6. **Single file stays under threshold.** ~850 estimated lines for `src/mcp.js` is reasonable for 11 tool registrations that follow a repetitive pattern. No premature splitting.

### Minor observations (non-blocking)

- **Two doc files (`docs/mcp.md` and `site/content/mcp.md`) with identical content** is a duplication smell. The plan correctly defers consolidation as out of scope. Worth a backlog item if not already there.

- **`getSchedule` exclusion reasoning is sound** but should be validated during Task 1: if `list_schedules` does not return schedule details (only IDs and names), a `get_schedule` tool may be needed. The plan accounts for this ("Adjust if Task 1 includes it").

### Complexity budget tally

| Addition | Cost (managed) |
|----------|---------------|
| 7 new tool definitions (same pattern, same file) | 0 -- no new abstractions |
| 1 new test file (drift detection) | 1 -- new abstraction (the mapping contract) |
| Vitest pool config change | 1 -- configuration complexity |
| Per-tool test additions | 0 -- extending existing pattern |
| Manual docs update | 0 |
| **Total** | **2** |

Total complexity spend of 2 is well within budget for the value delivered (permanent drift prevention + complete MCP surface).

No unjustified complexity found. No scope creep. No premature optimization. No unnecessary dependencies. Proceed.
