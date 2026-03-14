You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Build a public verification endpoint (`GET /v1/verify/{id}`) for a web resource ledger. The endpoint proves a stored capture is authentic and unmodified by recomputing SHA-256 hashes, recomputing bundleHash from canonical JSON, and verifying the Ed25519 signature. No authentication required. Response cached with `Cache-Control: public, immutable, max-age=31536000`. Rate limited at ~60 req/min per IP. Must have passing end-to-end integration tests including tamper detection.

## Your Planning Question
Design the test strategy for cryptographic verification:
1. How to structure the tamper test in vitest/miniflare? The issue says "tamper with a stored artifact -> GET /v1/verify/{id} -> assert verified: false". Should we modify R2 objects directly in the test, or modify KV records?
2. Can the full POST -> poll status -> GET verify lifecycle work within vitest/miniflare? The existing integration test (capture-integration.test.js) uses fetchMock and manually advances KV state via completeCapture(). Does the verify endpoint need the actual WACZ to be in R2, or can we seed it manually?
3. What edge cases need testing? Consider: no WACZ (signing key absent), pending/failed captures, R2 artifacts missing but KV present, captures completed before signing was configured.
4. Should verification logic get unit tests (pure function testing) separate from integration tests? The existing pattern has both unit test files and integration test files.
5. How should test data be structured? The existing tests use SEED_ID patterns and beforeEach hooks to set up KV+R2 state.

## Context
### Existing test patterns:
- `test/capture-integration.test.js` -- uses fetchMock, postCapture helper, tests lifecycle
- `test/capture-retrieval.test.js` -- seeds KV+R2 in beforeEach, tests GET endpoints
- `test/signing.test.js` -- unit tests for signing functions
- `test/wacz.test.js` -- unit tests for WACZ assembly
- All use `@cloudflare/vitest-pool-workers` with `cloudflare:test` bindings (env, SELF, fetchMock)

### Key test infrastructure:
```js
import { env, SELF, fetchMock } from 'cloudflare:test';
import { createCapture, completeCapture } from '../src/kv.js';
// Seeds R2 directly: await env.BUCKET.put(key, data);
// Seeds KV: await createCapture() then completeCapture()
```

### WACZ verification requires:
1. Reading WACZ from R2 (ZIP file)
2. Extracting datapackage.json from ZIP
3. Recomputing SHA-256 of each resource listed in datapackage.json
4. Computing bundleHash = sha256(canonicalize(datapackage))
5. Verifying Ed25519 signature from datapackage-digest.json

### The issue's acceptance criteria:
- End-to-end integration test: POST capture -> poll status until complete -> GET /v1/verify/{id} -> assert verified: true
- Test: tamper with a stored artifact -> GET /v1/verify/{id} -> assert verified: false
- "The integration test is the definition of done"

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wBF00I/mvp-step-6-verification-endpoint/phase2-test-minion.md`
