Task 4: Tests -- version header and deprecation config

You are writing tests for the WRL-API-Version header and the deprecation config.

## Context

WRL uses vitest with @cloudflare/vitest-pool-workers for testing. Tests run against the Worker via `SELF.fetch()`. The test config is in `vitest.config.js`.

**BUILD_VERSION is NOT available in the test environment.** It is a compile-time define injected by the deploy pipeline. The Worker code uses `typeof BUILD_VERSION !== 'undefined'` guard — when undefined, the WRL-API-Version header is absent. The health endpoint has the same pattern (see `test/health.test.js` line 15: `expect(body.build).toBeUndefined()`).

**node:fs is NOT available** in the Cloudflare Workers vitest pool. Use `import pkg from '../package.json' with { type: 'json' }` to get the version (CI enforces openapi.yaml == package.json, so testing against package.json is equivalent).

The existing `test/security-headers.test.js` has an `expectSecurityHeaders()` helper that checks 5 security headers plus the Link/terms-of-service header across 5 representative routes.

`src/deprecations.js` exports an empty `DEPRECATIONS` object at v1.0.0. There is NO deprecation injection code yet (YAGNI — deferred until first actual deprecation). There is NO `ROUTE_KEYS` map and NO `src/version.js` file.

## What to do

### Step 1: Rename helper in security-headers.test.js

In `test/security-headers.test.js`:
- Rename `expectSecurityHeaders` to `expectGlobalHeaders` (function definition and all call sites)
- The helper's assertions stay exactly the same (Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS, Link/terms-of-service)
- Do NOT add WRL-API-Version to this helper — the header is absent in the test environment

### Step 2: Add version consistency test

In `test/security-headers.test.js`, add a new describe block:

```javascript
describe('WRL-API-Version -- version consistency', () => {
  it('package.json version matches semver format', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg.default.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('WRL-API-Version header absent in test env (BUILD_VERSION undefined)', async () => {
    const res = await SELF.fetch('https://worker.test/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('WRL-API-Version')).toBeNull();
  });
});
```

The first test ensures package.json version is always valid semver. The second test documents the expected test-environment behavior (header absent when BUILD_VERSION undefined).

### Step 3: Add deprecation absence tests

In `test/security-headers.test.js`, add another describe block:

```javascript
describe('Deprecation headers -- absent on non-deprecated routes', () => {
  it('GET /health has no Deprecation or Sunset headers', async () => {
    const res = await SELF.fetch('https://worker.test/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Deprecation')).toBeNull();
    expect(res.headers.get('Sunset')).toBeNull();
  });

  it('POST /v1/captures (401) has no Deprecation or Sunset headers', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('Deprecation')).toBeNull();
    expect(res.headers.get('Sunset')).toBeNull();
  });
});
```

### Step 4: Add deprecation config unit test

In `test/security-headers.test.js`, add a describe block that imports the DEPRECATIONS config:

```javascript
describe('Deprecation config -- v1.0.0 baseline', () => {
  it('DEPRECATIONS registry is empty at v1.0.0', async () => {
    const { DEPRECATIONS } = await import('../src/deprecations.js');
    expect(Object.keys(DEPRECATIONS)).toHaveLength(0);
  });
});
```

### Step 5: Run tests

Run `npm test` to confirm all existing tests still pass and new tests pass.

## Files to modify
- `test/security-headers.test.js` -- rename helper, add version and deprecation tests

## Files NOT to create
- Do NOT create `test/deprecation.test.js` -- keep all tests in the existing security-headers file since they're related to global response headers
- Do NOT create any source files

## What NOT to do
- Do NOT hardcode `'1.0.0'` in test assertions -- use regex patterns
- Do NOT add WRL-API-Version to the expectGlobalHeaders helper (absent in test env)
- Do NOT try to import from `src/version.js` (it does not exist)
- Do NOT try to use `node:fs` (unavailable in Workers vitest pool)
- Do NOT test ROUTE_KEYS (does not exist — deferred)
- Do NOT modify vitest.config.js
- Do NOT modify source code (src/) -- only test files

## Acceptance criteria
- `expectSecurityHeaders` renamed to `expectGlobalHeaders` throughout
- Version consistency test verifies package.json matches semver
- WRL-API-Version header confirmed absent in test env
- Deprecation/Sunset headers confirmed absent on non-deprecated routes
- DEPRECATIONS config confirmed empty
- All existing tests continue to pass
- `npm test` passes cleanly
