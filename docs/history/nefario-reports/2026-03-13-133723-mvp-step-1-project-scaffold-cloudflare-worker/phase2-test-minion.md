## Domain Plan Contribution: test-minion

### Recommendations

#### 1. Version Pinning: Use the Latest Stack (`@cloudflare/vitest-pool-workers@0.13.0` + `vitest@4.1.0`)

**Critical finding from live npm registry checks (2026-03-13):**

| Package | Version | Peer Dependency | Published |
|---------|---------|-----------------|-----------|
| `@cloudflare/vitest-pool-workers` | `0.13.0` | `vitest ^4.1.0` | 2026-03-13 (today) |
| `@cloudflare/vitest-pool-workers` | `0.12.21` | `vitest 2.0.x - 3.2.x` | recent |
| `vitest` | `4.1.0` | -- | 2026-03-12 (yesterday) |
| `vitest` | `3.2.4` | -- | recent |

There are two viable combinations:

- **Option A (recommended): `0.13.0` + `vitest@4.1.0`** -- This is the `latest` dist-tag on npm right now. The 0.13.0 release includes `miniflare@4.20260312.0` and `wrangler@4.73.0` as direct dependencies, meaning the test pool and the dev server use the same Miniflare version. This alignment eliminates a class of "works in dev, fails in test" discrepancies.

- **Option B (fallback): `0.12.21` + `vitest@3.2.4`** -- Proven combination, months of community use, but approaching end-of-life. The Vitest 3.x line will stop receiving patches now that 4.x is stable. Choosing this means a forced migration within weeks or months.

**Recommendation: Option A.** Rationale:

1. This project has zero existing tests and zero code -- there is no migration cost.
2. Greenfield projects should start on the latest stable to maximize runway before the next forced upgrade.
3. The `0.13.0` pool package internally upgraded its pool runner API to match Vitest 4's new custom pool contract. Starting on the old contract means doing this migration later, with existing tests.
4. `vitest@4.1.0` (not 4.0.x) is the first version supported, suggesting Cloudflare waited for the API to stabilize past the 4.0 initial releases.

**Risk mitigation for day-zero packages:** Pin exact versions (not ranges) in `package.json` and commit `package-lock.json`. If a blocking bug surfaces, downgrade to Option B is a one-line change: `"vitest": "3.2.4"` and `"@cloudflare/vitest-pool-workers": "0.12.21"`. The `defineWorkersConfig` API and `SELF` import are identical between 0.12.x and 0.13.0.

**Exact `package.json` devDependencies:**

```json
{
  "devDependencies": {
    "vitest": "4.1.0",
    "@cloudflare/vitest-pool-workers": "0.13.0",
    "wrangler": "^4.73.0"
  }
}
```

Note: `@vitest/runner@4.1.0` and `@vitest/snapshot@4.1.0` are peer dependencies of `0.13.0`, but they are also direct dependencies of `vitest@4.1.0`, so npm resolves them automatically. No need to list them explicitly.

#### 2. `vitest.config.js` Configuration (Plain JavaScript)

All Cloudflare documentation and examples use TypeScript config files. This project requires plain JS. The `defineWorkersConfig` import and API are identical -- the only difference is the file extension and the absence of type annotations.

**Recommended `vitest.config.js`:**

```js
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml',
        },
      },
    },
  },
});
```

**What `defineWorkersConfig` does internally:**
- Sets the pool to `@cloudflare/vitest-pool-workers`
- Configures module resolution for `cloudflare:test` imports
- Injects `nodejs_compat` and `export_commonjs_default` compatibility flags into the Miniflare instance
- Reads bindings, compatibility date, and Worker entry point from `wrangler.toml`

**What NOT to add:**
- `test.globals: true` -- Explicit imports (`import { describe, it, expect } from 'vitest'`) are clearer and avoid the "where does `expect` come from?" confusion. This project has no legacy tests to migrate.
- `test.environment` -- The pool IS the environment. Setting `environment` alongside the Workers pool is explicitly unsupported (see Cloudflare known issues).
- `test.coverage` -- Native V8 coverage is not supported in the Workers pool. If coverage is needed later, Istanbul instrumented coverage must be configured separately. Not a Step 1 concern.
- `test.include` patterns -- Vitest's defaults (`**/*.{test,spec}.{js,mjs,cjs}`) work fine. No need to customize unless the project adopts an unusual naming convention.

**Required `package.json` field:**

```json
{
  "type": "module"
}
```

This is non-negotiable. The `import { defineWorkersConfig } from '...'` syntax requires ESM. Cloudflare Workers use ES modules natively. The entire stack is ESM.

