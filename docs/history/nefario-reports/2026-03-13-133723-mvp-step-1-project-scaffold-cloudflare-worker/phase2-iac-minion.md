# IAC Minion -- Planning Contribution

## Specialist: iac-minion
## Planning Question: Minimal wrangler.toml for Worker with R2, KV, Browser Rendering; binding gotchas for non-existent resources; environments vs flat for MVP

---

## Recommendations

### 1. Flat wrangler.toml -- No Environments for MVP

**Recommendation**: Keep the wrangler.toml flat (top-level only, no `[env.*]` sections).

**Rationale**:
- Single developer, single deployment target, manual `wrangler deploy`. There is no staging environment to model.
- Bindings (KV, R2, Browser Rendering) are **non-inheritable** in wrangler environments -- they must be explicitly redefined in every `[env.*]` section. For MVP with 3 bindings, environments would mean tripling the binding declarations for zero benefit.
- `wrangler dev` uses the top-level configuration by default (no `--env` flag needed). Flat config = zero friction for local development.
- Adding environments later is additive -- you add `[env.production]` sections when you need them. No rework required.
- YAGNI: environments solve a multi-stage deployment problem that does not exist yet.

**When to revisit**: When the project needs a staging deployment or CI/CD pipeline (explicitly deferred to post-MVP per MVP.md).

### 2. Use Auto-Provisioning for R2 and KV Bindings

**Recommendation**: Declare R2 and KV bindings **without** resource IDs (bucket_name, id). Use wrangler 4.45.0+ auto-provisioning.

```toml
[[r2_buckets]]
binding = "BUCKET"

[[kv_namespaces]]
binding = "KV"
```

**Rationale**:
- Auto-provisioning (wrangler >= 4.45.0) handles the "resources don't exist yet" problem cleanly. During `wrangler dev`, Miniflare creates local emulations automatically in `.wrangler/state/`. During `wrangler deploy`, wrangler calls the Cloudflare API to create the actual R2 bucket and KV namespace and links them to the Worker.
- No manual `wrangler r2 bucket create` or `wrangler kv namespace create` steps needed. The developer runs `wrangler dev` and it works immediately.
- Resource IDs are written back to the config after first deploy if needed, but the binding continues to work even without them.
- This means the wrangler.toml checked into git has no account-specific IDs -- it is portable.

**Gotcha addressed**: The planning question asked specifically about bindings for resources that don't exist yet. Auto-provisioning is the direct answer -- it was designed for exactly this scenario. Before wrangler 4.45.0, you had to either pre-create resources manually or use `preview_bucket_name` / `preview_id` for local dev. Auto-provisioning eliminates that ceremony.

### 3. Browser Rendering Binding -- Declare Without remote Flag

**Recommendation**: Declare the browser binding at top level. Do NOT set `remote = true` in the committed config.

```toml
[browser]
binding = "BROWSER"
```

**Rationale**:
- Browser Rendering now supports fully local development (since wrangler 4.31.0, July 2025). `wrangler dev` spins up a local Chromium instance on the developer's machine. No remote flag needed for basic local testing.
- `remote = true` routes local dev traffic to Cloudflare's production Browser Rendering service, which (a) counts against the account's daily browser usage limits (10 min/day free tier) and (b) requires authentication. It should only be enabled temporarily for debugging production-specific behavior.
- For Step 1, the browser binding is declared but not used -- the Worker only serves `/health`. The binding just needs to exist in the config so it is available when Step 3 adds capture logic.
- If a developer needs remote mode, they can set it via CLI: `wrangler dev --remote` or temporarily edit locally. Don't bake it into the committed config.

**Important note on Browser Rendering and tests**: The `@cloudflare/vitest-pool-workers` test runner uses Miniflare/workerd, which does **not** emulate Browser Rendering. Tests that exercise the browser binding will need either (a) mocking the browser binding in tests, or (b) integration tests run via `wrangler dev` rather than the vitest pool. This is a Step 3 concern but worth flagging now so the test architecture accounts for it.

