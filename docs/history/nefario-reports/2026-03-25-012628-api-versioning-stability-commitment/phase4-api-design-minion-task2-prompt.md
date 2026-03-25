Task 2: Worker implementation -- WRL-API-Version header + empty deprecation config

You are implementing the WRL-API-Version response header in the WRL Cloudflare Worker.

## Context

WRL is a Cloudflare Worker (src/index.js). The post-response header block sets global headers on every response (Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS, Link/terms-of-service). This is where you will add the version header.

BUILD_VERSION is a compile-time define injected by the deploy pipeline from package.json version. In the test environment, BUILD_VERSION is NOT defined -- the health endpoint already handles this with typeof BUILD_VERSION !== 'undefined' guard.

## What to do

### Step 1: Add WRL-API-Version header to the post-response block

In src/index.js, in the post-response header block (where security headers like Referrer-Policy, X-Content-Type-Options etc are set), after the existing headers and before return response, add:

if (typeof BUILD_VERSION !== 'undefined') {
  response.headers.set('WRL-API-Version', BUILD_VERSION);
}

The typeof guard is required: in tests and local dev, BUILD_VERSION is not defined. When undefined, the header is simply absent. This is the same pattern used by the health endpoint.

### Step 2: Create src/deprecations.js

Create a declarative deprecation config module. This ships EMPTY at v1.0.0 -- no endpoints are deprecated. The module establishes the schema for future use.

// Declarative deprecation registry.
// When an endpoint is deprecated, add an entry here along with the
// corresponding header injection code in src/index.js.
//
// Key format: 'METHOD /path/template'
// Values:
//   deprecated: Unix timestamp (integer) when the endpoint was marked deprecated
//               (emitted as Structured Field Date @timestamp per RFC 9745)
//   sunset:     HTTP-date string (RFC 7231) when the endpoint stops responding (per RFC 8594)
//   link:       URL to migration documentation (must be a valid absolute URL --
//               validate before interpolating into Link header to prevent header injection)
//
// Example:
// 'GET /v1/captures/:id/status': {
//   deprecated: 1735689599,
//   sunset: 'Tue, 01 Jul 2025 00:00:00 GMT',
//   link: 'https://docs.webresourceledger.com/migration/status-endpoint',
// },

export const DEPRECATIONS = {};

NOTE: The DEPRECATION header injection mechanism (reading this config and setting Deprecation/Sunset/Link headers) will be built when the first endpoint is actually deprecated. At v1.0.0 this is intentionally empty infrastructure -- the schema documentation and empty config establish the pattern without shipping dead code.

## Files to create
- src/deprecations.js -- empty deprecation registry with documented schema

## Files to modify
- src/index.js -- WRL-API-Version header in post-response block

## What NOT to do
- Do NOT hardcode the version string in the header (use BUILD_VERSION)
- Do NOT add a fallback value like 'dev' when BUILD_VERSION is undefined -- just skip the header
- Do NOT create src/version.js (tests will import from package.json instead)
- Do NOT add ROUTE_KEYS map or deprecation header injection logic -- defer until first actual deprecation
- Do NOT modify the routes array structure
- Do NOT modify openapi.yaml or package.json (Task 1 handles that)
- Do NOT write tests (Task 4 handles that)

## Acceptance criteria
- src/deprecations.js exists and exports empty DEPRECATIONS object with documented schema
- WRL-API-Version header is set on all responses when BUILD_VERSION is defined
- WRL-API-Version header is absent when BUILD_VERSION is undefined (test environment)
- No deprecation header injection code (deferred to future phase)
- Existing tests pass (npm test)