#### 3. Test Directory Structure: Separate `test/` Directory

**Recommendation: `test/` directory, not colocated.**

Rationale specific to this project:

1. **Cloudflare Workers have flat source structure.** The `src/` directory will contain `index.js`, `errors.js`, and a handful of modules (URL validator, signing, bundling). By Step 8, `src/` will have ~8-10 files. Colocating tests doubles the file count in `src/`, making it harder to see the actual Worker code at a glance.

2. **Integration tests don't map 1:1 to source files.** The SELF.fetch integration tests (which test the full request/response cycle through the Worker) don't naturally belong next to any single source module. A `test/health.test.js` tests the Worker entry point + router + response helper + health handler together. Putting it in `src/` alongside `index.js` overstates the coupling.

3. **Unit tests for specific modules can coexist.** Step 2 will produce `src/url-validator.js` with unit tests for specific SSRF bypass vectors. Those unit tests import the module directly (not via SELF) and belong in `test/url-validator.test.js`. The `test/` directory holds both unit tests and integration tests without confusion.

4. **Vitest's default include glob finds `test/**/*.test.js` without configuration.** No `test.include` override needed.

**Proposed structure at Step 1:**

```
src/
  index.js          # Worker entry point with route dispatch
  errors.js         # RFC 9457 problemResponse utility
test/
  health.test.js    # Integration test: GET /health via SELF.fetch
  errors.test.js    # Unit test: problemResponse produces correct shape
vitest.config.js
wrangler.toml
package.json
```

**Growth by Step 8:**

```
test/
  health.test.js              # Step 1
  errors.test.js              # Step 1
  url-validator.test.js        # Step 2 (unit: SSRF vectors)
  capture.test.js              # Step 3 (integration: POST /v1/captures)
  capture-status.test.js       # Step 3 (integration: GET status)
  signing.test.js              # Step 4 (unit: Ed25519 round-trip)
  bundling.test.js             # Step 4 (unit: canonical JSON, WACZ assembly)
  retrieval.test.js            # Step 5 (integration: GET /v1/captures/{id})
  verify.test.js               # Step 6 (integration: full capture-verify flow)
  verify-page.test.js          # Step 7 (integration: content negotiation)
```

This is ~10-12 test files, manageable in a flat `test/` directory with no subdirectories needed.

#### 4. Testing Pattern: SELF.fetch for Integration, Direct Import for Units

The Workers Vitest pool supports two testing approaches. Both run inside the Miniflare runtime (workerd), not in Node.js.

**Integration tests (SELF.fetch) -- primary pattern for endpoint tests:**

```js
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const response = await SELF.fetch('https://example.com/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    const body = await response.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
```

Key details about `SELF.fetch`:
- `SELF` is a service binding to the Worker's default export (the `fetch` handler in `src/index.js`).
- The URL host in `SELF.fetch('https://example.com/health')` is arbitrary -- only the pathname is used for routing. Convention: use `https://example.com` as the dummy host.
- Both the test and the Worker run in the same isolate. This means global mocks in the test apply to the Worker code too -- useful for mocking `fetch` calls to external services in later steps.
- The `main` entry point in `wrangler.toml` tells the pool which module's default export is the Worker. This must match the actual entry point.

**Unit tests (direct import) -- for isolated module testing:**

```js
import { problemResponse } from '../src/errors.js';
import { describe, it, expect } from 'vitest';

describe('problemResponse', () => {
  it('returns RFC 9457 problem+json response', async () => {
    const response = problemResponse(404, 'not-found', 'Not Found',
      'No route matches GET /nope');

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');

    const body = await response.json();
    expect(body.type).toBe('about:blank#not-found');
    expect(body.title).toBe('Not Found');
    expect(body.status).toBe(404);
    expect(body.detail).toBe('No route matches GET /nope');
  });
});
```

**Why this matters for Step 1:** The health endpoint test establishes the SELF.fetch pattern that all subsequent endpoint tests follow. The errors unit test establishes the direct-import pattern for module-level testing. Both patterns must work on day one.

**The `env` object for testing bindings:**

Later steps need access to KV and R2 in tests. The pool provides `env` from `cloudflare:test`:

```js
import { env } from 'cloudflare:test';

// env.CAPTURES_KV, env.CAPTURES_R2, etc.
// These are real Miniflare-backed bindings, not mocks
```

This is not needed in Step 1 (health endpoint has no bindings) but the `wrangler.toml` bindings configuration must be correct from the start so that `env` resolves properly when Steps 3-6 use it.

#### 5. Step 1 Test Suite: Exact Tests to Write

**`test/health.test.js` (integration):**

