# Phase 3: Synthesis -- MVP Step 1: Project Scaffold and Cloudflare Worker

## Delegation Plan

**Team name**: wrl-scaffold
**Description**: Establish the Cloudflare Worker project scaffold, test infrastructure, and shared error utilities as the foundation for all subsequent MVP steps.

---

### Conflict Resolutions

#### 1. Error utility API signature

**api-design-minion** recommended `problemResponse(status, type, title, detail)` with `type` as `about:blank#<slug>` (4 parameters, caller controls the type slug and title).

**api-spec-minion** recommended `problemResponse(status, detail, headers?)` with `about:blank` as the fixed type and title auto-derived from a status code lookup table (2+1 parameters, caller only provides status and detail).

**Resolution: api-spec-minion's signature wins.** Rationale:

- Since all WRL errors use `about:blank`, a caller-provided type slug adds no information and creates a consistency hazard. Every call site would need to pass the "correct" slug, and there is no enforcement that slugs stay consistent across 8 implementation steps.
- Auto-deriving title from status code eliminates another class of inconsistency ("Not Found" vs "not found" vs "Resource Not Found").
- The `headers` parameter handles 405 `Allow` and 503 `Retry-After` cleanly without dedicated parameters.
- api-design-minion's `about:blank#<slug>` fragment is a creative idea, but api-spec-minion correctly notes that the slugs add no machine-readable value beyond the HTTP status code itself. The `detail` field carries the occurrence-specific information. KISS.

Final signature: `problemResponse(status, detail, headers?)` with `about:blank` type and auto-derived title.

#### 2. Version pinning: latest vs. stable test stack

**test-minion** recommended two options:
- Option A (recommended): `vitest@4.1.0` + `@cloudflare/vitest-pool-workers@0.13.0` (released today/yesterday)
- Option B (fallback): `vitest@3.2.4` + `@cloudflare/vitest-pool-workers@0.12.21`

**iac-minion** recommended `vitest ~3.1.0` + `@cloudflare/vitest-pool-workers ^0.8.0` (conservative ranges).

**Resolution: test-minion's Option A with exact pinning.** Rationale:

- test-minion did live npm registry checks and confirmed the actual peer dependency requirements. iac-minion's ranges are based on older documentation and may not resolve correctly.
- Greenfield project with zero tests means zero migration cost. Starting on the latest maximizes runway.
- Exact pinning (no ranges) eliminates surprise breakage. The fallback to Option B is a 30-second change.
- `package-lock.json` will be committed for reproducibility.

Final versions: `vitest: "4.1.0"`, `@cloudflare/vitest-pool-workers: "0.13.0"`, `wrangler: "^4.73.0"`.

#### 3. Response helper location

**api-design-minion** proposed a separate `src/response.js` for `jsonResponse()`.

**Resolution: Merge into `src/responses.js`.** Both `jsonResponse` and `problemResponse` are response construction utilities. Two separate files for two small functions is over-decomposition. A single `src/responses.js` with both exports is cleaner. This also matches the naming pattern better -- it is a "responses" module, not just an "errors" module.

#### 4. api-design-minion's `about:blank#<slug>` type URI

**api-design-minion** proposed `about:blank#not-found`, `about:blank#method-not-allowed`, etc.

**api-spec-minion** proposed plain `about:blank` with no fragment, arguing the fragment adds no value beyond what the status code provides.

**Resolution: api-spec-minion wins -- use plain `about:blank`.** The fragment is inventive but violates KISS. Clients should switch on `status`, not parse `type` fragments. Adding fragments creates a namespace to manage that nobody will consume.

---

