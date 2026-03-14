You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build WACZ bundling and Ed25519 signing for a Cloudflare Worker that captures web pages. After existing R2 artifacts are stored, construct WARC records, build a CDXJ index, compute SHA-256 hashes, assemble a signed manifest, write a `.wacz` ZIP to R2, and update KV metadata.

Acceptance criteria from the issue:
- `vitest run` signing round-trip test passes
- `vitest run` canonical JSON stability test passes (deterministic serialization)
- R2 contains a `.wacz` object after a capture completes in `wrangler dev`
- Key generation procedure documented in README

## Your Planning Question

Design the test approach for Step 4. The issue explicitly requires two tests: canonical JSON stability (deterministic serialization) and Ed25519 signing round-trip (sign then verify). Beyond these:
1. What additional tests are needed for the WACZ bundling pipeline -- should we test WARC record construction, CDXJ generation, manifest assembly, ZIP structure, and R2 write independently, or is integration-level testing sufficient?
2. The existing test infrastructure uses `@cloudflare/vitest-pool-workers` with Miniflare providing R2 and KV -- how should we structure tests that need crypto operations (Ed25519) in this environment? Does Miniflare support `crypto.subtle.sign`/`verify` with Ed25519?
3. How should we test the canonical JSON determinism -- what edge cases beyond basic key sorting should be covered (nested objects, arrays, numbers, Unicode, null values)?
4. Should the signing round-trip test use a test key or derive from a fixture?
5. How should we test the integration with the existing `performCapture` pipeline -- modify the existing capture tests to verify WACZ output, or create a separate test file?

## Context

Existing test infrastructure:
- vitest.config.js uses @cloudflare/vitest-pool-workers with Miniflare
- 7 test files, 191 passing tests
- test/capture.test.js uses a stubRenderer pattern (injectable renderer function)
- Tests use fetchMock for network isolation
- R2 and KV are available in test env
- Miniflare config: isolatedStorage: false, CAPTURE_API_KEY binding for auth

Existing test patterns: beforeEach cleanup of KV/R2 artifacts, fetchMock lifecycle, stub renderers that return fixed PNG bytes + HTML.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-test-minion.md`
