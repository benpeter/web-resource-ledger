# Margo Review: OpenAPI Spec and Security Hardening

## Verdict: ADVISE

The plan is well-scoped and proportional to the problem. Seven tasks for a
hardening step covering security headers, backpressure, a new endpoint, OpenAPI
spec completion, tests, documentation, and risk documentation is reasonable.
The conflict resolutions consistently favor simplicity (no keyId, no
signingKeyUrl in every response, no key versioning elevation). Good discipline.

Two non-blocking concerns:

---

### Concern 1: `@redocly/cli` as a new devDependency

- [simplicity]: Adding `@redocly/cli` introduces a new devDependency for a one-time validation task.
  SCOPE: `package.json` devDependencies, Task 4
  CHANGE: Consider running `npx @redocly/cli lint openapi.yaml` in the task without permanently adding it to `package.json`. If the team wants ongoing CI linting, add it then -- not speculatively now. If it stays, pin to an exact version (not `^1.34.0`) to avoid surprise breakage on `npm ci`.
  WHY: The project currently has 3 devDependencies and 2 runtime dependencies -- extremely lean. `@redocly/cli` pulls ~50 transitive packages. Adding it permanently locks in maintenance burden (updates, audit noise, install time) for a lint that runs infrequently. The `npm run lint:api` script suggests ongoing use, but there is no CI pipeline yet to run it automatically. If the intent is "validate once during this task," `npx` achieves the same result without the permanent cost.
  TASK: Task 4

---

### Concern 2: Task 7 (DNS Pinning Risk Documentation) scope is pure documentation with no code change

- [simplicity]: Task 7 expands a code comment by ~7 lines and reviews existing tests without modifying them -- this is low-value as a standalone delegated task.
  SCOPE: Task 7, `src/url-validation.js`
  CHANGE: Fold the 7-line comment expansion into Task 1 (security-minion is already assigned to both). This eliminates one task, one delegation round-trip, and one context-loading cycle for a trivial change.
  WHY: The task description itself says "do NOT write new tests" and the deliverable is ~7 lines of comments plus a confirmation that existing tests are sufficient. Delegating this as a standalone task with its own model invocation, context loading, and file reading is disproportionate overhead for the output. security-minion is already assigned Task 1; adding "also expand the TOCTOU comment in url-validation.js" to that prompt costs nothing and saves a full task cycle.
  TASK: Task 7

---

Everything else looks clean:

- **YAGNI compliance**: The resolutions on keyId, signingKeyUrl, key versioning elevation, and CSP scope are all correct YAGNI calls.
- **Dependency count**: No new runtime dependencies. The signing-key endpoint reuses existing `getSigningKeys()`.
- **Abstraction layers**: Zero new abstractions. The handler is a flat function in `index.js`, consistent with the existing pattern.
- **Scope alignment**: The 7 tasks map directly to the 6 work items in the original request (the 7th, DNS pinning, was in the original issue as "DNS pinning enforcement verified").
- **Infrastructure proportionality**: One new rate limiter binding using an existing pattern. No new services or infrastructure.
- **Complexity budget**: Negligible. One new route, one new handler (~15 lines), two header lines, one rate limiter binding, spec documentation, and tests.