### Task 1: Project scaffold -- config files, dependencies, directory structure

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are setting up the project scaffold for WRL (Web Resource Ledger), a
    Cloudflare Worker project. This is a greenfield project -- nothing exists
    yet except docs. Create the foundational config files and directory structure.

    ## What to create

    ### 1. `wrangler.toml`
    ```toml
    #:schema node_modules/wrangler/config-schema.json
    name = "wrl"
    main = "src/index.js"
    compatibility_date = "2026-03-13"
    compatibility_flags = ["nodejs_compat"]

    [[r2_buckets]]
    binding = "BUCKET"

    [[kv_namespaces]]
    binding = "KV"

    [browser]
    binding = "BROWSER"
    ```

    Design decisions:
    - Flat config, no `[env.*]` sections (single developer, YAGNI)
    - Auto-provisioned bindings (no resource IDs needed -- wrangler >= 4.45.0)
    - `nodejs_compat` from day one (needed for Browser Rendering in Step 3)
    - Short uppercase binding names: `BUCKET`, `KV`, `BROWSER`
    - `compatibility_date` set to today (2026-03-13)

    ### 2. `package.json`
    ```json
    {
      "name": "wrl",
      "version": "0.1.0",
      "private": true,
      "type": "module",
      "scripts": {
        "dev": "wrangler dev",
        "deploy": "wrangler deploy",
        "test": "vitest run",
        "test:watch": "vitest"
      },
      "devDependencies": {
        "@cloudflare/vitest-pool-workers": "0.13.0",
        "vitest": "4.1.0",
        "wrangler": "^4.73.0"
      }
    }
    ```

    Key points:
    - `"type": "module"` is mandatory (ESM required by Workers AND vitest config)
    - Exact version pins for vitest and pool-workers (no ranges) -- day-zero releases
    - Wrangler uses caret range (stable, well-tested)
    - All deps are devDependencies (Worker runs on Cloudflare's runtime)

    ### 3. `vitest.config.js`
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

    No extra options -- no globals, no custom environment, no coverage config.

    ### 4. `.gitignore` (append to existing file)

    Append these entries to the existing `.gitignore`:
    ```
    # Dependencies
    node_modules/

    # Wrangler local state
    .wrangler/

    # Local secrets
    .dev.vars
    ```

    ### 5. Directory structure

    Create empty directories:
    - `src/` (Worker source files go here)
    - `test/` (Test files go here)

    ### 6. Run `npm install`

    After creating package.json, run `npm install` to generate
    `package-lock.json` and install dependencies.

    ## Version fallback

    If `npm install` fails due to peer dependency conflicts with
    `vitest@4.1.0` + `@cloudflare/vitest-pool-workers@0.13.0`, fall back to:
    ```json
    {
      "@cloudflare/vitest-pool-workers": "0.12.21",
      "vitest": "3.2.4",
      "wrangler": "^4.73.0"
    }
    ```
    The vitest.config.js and all test code are compatible with both versions.

    ## What NOT to do
    - Do NOT add environment sections to wrangler.toml
    - Do NOT add resource IDs to bindings
    - Do NOT add `workers_dev`, `[vars]`, `[triggers]`, or `[routes]` to wrangler.toml
    - Do NOT add any runtime dependencies (only devDependencies)
    - Do NOT create subdirectories inside `src/` or `test/`
    - Do NOT add test coverage configuration
    - Do NOT create a README (it will be handled separately)

    ## Verification
    - `npm test` runs without errors (may show "no tests found" -- that is fine)
    - `npm run dev` starts wrangler dev without binding errors (ctrl-c to exit)
    - `.gitignore` includes `node_modules/`, `.wrangler/`, `.dev.vars`

- **Deliverables**: `wrangler.toml`, `package.json`, `package-lock.json`, `vitest.config.js`, updated `.gitignore`, `src/` directory, `test/` directory
- **Success criteria**: `npm install` completes without errors; `npm test` executes (even if no tests found); `npm run dev` starts wrangler without binding errors

---

### Task 2: Worker entry point and response utilities

- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are creating the Cloudflare Worker entry point and response utilities
    for WRL (Web Resource Ledger). The project scaffold (wrangler.toml,
    package.json, vitest.config.js) already exists from a prior task.

    ## What to create

    ### 1. `src/responses.js` -- Response utilities

    This module contains both the RFC 9457 error utility and the JSON success
    response helper. Two functions, one module.

    ```js
    /**
     * HTTP status code to standard reason phrase mapping.
     * Used by problemResponse to auto-derive the title field.
     */
    const titles = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      409: 'Conflict',
      422: 'Unprocessable Content',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      503: 'Service Unavailable',
    };

    /**
     * Creates an RFC 9457 application/problem+json Response.
     *
     * @param {number} status - HTTP status code
     * @param {string} detail - Human-readable explanation of this occurrence
     * @param {Record<string, string>} [headers] - Additional response headers (e.g. Allow, Retry-After)
     * @returns {Response}
     */
    export function problemResponse(status, detail, headers = {}) {
      const body = {
        type: 'about:blank',
        status,
        title: titles[status] || 'Error',
        detail,
      };

      return new Response(JSON.stringify(body), {
        status,
        headers: {
          'Content-Type': 'application/problem+json',
          ...headers,
        },
      });
    }

    /**
     * Creates a JSON success Response.
     *
     * @param {*} body - JSON-serializable value
     * @param {number} [status=200] - HTTP status code
     * @param {Record<string, string>} [headers] - Additional response headers
     * @returns {Response}
     */
    export function jsonResponse(body, status = 200, headers = {}) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }
    ```

    Design decisions baked into this code:
    - `type` is always `about:blank` (no custom URIs -- KISS, all WRL errors map 1:1 to HTTP status codes)
    - `title` is auto-derived from status code (prevents inconsistency across 8 implementation steps)
    - `detail` is the only caller-provided text (occurrence-specific explanation)
    - `headers` parameter handles 405 `Allow` and 503 `Retry-After` without dedicated parameters
    - Both utilities return complete `Response` objects (Content-Type is automatic, cannot be forgotten)

    Detail message convention (document as a code comment at the top of the file):
    - Name the specific resource: "Capture cap_abc123 not found", not "Resource not found"
    - State what is wrong and what to do: "URL scheme 'ftp' is not allowed; use http or https"
    - Human-readable, not machine-parseable (clients should switch on `status`)
    - Never leak internals (no stack traces, no storage keys)

    ### 2. `src/index.js` -- Worker entry point with route dispatch

    ```js
    import { problemResponse, jsonResponse } from './responses.js';

    // Routes: [method, pattern, handler]
    // Order matters: most specific pattern first.
    // Add new routes as one-line tuples.
    const routes = [
      ['GET', /^\/health$/, handleHealth],
    ];

    export default {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        // Normalize trailing slashes: /health/ matches /health
        const pathname = url.pathname.replace(/\/$/, '') || '/';

        for (const [method, pattern, handler] of routes) {
          if (request.method !== method) continue;
          const match = pathname.match(pattern);
          if (match) return handler(request, env, ctx, match);
        }

        return problemResponse(404, `No route matches ${request.method} ${url.pathname}`);
      },
    };

    function handleHealth() {
      return jsonResponse({ status: 'ok' });
    }
    ```

    Design decisions:
    - Array-of-tuples route dispatch: one line per route, regex patterns, first match wins
    - Regex capture groups for path parameters: `match[1]` is the capture ID
    - Trailing slash normalization before matching (prevents /health/ returning 404)
    - Handler signature: `(request, env, ctx, match)` -- consistent across all endpoints
    - Fallback returns RFC 9457 404 via `problemResponse`
    - Step 1 only registers `GET /health` -- subsequent steps add one tuple each

    Code comments to include:
    - At the routes array: explain ordering rule (most specific first) and how to add routes
    - At the fetch handler: note that all bindings are available via `env` (BUCKET, KV, BROWSER)

    ## What NOT to do
    - Do NOT add routes beyond GET /health (Steps 2-8 will add them)
    - Do NOT add CORS headers, security headers, or Cache-Control (Step 8 concern)
    - Do NOT add 405 Method Not Allowed handling (YAGNI for Step 1 -- 404 for unmatched routes is sufficient)
    - Do NOT import or use any npm packages
    - Do NOT create additional files or subdirectories in src/
    - Do NOT add error type constants or enums (the status code IS the type)

    ## Verification
    - `npm run dev` starts; `curl http://localhost:8787/health` returns `{"status":"ok"}` with HTTP 200
    - `curl http://localhost:8787/nonexistent` returns RFC 9457 404
    - `curl http://localhost:8787/health/` (trailing slash) returns 200, not 404

- **Deliverables**: `src/responses.js`, `src/index.js`
- **Success criteria**: Health endpoint returns correct JSON with correct content-type; unknown routes return RFC 9457 problem+json 404; trailing slash normalization works

---

### Task 3: Test suite

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    You are writing the initial test suite for WRL (Web Resource Ledger), a
    Cloudflare Worker project. The project scaffold and source code already
    exist:

    - `wrangler.toml` -- Worker config with `main = "src/index.js"`, R2/KV/Browser bindings
    - `vitest.config.js` -- `defineWorkersConfig` pointing to wrangler.toml
    - `src/index.js` -- Worker entry point with GET /health route and fallback 404
    - `src/responses.js` -- `problemResponse(status, detail, headers?)` and `jsonResponse(body, status?, headers?)`
    - Package versions: `vitest@4.1.0`, `@cloudflare/vitest-pool-workers@0.13.0`

    ## What to create

    ### 1. `test/health.test.js` -- Integration tests (SELF.fetch pattern)

    These tests exercise the full Worker request/response cycle through Miniflare.

    ```js
    import { SELF } from 'cloudflare:test';
    import { describe, it, expect } from 'vitest';
    ```

    Tests to write:

    | Test name | Method | Path | Expected status | Assertions |
    |-----------|--------|------|----------------|------------|
    | `GET /health returns 200 with status ok` | GET | `/health` | 200 | Body `{status:"ok"}`, Content-Type `application/json` |
    | `GET /health/ with trailing slash returns 200` | GET | `/health/` | 200 | Same as above (trailing slash normalization) |
    | `POST /health returns 404` | POST | `/health` | 404 | Body has RFC 9457 shape (type, status, title, detail), Content-Type `application/problem+json` |
    | `GET /nonexistent returns 404` | GET | `/nonexistent` | 404 | Body has RFC 9457 shape, Content-Type `application/problem+json` |

    SELF.fetch details:
    - Use `https://example.com` as the dummy host: `SELF.fetch('https://example.com/health')`
    - For POST: `SELF.fetch('https://example.com/health', { method: 'POST' })`
    - SELF binds to the Worker's default export from `src/index.js` (via `main` in wrangler.toml)

    ### 2. `test/responses.test.js` -- Unit tests (direct import pattern)

    These tests import the response utilities directly and test them in isolation.

    ```js
    import { problemResponse, jsonResponse } from '../src/responses.js';
    import { describe, it, expect } from 'vitest';
    ```

    Tests to write:

    | Test name | What it tests |
    |-----------|--------------|
    | `problemResponse returns correct RFC 9457 shape with all fields` | Call with (404, 'Test detail'), assert body has type=about:blank, status=404, title=Not Found, detail=Test detail; Content-Type is application/problem+json |
    | `problemResponse response status matches body status` | Call with (422, 'detail'), assert response.status === 422 AND body.status === 422 |
    | `problemResponse uses fallback title for unknown status codes` | Call with (418, 'detail'), assert body.title === 'Error' |
    | `problemResponse includes additional headers` | Call with (405, 'detail', { 'Allow': 'GET' }), assert response.headers.get('Allow') === 'GET' AND Content-Type is still application/problem+json |
    | `jsonResponse returns correct shape` | Call with ({ status: 'ok' }), assert body equals { status: 'ok' }, status 200, Content-Type application/json |
    | `jsonResponse accepts custom status and headers` | Call with ({ id: '123' }, 201, { 'X-Custom': 'val' }), assert status 201, Content-Type application/json, X-Custom header present |

    ### Test conventions
    - Use `describe` blocks grouping by function/endpoint
    - Each test is independent (no shared state between tests)
    - Parse response body with `await response.json()` (not text)
    - Assert both HTTP status and body fields in integration tests
    - Use `toEqual` for object shape assertions, `toBe` for primitives

    ## What NOT to do
    - Do NOT use `test.globals: true` -- always import `describe`, `it`, `expect` from vitest
    - Do NOT add coverage configuration
    - Do NOT create test fixtures, factories, or shared test utilities
    - Do NOT add tests for endpoints that do not exist yet (Steps 2-8)
    - Do NOT mock anything -- these tests run in Miniflare which provides real bindings
    - Do NOT use `beforeAll`/`afterAll` for these tests (not needed)
    - Do NOT import `env` from `cloudflare:test` (not needed in Step 1)

    ## Verification
    - `npm test` passes with all tests green
    - Output shows both test files discovered and all tests passing

- **Deliverables**: `test/health.test.js`, `test/responses.test.js`
- **Success criteria**: `npm test` (vitest run) passes with all 10 tests green; both SELF.fetch integration pattern and direct-import unit pattern verified working

---

### Task 4: End-to-end verification

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3
- **Approval gate**: no
- **Prompt**: |
    You are performing end-to-end verification of the WRL project scaffold.
    All source code and tests have been created by prior tasks. Your job is
    to verify everything works together and fix any issues.

    ## Verification steps

    ### 1. Run the test suite
    ```bash
    npm test
    ```
    All tests must pass. If any fail, diagnose and fix the issue.

    ### 2. Start the dev server and test the health endpoint
    ```bash
    npm run dev &
    sleep 3
    curl -s -w "\n%{http_code}" http://localhost:8787/health
    curl -s -w "\n%{http_code}" http://localhost:8787/nonexistent
    curl -s -w "\n%{http_code}" http://localhost:8787/health/
    kill %1
    ```

    Expected results:
    - `/health` returns `{"status":"ok"}` with HTTP 200
    - `/nonexistent` returns RFC 9457 JSON with HTTP 404
    - `/health/` (trailing slash) returns `{"status":"ok"}` with HTTP 200

    ### 3. Verify .gitignore
    Confirm that `node_modules/`, `.wrangler/`, and `.dev.vars` are all in `.gitignore`.

    ### 4. Verify file structure
    Expected files:
    ```
    wrangler.toml
    package.json
    package-lock.json
    vitest.config.js
    .gitignore
    src/index.js
    src/responses.js
    test/health.test.js
    test/responses.test.js
    ```

    No other files should exist in `src/` or `test/`.

    ## If tests fail

    Common issues with `@cloudflare/vitest-pool-workers@0.13.0` + `vitest@4.1.0`:

    1. **Peer dependency conflict**: If npm install failed, fall back to
       `vitest@3.2.4` + `@cloudflare/vitest-pool-workers@0.12.21` in package.json
       and re-run `npm install`.

    2. **ESM import error**: Verify `"type": "module"` is in package.json.

    3. **SELF not found**: Verify `main = "src/index.js"` is in wrangler.toml.

    4. **Binding errors**: KV/R2/Browser bindings for non-existent resources
       should work in Miniflare. If they cause errors, this is a wrangler version
       issue -- try removing browser binding temporarily.

    Fix any issues in-place. Document what was fixed and why.

    ## What NOT to do
    - Do NOT add new features or files
    - Do NOT refactor working code
    - Do NOT change the API contract (response shapes, status codes)
    - Only fix things that are actually broken

    ## Deliverable
    A passing test suite and a working dev server. If you had to change any
    files to fix issues, list exactly what changed and why.

- **Deliverables**: Passing test suite, verified dev server, list of any fixes applied
- **Success criteria**: `npm test` all green; `curl localhost:8787/health` returns 200 with correct body; all acceptance criteria from the GitHub issue met

---

### Cross-Cutting Coverage

| Dimension | Coverage | Rationale |
|-----------|----------|-----------|
| **Testing** | Task 3 (test-minion writes tests), Task 4 (verification) | 10 tests covering both patterns. Phase 6 handles execution. |
| **Security** | Phase 3.5 review (security-minion) | Attack surface is `GET /health` only. Security review confirms no premature security header additions and validates the error utility does not leak internals. |
| **Usability -- Strategy** | Phase 3.5 review (ux-strategy-minion) | Validates that the error response shape and health endpoint serve developer ergonomics. |
| **Usability -- Design** | Not included | No user-facing UI in Step 1. The verification page is Step 7. |
| **Documentation** | Phase 8 (post-execution) | Code comments in source files serve as documentation for Step 1. Evolution log entries are a separate concern handled by the calling session. |
| **Observability** | Not included | No production runtime in Step 1. The Worker is a scaffold with one endpoint. Observability is a Step 8 concern. |

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. Step 1 produces no UI (ux-design-minion, accessibility-minion not needed), no web-facing pages (sitespeed-minion not needed), single worker with no coordinated services (observability-minion not needed), and no user-facing documentation changes (user-docs-minion not needed).
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

---

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| `@cloudflare/vitest-pool-workers@0.13.0` published today -- may have undiscovered bugs | Medium | Exact version pinning + documented fallback to `0.12.21`/`vitest@3.2.4`. Fallback is a package.json change + npm install. Task 4 handles the rollback if needed. |
| Browser Rendering binding not emulated in Miniflare test pool | Low (Step 1) | Binding is declared but unused in Step 1. Tests do not exercise it. Step 3 will need a mock or separate integration test strategy. |
| Auto-provisioning (omitting resource IDs) is beta | Low | Fallback: `wrangler r2 bucket create` + `wrangler kv namespace create` manually, add IDs to wrangler.toml. 2-minute operation. |
| Plain JS (not TypeScript) is untested in Cloudflare's vitest examples | Low | The pool is JS-agnostic. `"type": "module"` in package.json handles ESM resolution. No type-checking needed. |
| RFC 9457 `type` field drift if handlers bypass `problemResponse` | Low | Established as convention in Step 1. Code review checklist item for Steps 2-8: no `new Response(...)` with status >= 400 outside of `problemResponse`. |

---

### Execution Order

```
Task 1: Project scaffold (iac-minion)
  |
  v
Task 2: Worker entry point + response utilities (api-design-minion)
  |
  v
Task 3: Test suite (test-minion)
  |
  v
Task 4: End-to-end verification (iac-minion)
```

All tasks are sequential. No parallelism possible -- each task depends on the prior task's output files.

No mid-execution approval gates. Rationale: all 4 tasks produce files that are easy to reverse (additive code, no schema migrations, no API contracts consumed by external systems). The blast radius is 0 external dependents. The entire scaffold can be regenerated from scratch in minutes. The Phase 3.5 architecture review provides sufficient oversight before execution begins.

---

### External Skills

No external skills detected in project.

---

### Verification Steps

After all tasks complete:

1. `npm test` passes with all tests green (10 tests across 2 files)
2. `npm run dev` starts without errors
3. `curl http://localhost:8787/health` returns HTTP 200 with `{"status":"ok"}`
4. `curl http://localhost:8787/nonexistent` returns HTTP 404 with RFC 9457 body
5. `curl http://localhost:8787/health/` returns HTTP 200 (trailing slash normalized)
6. `.gitignore` contains `node_modules/`, `.wrangler/`, `.dev.vars`
7. No files exist outside the expected structure
8. `package-lock.json` is committed
