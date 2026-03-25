# Margo -- Complexity Review

## Verdict: ADVISE

The plan is well-scoped overall. 5 tasks for a v1.0.0 stability commitment is proportional. The spec work, docs, CI, and tests all have clear justification. Three items warrant simplification before execution.

---

### Findings

- [simplicity]: ROUTE_KEYS map is a premature abstraction for an empty DEPRECATIONS registry
  SCOPE: `src/index.js` -- ROUTE_KEYS Map and `matchedRouteKey` variable threading
  CHANGE: Delete ROUTE_KEYS entirely. When the first deprecation is actually needed, the implementer adds the lookup mechanism alongside the first real entry. The entire deprecation header injection block in the post-response section (the `if (matchedRouteKey)` block) will never execute at v1.0.0 because DEPRECATIONS is empty. Building a regex-to-template translation layer, threading a variable through the routing loop, and writing tests for ROUTE_KEYS coverage -- all for code that cannot fire -- is textbook YAGNI. The deprecations.js file with its documented schema is sufficient to establish the mechanism; the runtime lookup can arrive with the first real use.
  WHY: This is ~15 lines of non-trivial regex manipulation code (pattern.source translation with 4 chained replace calls) plus routing loop modifications plus a dedicated test for coverage -- all dead code at ship time. Dead code is not free: it must be read, understood, and kept in sync with the routes array on every route addition. The ROUTE_KEYS test (Task 4, test case 4) creates a maintenance obligation to update the test every time a route is added, for a feature that does nothing.
  TASK: Task 2 (remove ROUTE_KEYS map, matchedRouteKey threading, and the `if (matchedRouteKey)` block from src/index.js), Task 4 (remove ROUTE_KEYS coverage test and simplify deprecation tests to just verifying the DEPRECATIONS export is an empty object)

- [simplicity]: src/version.js is unnecessary indirection
  SCOPE: `src/version.js` -- new file with a single constant
  CHANGE: Delete `src/version.js`. The test that needs a version constant to compare against should read it from `package.json` directly (e.g., `import pkg from '../package.json' with { type: 'json' }`). The plan already acknowledges this alternative in the Task 4 prompt (line 468). CI enforces `package.json == openapi.yaml`, so `package.json` is the single source of truth. A separate version.js file creates a third place where the version string lives (alongside package.json and openapi.yaml), adding a sync obligation rather than reducing one. The stated justification -- "gives tests an importable value" -- is solved by importing package.json, which already exists and is already the deploy pipeline's source for BUILD_VERSION.
  WHY: Every additional file that contains the version string `'1.0.0'` is another place that must be updated on every version bump. package.json and openapi.yaml are unavoidable (CI-enforced sync). A third copy in src/version.js adds a coordination point with no offsetting benefit.
  TASK: Task 2 (do not create src/version.js), Task 4 (import version from package.json instead of src/version.js)

- [simplicity]: src/deprecations.js as an empty file ships dead infrastructure
  SCOPE: `src/deprecations.js` -- new file exporting `{}`
  CHANGE: This is a soft concern, not a blocking one. The file is 14 lines of comments documenting the schema and one line of code (`export const DEPRECATIONS = {};`). The schema documentation has value as a contract for future implementers. However, if ROUTE_KEYS is removed per the first finding, this file becomes purely a documented empty object with no runtime consumer. Consider deferring it alongside ROUTE_KEYS -- create both when the first deprecation is real. The DEPRECATION-POLICY.md document (Task 3) already establishes the commitment and header format; the code can arrive with the first use.
  WHY: An empty config file with no runtime consumer is documentation masquerading as code. The deprecation policy document covers the commitment; the implementation can arrive with the first actual deprecation.
  TASK: Task 2 (consider deferring), Task 4 (remove deprecation-specific tests if file is deferred)
