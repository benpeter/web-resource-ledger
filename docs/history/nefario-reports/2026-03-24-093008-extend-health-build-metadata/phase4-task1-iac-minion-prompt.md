Extend the /health endpoint in the WRL Worker with build identity metadata.

## What to do

### 1. Modify handleHealth() in src/index.js (line 578)

Add a build object to the response and set Cache-Control: no-store.

Current code:
function handleHealth() {
  return jsonResponse({
    status: 'ok',
    legal: {
      terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
      policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
    },
  });
}

New code:
function handleHealth() {
  const body = {
    status: 'ok',
    legal: {
      terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
      policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
    },
  };

  // Build identity -- injected at deploy time via wrangler --define.
  // typeof guard required: these are compile-time text replacements,
  // accessing undeclared identifiers without typeof throws ReferenceError.
  if (typeof BUILD_COMMIT !== 'undefined') {
    body.build = {
      commit: BUILD_COMMIT,
      version: BUILD_VERSION,
      env: BUILD_ENV,
      deployedAt: BUILD_DEPLOYED_AT,
    };
  }

  return jsonResponse(body, 200, { 'Cache-Control': 'no-store' });
}

### 2. Update unit tests in test/health.test.js

Add to existing "returns 200 with status ok and legal URLs" test:
- Assert body.build is undefined (no --define in test env)
- Assert Cache-Control header is 'no-store'

Add Cache-Control assertion to trailing-slash test too.

Do NOT inject --define values into vitest config.

### 3. Update OpenAPI spec in openapi.yaml

Add build property to /health 200 response schema (optional, not in required array).
Add Cache-Control header to response headers.
Add second example showing deployed response with build object.

After editing, run npm run lint:api to validate.

## What NOT to do
- Do NOT add [define] stanzas to wrangler.toml
- Do NOT modify src/responses.js
- Do NOT add define config to vitest.config.js
- Do NOT touch workflow files or smoke-test.sh
- Do NOT use fallback values when globals missing

## Verification
- npm test passes
- npm run lint:api passes

When done, report: file paths with change scope and line counts, 1-2 sentence summary.
