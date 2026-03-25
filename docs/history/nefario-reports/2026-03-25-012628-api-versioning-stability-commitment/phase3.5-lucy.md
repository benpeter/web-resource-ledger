# Lucy Review: api-v1-stability

## Verdict: ADVISE

The plan is well-aligned with the original request. All 10 success criteria from the prompt map to plan tasks with no orphans and no omissions. CLAUDE.md conventions are respected. Two items warrant adjustment before execution.

---

## Requirement Traceability

| Original Success Criterion | Plan Task | Status |
|---|---|---|
| openapi.yaml version 1.0.0 | Task 1, Step 3 | Covered |
| CHANGELOG.md with all changes since initial release | Task 3, CHANGELOG section | Covered |
| Deprecation policy (6-month notice) | Task 3, DEPRECATION-POLICY section | Covered |
| Deprecated endpoints return Deprecation + Sunset headers (RFC 8594) | Task 2, Steps 3-4 | Covered (RFC corrected to 9745 for Deprecation -- valid improvement) |
| Worker releases tagged with semantic versions | Plan notes manual v1.0.0 tag post-merge | Covered |
| CI enforces openapi.yaml version matches latest git tag | Task 5, Step 1-2 | Partially covered (see ADVISE-1) |
| WRL-API-Version header on all responses | Task 2, Step 2 | Covered |
| CHANGELOG.md updated as part of every PR (PR template checklist) | Task 5, Step 4 | Covered |
| Scope-out: version negotiation, automated changelog, SDK/client-lib | Plan "What NOT to do" sections | Respected |
| Scope-out: API version negotiation (v2 routing) | Not in plan | Respected |

---

## Findings

### ADVISE-1: CI check verifies package.json == openapi.yaml, not git tag as requested

- **SCOPE**: `scripts/check-version-sync.sh` (Task 5)
- **CHANGE**: The original request states "CI enforces that openapi.yaml version matches the latest git tag." Task 5 enforces that openapi.yaml matches package.json -- a weaker guarantee. The git-tag-to-version link is not CI-enforced.
- **WHY**: This is a reasonable pragmatic deviation (tags are created post-merge, so pre-merge CI cannot compare against a tag that does not yet exist). The three-way chain (API_VERSION == openapi.yaml == package.json == BUILD_VERSION) provides equivalent traceability during development. However, nothing prevents a tagged release from diverging from the committed version if someone creates a tag manually with the wrong name. If this deviation is intentional, acknowledge it in decisions.md so the traceability gap is documented. If git-tag enforcement matters, a post-merge or release workflow step could validate it.
- **TASK**: Task 5

### ADVISE-2: ROUTE_KEYS regex-to-template conversion is fragile and arguably YAGNI

- **SCOPE**: `ROUTE_KEYS` map in `src/index.js` (Task 2, Step 4)
- **CHANGE**: Task 2 introduces a `ROUTE_KEYS` Map that converts regex `source` strings into human-readable route keys via string replacement (`\\/` to `/`, stripping `^$`, replacing capture groups with `:param`). This exists solely to look up entries in the `DEPRECATIONS` object, which ships empty. The regex-to-template conversion is a heuristic that may break on non-trivial patterns.
- **WHY**: CLAUDE.md Engineering Philosophy says "YAGNI -- don't build it until you need it." The deprecation header injection mechanism (Steps 3-4 of Task 2) is infrastructure for a future need -- no endpoints are deprecated at v1.0.0. Defining the empty `DEPRECATIONS` module and the commented example is reasonable documentation of intent. But the `ROUTE_KEYS` map, the `matchedRouteKey` threading through the routing loop, and the post-response conditional injection are runtime code that executes on every request to support a feature that produces zero output today. Consider deferring the ROUTE_KEYS map and the post-response deprecation injection block to the phase that actually deprecates an endpoint. Keep only: (a) `src/deprecations.js` as a documented empty config with schema comments, and (b) the test that validates the DEPRECATIONS schema is correct. This reduces the diff, removes a fragile heuristic, and defers complexity to the point of need.
- **TASK**: Task 2 (Steps 3-4), Task 4 (tests for ROUTE_KEYS and deprecation injection)

---

## Convention Compliance

| Check | Status |
|---|---|
| YAGNI | ADVISE-2 flagged |
| KISS | Acceptable -- 5 tasks for 10 acceptance criteria is proportional |
| Fail loudly | Version header absent (not fallback) when BUILD_VERSION undefined -- correct |
| Test real boundaries | Tests use SELF.fetch against real Worker pool -- compliant |
| Evolution log | Not in task list -- but this is expected to be handled by nefario wrap-up |
| Lightweight/vanilla | No new dependencies introduced -- compliant |
| Serverless-first | Cloudflare Workers -- compliant |

## Scope Assessment

No scope creep detected. The plan's out-of-scope declarations match the original request's exclusions. Task count (5) is proportional to the requirement count (10 success criteria). No technology expansion, no abstraction layers, no adjacent features beyond what was asked.
