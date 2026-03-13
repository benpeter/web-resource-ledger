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
    "wrangler": "4.73.0"
  }
}
```

Key points:
- `"type": "module"` is mandatory (ESM required by Workers AND vitest config)
- Exact version pins for ALL three dependencies (no ranges) -- security advisory
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
        miniflare: {
          browserRendering: true,
        },
      },
    },
  },
});
```

The `browserRendering: true` in miniflare options is required because the
`[browser]` binding in wrangler.toml needs explicit Miniflare configuration
or all tests will fail at Worker startup with a cryptic error. This enables
a no-op stub for the Browser Rendering binding in the test environment.

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
  "wrangler": "4.73.0"
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
- `.gitignore` includes `node_modules/`, `.wrangler/`, `.dev.vars`

When you finish your task, mark it completed with TaskUpdate and
send a message to the team lead with:
- File paths with change scope and line counts (e.g., "src/auth.ts (new OAuth flow, +142 lines)")
- 1-2 sentence summary of what was produced