### 4. Recommended Minimal wrangler.toml

```toml
#:schema node_modules/wrangler/config-schema.json
name = "wrl"
main = "src/index.js"
compatibility_date = "2026-03-13"
compatibility_flags = ["nodejs_compat"]

# --- Bindings ---
# Resources are auto-provisioned by wrangler >= 4.45.0.
# wrangler dev: creates local emulations in .wrangler/state/
# wrangler deploy: creates real resources via Cloudflare API

[[r2_buckets]]
binding = "BUCKET"

[[kv_namespaces]]
binding = "KV"

[browser]
binding = "BROWSER"
```

**Design decisions in this config**:

| Choice | Rationale |
|--------|-----------|
| `name = "wrl"` | Short, matches project. Becomes the Worker name on deploy. |
| `main = "src/index.js"` | Convention: source in `src/`. Plain JS per project constraint. |
| `compatibility_date = "2026-03-13"` | Today's date. New project should always pin to current date for latest runtime features. |
| `compatibility_flags = ["nodejs_compat"]` | Required for Browser Rendering (Puppeteer uses Node.js APIs). Also needed for `crypto` module usage in Ed25519 signing (Step 4). Include from day one to avoid a disruptive config change later. |
| `binding = "BUCKET"` | Short binding name. Accessed as `env.BUCKET` in Worker code. |
| `binding = "KV"` | Short binding name. Accessed as `env.KV` in Worker code. |
| `binding = "BROWSER"` | Short binding name. Accessed as `env.BROWSER` in Worker code. |
| No `workers_dev = true` | Workers dev routes are enabled by default. No need to declare explicitly. |
| No `[vars]` section | No environment variables needed in Step 1. API key secret (Step 3) goes via `wrangler secret put`, not wrangler.toml. |
| No `[triggers]` or `[routes]` | Not needed for `wrangler dev`. Production routes can be added at deploy time or via dashboard. |
| `#:schema` line | Enables IDE autocompletion and validation for wrangler.toml in VS Code and other editors. |

### 5. Binding Name Conventions

**Recommendation**: Use short, uppercase single-word binding names: `BUCKET`, `KV`, `BROWSER`.

**Rationale**:
- Accessed as `env.BUCKET`, `env.KV`, `env.BROWSER` in Worker code -- reads cleanly.
- Short names reduce noise across all 8 implementation steps. Every route handler receives `env`.
- Uppercase is the Cloudflare convention for binding names (consistent with their docs and examples).
- Avoid `R2_BUCKET` or `KV_NAMESPACE` -- the binding type is already apparent from usage context. KISS.

### 6. Project File Structure

**Recommendation**: Minimal flat structure under `src/`. No deep nesting.

```
wrl/
  wrangler.toml
  package.json
  vitest.config.js
  .gitignore
  src/
    index.js          # Worker entry point with route dispatch
    errors.js         # RFC 9457 error utility
  test/
    health.test.js    # Health endpoint test
  docs/               # (existing)
```

**Rationale**:
- `src/` and `test/` separation is conventional and keeps the source tree navigable as it grows to 8+ files.
- No `src/routes/`, `src/middleware/`, or `src/utils/` subdirectories. YAGNI. With 4 endpoints, a flat `src/` directory is sufficient.
- When to add subdirectories: if `src/` exceeds ~10 files. That is a Step 4-5 concern at earliest.

### 7. .gitignore Additions

The project needs to ignore Wrangler's local state and Node artifacts:

```gitignore
# Dependencies
node_modules/

# Wrangler local state (Miniflare persistence, auto-provisioned resources)
.wrangler/

# Environment secrets (never commit)
.dev.vars
```

**Important**: `.wrangler/state/` contains local Miniflare data (KV entries, R2 objects, D1 databases). This is ephemeral local dev state and must never be committed. `.dev.vars` is Wrangler's local secrets file -- equivalent to `.env` -- and must also be ignored.