| Test | Assertion | Why |
|------|-----------|-----|
| `GET /health returns 200 with status ok` | Status 200, body `{status:"ok"}`, `Content-Type: application/json` | Core deliverable verification |
| `POST /health returns 404` | Status 404, body is RFC 9457 shape | Confirms route dispatch rejects wrong methods (per api-design-minion's recommendation, 404 not 405 for Step 1) |
| `GET /nonexistent returns 404` | Status 404, body has `type`, `title`, `status` fields | Confirms fallback route works |

**`test/errors.test.js` (unit):**

| Test | Assertion | Why |
|------|-----------|-----|
| `produces correct problem+json with all fields` | Body has `type`, `title`, `status`, `detail`; Content-Type is `application/problem+json` | Validates the complete RFC 9457 shape |
| `omits detail when not provided` | Body has `type`, `title`, `status` but no `detail` key | Validates optional field handling |
| `status code in body matches response status` | `response.status === body.status` | RFC 9457 requires the `status` member to match the HTTP status code |
| `type field uses about:blank# scheme` | `body.type` starts with `about:blank#` | Validates the type URI convention established by api-design-minion |

Total: 7 tests. This is the right size for a scaffold step -- enough to validate both patterns work, specific enough to catch regressions if someone refactors the router or error utility.

#### 6. Known Compatibility Issues and Workarounds

**Issues specific to this project setup:**

1. **No native V8 coverage.** The Workers pool runs inside workerd, which does not expose V8 coverage counters. If coverage is needed, configure Istanbul instrumented coverage (`@vitest/coverage-istanbul`). Not needed in Step 1; add when it becomes a gate.

2. **Dynamic `import()` fails in SELF-invoked handlers.** If the Worker's fetch handler uses dynamic `import()`, tests via `SELF.fetch` will fail. This project uses static imports only, so this is not a concern. Document it as a constraint: "all imports in src/ must be static."

3. **Fake timers do not affect KV/R2/cache simulators.** You cannot test KV expiration by advancing fake time. Relevant for Steps 3-6, not Step 1. The correct approach is to test expiration behavior via real time or by directly manipulating test data.

4. **Isolated storage is enabled by default.** Each test gets its own KV/R2/cache state. This is the correct default for parallel test execution and test independence. Do not disable it unless a specific test requires cross-test state (unlikely for this project).

5. **`0.13.0` was published today (2026-03-13).** This is a brand-new release. If blocking bugs are found during scaffold setup, the fallback is:
   - `"vitest": "3.2.4"` + `"@cloudflare/vitest-pool-workers": "0.12.21"`
   - The `vitest.config.js` and test code are identical between 0.12.x and 0.13.0
   - The rollback is a `package.json` version change + `npm install`, nothing else

6. **`package.json` must have `"type": "module"`.** Without this, Node.js treats `.js` files as CommonJS, and the `import` syntax in `vitest.config.js` fails before the pool even starts. This is the single most common setup failure for plain JS Cloudflare Worker projects.

7. **`wrangler.toml` must declare `main`.** The SELF binding derives the Worker entry point from the `main` field. If missing, `SELF.fetch()` calls will fail with an unhelpful error about missing module exports. Verify this is set to `src/index.js`.

#### 7. `package.json` Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "wrangler dev"
  }
}
```

- `npm test` runs all tests once and exits (CI-friendly).
- `npm run test:watch` runs Vitest in watch mode for development.
- No `test:coverage` script in Step 1 (V8 coverage unsupported, Istanbul not yet configured).

#### 8. Future-Proofing: What Steps 2-8 Need from This Foundation

The test infrastructure decisions in Step 1 propagate through all subsequent steps. Here is what each step needs and how the Step 1 scaffold supports it:

| Step | Test Type | Pattern | Foundation Dependency |
|------|-----------|---------|----------------------|
| 2: URL Validation | Unit | Direct import of `url-validator.js` | `test/` directory, direct-import pattern |
| 3: Capture Endpoint | Integration | `SELF.fetch('POST /v1/captures')` | SELF.fetch pattern, `env` for KV assertions |
| 4: WACZ/Signing | Unit | Direct import of signing module | Direct-import pattern, workerd crypto APIs |
| 5: Retrieval | Integration | SELF.fetch chain (POST -> poll -> GET) | SELF.fetch pattern, `env` for R2/KV |
| 6: Verification | Integration | Full lifecycle (capture -> verify) | SELF.fetch pattern, `env` for all bindings |
| 7: Verification Page | Integration | Content negotiation (Accept header) | SELF.fetch with custom headers |
| 8: OpenAPI/Security | Integration | Security headers on all responses | SELF.fetch response header assertions |

The critical foundation pieces from Step 1: SELF.fetch works, direct imports work, `env` bindings resolve from `wrangler.toml`, and the `test/` directory convention is established.

### Proposed Tasks

**Task 1: Create `vitest.config.js`**
- `defineWorkersConfig` with `wrangler.configPath` pointing to `./wrangler.toml`
- No extra options needed (no globals, no custom environment, no coverage)
- Validate that `vitest run` executes without errors (even with zero tests)
- Dependencies: `wrangler.toml` must exist with `main` field set

**Task 2: Create `test/health.test.js` -- integration test for GET /health**
- 3 tests: happy path (200 with `{status:"ok"}`), wrong method (404), unknown path (404)
- Uses `SELF.fetch` pattern from `cloudflare:test`
- Validates response status, Content-Type header, and body shape
- Dependencies: `src/index.js` with health handler, `vitest.config.js`

**Task 3: Create `test/errors.test.js` -- unit test for RFC 9457 utility**
- 4 tests: complete shape, optional detail omission, status code consistency, type URI scheme
- Direct import of `problemResponse` from `../src/errors.js`
- Dependencies: `src/errors.js`

**Task 4: Add test scripts to `package.json`**
- `"test": "vitest run"` for CI
- `"test:watch": "vitest"` for development
- Dependencies: `vitest.config.js`

### Risks and Concerns

1. **Day-zero `0.13.0` stability risk (MEDIUM).** The `@cloudflare/vitest-pool-workers@0.13.0` package was published today. It has had zero community soak time. The Vitest 4 pool runner API is fundamentally different from Vitest 2-3 (the custom pool contract was completely rewritten). While Cloudflare's CI runs cover the examples, edge cases in real-world projects may surface bugs.

   **Mitigation:** Pin exact versions. Keep Option B (`0.12.21` + `vitest@3.2.4`) as documented fallback. The test code and vitest config are compatible with both versions -- only `package.json` versions change. If a blocking bug appears during scaffold setup, the rollback takes 30 seconds.

   **Monitoring:** Watch the [cloudflare/workers-sdk issues](https://github.com/cloudflare/workers-sdk/issues) for 0.13.0-related reports during the first week.

2. **Plain JS is untested territory in Cloudflare's examples (LOW).** All official `vitest-pool-workers-examples` in the workers-sdk repository use TypeScript. The pool itself is JS-agnostic (it just runs workerd), but configuration edge cases in `.js` config files (vs `.ts`) may surface. Specifically: `vitest.config.js` must use ESM `import` syntax, which requires `"type": "module"` in `package.json`.

   **Mitigation:** The `defineWorkersConfig` function is runtime JavaScript regardless of config file extension. The only difference is the lack of type checking, which is intentional for this project.

3. **`wrangler.toml` binding declarations for non-existent resources (LOW).** The KV namespace and R2 bucket will not exist in Cloudflare's dashboard until later steps. Miniflare (used by both `wrangler dev` and the Vitest pool) creates in-memory simulations of these bindings regardless of whether the real resources exist. This is by design and should work, but if binding declarations cause Miniflare startup errors, remove the KV/R2/Browser Rendering bindings from `wrangler.toml` for Step 1 and add them when needed.

   **Coordination with iac-minion:** Confirm that `wrangler.toml` bindings declared for non-existent resources do not block Miniflare startup. This has worked historically but is worth verifying in the specific combination of wrangler 4.73.0 + miniflare 4.x.

4. **Test execution speed (LOW, monitor).** The Workers pool starts a workerd process for tests. Cold start is typically 1-3 seconds. With 7 tests in Step 1, total execution should be under 5 seconds. By Step 8 with ~20+ tests, watch for degradation. If tests exceed 10 seconds, consider `singleWorker: true` to reduce workerd process overhead (trades isolation for speed).

5. **Vitest 4 breaking changes beyond the pool API (LOW).** Vitest 4.x may have subtle behavioral differences from 3.x in assertion matchers, mock behavior, or error reporting. Since this project starts from zero tests, there is no migration surface. But developers familiar with Vitest 3.x patterns should check the [Vitest 4 migration guide](https://vitest.dev/guide/migration) for any changes to `expect`, `vi.mock`, or module resolution that could affect test authoring in Steps 2-8.

### Additional Agents Needed

None. The current planning team covers all foundations. One coordination point:

- **With iac-minion:** Verify that the `main` field in `wrangler.toml` is set to `src/index.js` (required for SELF.fetch to work) and that KV/R2/Browser Rendering bindings declared for non-existent resources do not cause Miniflare startup errors. This is a coordination item, not a separate consultation.
