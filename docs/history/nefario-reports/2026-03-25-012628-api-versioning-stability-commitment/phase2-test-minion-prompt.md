You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

WRL's API is formally versioned at 1.0.0 with a published changelog, deprecation policy, and semantic versioning for Worker releases. This signals stability to integrators and establishes a contract for how breaking changes will be communicated.

Success criteria:
- openapi.yaml version field set to 1.0.0
- CHANGELOG.md published at repo root with all changes since initial release
- Deprecation policy documented: minimum 6-month notice
- Deprecated endpoints return Deprecation and Sunset headers per RFC 8594
- Worker releases tagged with semantic versions (annotated tags)
- CI enforces that openapi.yaml version matches the latest git tag
- API version header (WRL-API-Version) returned on all responses
- CHANGELOG.md updated as part of every PR that changes API behavior

## Your Planning Question

What's the right test strategy for verifying the WRL-API-Version header appears on all responses? The existing security-headers.test.js (test/security-headers.test.js) already tests that Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS, and Link headers are present across 5 representative routes (health 200, captures 401, captures/{id} 404, .well-known 200, catch-all 404) using a shared expectSecurityHeaders() helper. Should the WRL-API-Version assertion be added to that existing helper and test file, or does it warrant a separate test file? How should the deprecation header mechanism be tested -- unit tests on the config/middleware, integration tests on specific routes, or both? For the CI version-match check (whatever form iac-minion recommends), should there be a test that validates the check script itself, or is CI-level validation sufficient? Is there a risk of test brittleness if tests hardcode the version string?

## Context

- Existing test/security-headers.test.js with its expectSecurityHeaders() helper pattern
- Tests 5 representative routes: health 200, captures 401, captures/{id} 404, .well-known 200, catch-all 404
- Cloudflare Workers test harness using SELF from cloudflare:test and vitest
- Existing test/health.test.js tests build metadata is undefined in test context
- 57 test files exist across unit and integration
- Test infrastructure uses @cloudflare/vitest-pool-workers for in-worker testing

## Context Boundary
test-minion designs the test strategy. The actual response header implementation is done by the executing agent, not test-minion. test-minion should recommend what to test and where, so the execution plan includes testable acceptance criteria.

## Instructions
1. Read test/security-headers.test.js and test/health.test.js to understand the current testing patterns
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: test-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase2-test-minion.md