### 8. package.json Dependencies

```json
{
  "name": "wrl",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "wrangler": "^4.45.0",
    "vitest": "~3.1.0",
    "@cloudflare/vitest-pool-workers": "^0.8.0"
  }
}
```

**Key version constraints**:
- `wrangler >= 4.45.0`: Required for auto-provisioning of R2/KV bindings without resource IDs.
- `vitest ~3.1.0`: Use tilde range to stay within a minor version. The `@cloudflare/vitest-pool-workers` package supports Vitest 2.0.x through 3.2.x but can break on major or minor bumps. Tilde range prevents surprise breakage.
- `@cloudflare/vitest-pool-workers`: Check the latest version at install time. The `^0.x` range means every minor is potentially breaking (semver 0.x convention). Pin more tightly if stability issues arise.
- All three are `devDependencies` -- none are runtime dependencies. The Worker runs on Cloudflare's runtime with no node_modules deployed.

### 9. vitest.config.js Skeleton

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

**Notes**:
- `defineWorkersConfig` reads bindings from `wrangler.toml` automatically. No need to redeclare KV/R2/Browser in the vitest config.
- The `main` entry point from `wrangler.toml` (`src/index.js`) is used automatically, enabling `import { SELF } from 'cloudflare:test'` for integration-style tests.
- This file must use ESM syntax (`import`/`export`) because Vitest requires it. The `.js` extension works with `"type": "module"` in package.json or by naming it `vitest.config.mjs`. Recommend adding `"type": "module"` to package.json since Cloudflare Workers use ESM (module format) by default.

