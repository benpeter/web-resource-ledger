MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task

GitHub Issue #1: MVP Step 1 — Project Scaffold and Cloudflare Worker

A Worker that responds to HTTP requests with health check passing in wrangler dev and deployed. This is the foundation — nothing exists yet. Establishes the project scaffold, test infrastructure, and shared error utilities that all subsequent steps build on.

Work Items:
- wrangler.toml with Worker name, R2 bucket binding, KV namespace binding, and Browser Rendering binding
- Vanilla JS Worker entry point with minimal route dispatch (method + path matching)
- GET /health returns { "status": "ok" } with HTTP 200
- RFC 9457 application/problem+json error response pattern established as shared utility
- Vitest + @cloudflare/vitest-pool-workers configured so tests run inside the Miniflare runtime
- Verify wrangler dev starts without errors
- Verify vitest run passes

Acceptance Criteria:
- curl http://localhost:8787/health returns HTTP 200 with {"status":"ok"}
- vitest run passes with at least one test for the health endpoint
- wrangler dev starts without errors

Constraints: Plain JavaScript (not TypeScript), Helix Manifesto (YAGNI, KISS, Lean and Mean), Cloudflare-native serverless stack.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase2-api-spec-minion.md

## Key consensus across specialists:

## Summary: iac-minion
Phase: planning
Recommendation: Flat wrangler.toml with auto-provisioned bindings (no environments, no resource IDs), nodejs_compat from day one, "type": "module" in package.json.
Tasks: 1 -- Create wrangler.toml with R2/KV/Browser Rendering bindings, package.json with type:module
Risks: vitest/pool-workers version compatibility window is narrow; Browser Rendering not emulated in vitest Miniflare pool
Conflicts: none
Full output: phase2-iac-minion.md

## Summary: api-design-minion
Phase: planning
Recommendation: Array-of-tuples route dispatch pattern with regex, separate src/errors.js for RFC 9457, companion jsonResponse helper, trailing slash normalization.
Tasks: 2 -- Create Worker entry point with route dispatch; Create response helpers (problemResponse + jsonResponse)
Risks: Route ordering collision between /captures/{id}/status and /captures/{id}; RFC 9457 type drift if handlers bypass utility
Conflicts: none
Full output: phase2-api-design-minion.md

## Summary: test-minion
Phase: planning
Recommendation: @cloudflare/vitest-pool-workers@0.13.0 + vitest@4.1.0 (latest), separate test/ directory, SELF.fetch for integration + direct import for unit tests, 7 initial tests.
Tasks: 2 -- Configure vitest.config.js with defineWorkersConfig; Write 7 tests (3 integration + 4 unit)
Risks: Brand new vitest 4.x + pool-workers 0.13.0 may have undiscovered issues; fallback to 0.12.21 + vitest 3.2.4 documented
Conflicts: Coordination with iac-minion on wrangler.toml main field pointing to src/index.js
Full output: phase2-test-minion.md

## Summary: api-spec-minion
Phase: planning
Recommendation: Use about:blank for all type values (no custom URIs), include exactly 4 fields (type/status/title/detail), utility returns complete Response object, signature: problemResponse(status, detail, headers?).
Tasks: 1 -- Create src/errors.js with problemResponse function and title lookup table
Risks: RFC 9457 does NOT require any fields (all optional) -- WRL contract decision, not RFC mandate
Conflicts: none
Full output: phase2-api-spec-minion.md

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions (read the full files)
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase3-synthesis.md

Important synthesis decisions to make:
- Version pinning: test-minion recommends latest (vitest 4.1.0 + pool-workers 0.13.0) vs. stable (vitest 3.2.4 + pool-workers 0.12.21). Weigh risk vs. benefit for a greenfield project.
- Error utility API: api-spec-minion says problemResponse(status, detail, headers?) while api-design-minion says problemResponse(status, type, title, detail). Resolve the signature.
- File structure: test-minion says separate test/ directory. Reconcile with overall project structure.
- Approval gates: The meta-plan recommended 1 gate (project scaffold structure). This is a small step — consider whether 1 gate is sufficient or if 0 gates (no mid-execution approval) is more appropriate given the scope.