**Gotcha**: The vitest config file itself needs to be ESM. Either add `"type": "module"` to package.json (recommended -- aligns with Workers' ESM module format) or name the file `vitest.config.mjs`.

---

## Proposed Tasks

### Task 1: Create wrangler.toml
- Write the minimal config from Recommendation 4 above
- No environments, no route configuration, auto-provisioned bindings
- Estimated effort: trivial (copy from recommendation)

### Task 2: Create package.json
- Include wrangler, vitest, and @cloudflare/vitest-pool-workers as devDependencies
- Add `"type": "module"` for ESM
- Define `dev`, `deploy`, `test`, `test:watch` scripts
- Run `npm install` to generate lockfile

### Task 3: Create .gitignore
- Add `node_modules/`, `.wrangler/`, `.dev.vars`

### Task 4: Create vitest.config.js
- Use `defineWorkersConfig` pointing to wrangler.toml
- Verify it loads bindings correctly by running vitest with a smoke test

### Task 5: Create src/index.js (Worker entry point)
- ESM export default with fetch handler
- Minimal route dispatch (method + pathname matching)
- `/health` returns `{"status":"ok"}` with 200
- Default 404 using RFC 9457 error utility
- All bindings available via `env` parameter (BUCKET, KV, BROWSER)

### Task 6: Create src/errors.js (RFC 9457 utility)
- Function that produces a `Response` object with `application/problem+json` content type
- Defer to api-spec-minion's recommendation for the exact shape

### Task 7: Create test/health.test.js
- Integration test using `SELF.fetch()` from `cloudflare:test`
- Assert 200 status, correct content-type, correct JSON body for `/health`
- Assert 404 with RFC 9457 shape for unknown routes
- Defer to test-minion's recommendation for test patterns

### Task 8: Verify end-to-end
- `npm test` passes (vitest runs in Miniflare pool)
- `npm run dev` starts wrangler dev without errors
- `curl http://localhost:8787/health` returns expected response

---

## Risks

### Risk 1: @cloudflare/vitest-pool-workers Version Incompatibility
- **Severity**: Medium
- **Description**: The vitest pool workers package has a narrow compatibility window (Vitest 2.0.x - 3.2.x) and is pre-1.0 (0.x semver). A version mismatch between vitest and the pool package causes cryptic startup failures.
- **Mitigation**: Pin both packages to known-compatible versions. Use tilde (`~`) ranges rather than caret (`^`) for vitest. Test the exact combination before committing. Document the working version combination in a comment in package.json.

### Risk 2: Browser Rendering Binding in Tests
- **Severity**: Low (for Step 1), Medium (for Step 3+)
- **Description**: The Miniflare runtime in vitest does not emulate Browser Rendering. Tests that need the browser binding will fail or require mocking. This is not a problem for Step 1 (browser is unused) but becomes relevant in Step 3.
- **Mitigation**: Design the test architecture with awareness that browser-dependent tests will need a different strategy (mocking the binding, or separate integration tests run via `wrangler dev`). Flag this in the test infrastructure so Step 3 does not discover it late.

### Risk 3: Auto-Provisioning is Beta
- **Severity**: Low
- **Description**: Wrangler's auto-provisioning (omitting resource IDs) is described as "open beta" in Cloudflare's changelog. Beta features can change behavior between wrangler releases.
- **Mitigation**: The fallback is trivial: run `wrangler r2 bucket create wrl-captures` and `wrangler kv namespace create WRL` manually, then add the resulting IDs to wrangler.toml. This is a 2-minute operation. The auto-provisioning saves ceremony but is not load-bearing.

### Risk 4: ESM / Module Format Confusion
- **Severity**: Low
- **Description**: Cloudflare Workers use ESM (module workers format). If `package.json` lacks `"type": "module"`, Node.js tooling (vitest, wrangler) may treat `.js` files as CommonJS, causing import/export syntax errors.
- **Mitigation**: Set `"type": "module"` in package.json. All source files use ESM `import`/`export`. No CommonJS `require()` anywhere.

### Risk 5: compatibility_flags Drift
- **Severity**: Low
- **Description**: The `nodejs_compat` flag is needed for Browser Rendering (Step 3) and crypto operations (Step 4). If omitted now and added later, it can change runtime behavior for already-written code.
- **Mitigation**: Include `nodejs_compat` from day one in the scaffold. The flag has no negative effect on code that does not use Node.js APIs -- it only enables additional APIs. Including it now prevents a config change surprise in Step 3.

---

## Dependencies on Other Specialists

### api-design-minion
- Route dispatch pattern: iac-minion recommends a flat `src/index.js` with method + pathname matching but defers the exact dispatch structure (switch, if/else chain, lookup table) to api-design-minion.
- Response conventions: content-type headers, JSON serialization patterns.

### api-spec-minion
- RFC 9457 error utility: iac-minion defers the exact problem+json shape (type URIs, required fields, utility function signature) entirely to api-spec-minion.

### test-minion
- Test file organization: iac-minion recommends `test/` directory but defers colocated vs separated decision to test-minion.
- Test patterns: integration (SELF.fetch) vs unit test balance.
- Browser Rendering mock strategy for future steps.

---

## Additional Agents

No additional agents are needed for planning. The four specialists already consulted (iac-minion, api-design-minion, test-minion, api-spec-minion) cover all the "decide once, live with it" foundations for this step. Security-minion review at Phase 3.5 is appropriate since the attack surface in Step 1 is `GET /health` only.

---

## Sources Consulted

- [Wrangler Configuration Reference](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Wrangler Environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Browser Rendering Wrangler Config](https://developers.cloudflare.com/browser-rendering/reference/wrangler/)
- [Browser Rendering Limits](https://developers.cloudflare.com/browser-rendering/limits/)
- [Browser Rendering Local Development](https://developers.cloudflare.com/changelog/post/2025-07-22-br-local-dev/)
- [Automatic Resource Provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/)
- [Vitest Integration Configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)
- [Write Your First Test](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/)
- [Compatibility Dates](https://developers.cloudflare.com/workers/configuration/compatibility-dates/)
- [R2 Workers API Usage](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
