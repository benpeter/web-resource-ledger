# Meta-Plan: MVP Step 1 -- Project Scaffold and Cloudflare Worker

## Task Summary

First implementation step for the WRL project. Greenfield -- no code exists. The deliverable is a functioning Cloudflare Worker with a health endpoint, structured error utility, test infrastructure, and project scaffold. This is the foundation that all 7 subsequent implementation steps build on.

## Planning Consultations

### Consultation 1: Cloudflare Worker Infrastructure

- **Agent**: iac-minion
- **Planning question**: What is the minimal `wrangler.toml` configuration for a Worker with R2, KV, and Browser Rendering bindings that works in both `wrangler dev` (local Miniflare) and production? What are the gotchas with binding declarations for resources that don't exist yet (the KV namespace and R2 bucket haven't been created)? Should we use `wrangler.toml` environments or keep it flat for MVP?
- **Context to provide**: `docs/MVP.md` technology stack section, the constraint that this is single-developer with manual `wrangler deploy`, plain JavaScript (no TS)
- **Why this agent**: iac-minion knows Cloudflare Worker configuration, Miniflare compatibility, and can prevent scaffold mistakes that would cascade to all 7 subsequent steps

### Consultation 2: Worker Entry Point and Route Dispatch

- **Agent**: api-design-minion
- **Planning question**: For a vanilla JS Cloudflare Worker with 4 endpoints (health, captures, verify, status) growing to ~8 routes, what is the simplest route dispatch pattern that stays readable without a router library? Should the RFC 9457 error utility be a separate module or inline? What content-type and status code conventions should be established now to avoid inconsistency across later steps?
- **Context to provide**: Full API surface from `docs/MVP.md` (the 4 endpoints table), the RFC 9457 error shape requirement, the Helix Manifesto KISS constraint, plain JS requirement
- **Why this agent**: api-design-minion can define the minimal routing pattern and error conventions that every subsequent step will follow. Getting this wrong means rework across all future endpoints.

### Consultation 3: Test Infrastructure

- **Agent**: test-minion
- **Planning question**: What is the minimal Vitest + `@cloudflare/vitest-pool-workers` setup for a plain JS Worker? What does the `vitest.config.js` need to look like? Should tests be colocated with source or in a separate `test/` directory? What is the test pattern for hitting the Worker's fetch handler in-process (via Miniflare pool) vs. making real HTTP requests? What are known compatibility issues between Vitest versions and the Cloudflare pool?
- **Context to provide**: Plain JS (not TS), Miniflare runtime requirement, health endpoint as first test target, the fact that later steps will add ~20+ tests
- **Why this agent**: test-minion knows the Vitest + Miniflare integration surface. Misconfigured test infrastructure is expensive to fix after 7 steps have built on it.

### Consultation 4: RFC 9457 Error Utility Design

- **Agent**: api-spec-minion
- **Planning question**: What is the minimal RFC 9457 `application/problem+json` error response shape for this project? Should we use URI `type` values or short strings? Should the utility accept a status code and return a full Response object, or just produce the JSON body? What `type` URI scheme makes sense for a small, single-worker API?
- **Context to provide**: The 4 MVP endpoints and their error cases (404, 401, 422, 503), the Helix Manifesto KISS constraint, plain JS
- **Why this agent**: api-spec-minion knows RFC 9457 specifics and can define a minimal error shape that is spec-compliant without over-engineering

## Cross-Cutting Checklist

- **Testing**: INCLUDED -- test-minion is Consultation 3 (primary planning contributor). Test infrastructure is a core deliverable of this step.
- **Security**: NOT INCLUDED for planning. This step produces a health endpoint and error utility only. No auth, no user input processing, no attack surface beyond "respond to GET /health with JSON." Security becomes critical in Step 2 (SSRF prevention) and Step 3 (API key auth). Including security-minion in planning here would be premature.
- **Usability -- Strategy**: NOT INCLUDED for planning. This step is pure infrastructure scaffold with no user-facing surface. The first user-facing surface is Step 7 (verification page). ux-strategy-minion will be included in execution-phase architecture review (Phase 3.5 mandatory reviewer) to confirm there are no journey-level concerns, but there is nothing for them to plan here.
- **Usability -- Design**: NOT INCLUDED. No UI in this step.
- **Documentation**: NOT INCLUDED for planning. This step does not change the API surface or architecture -- it implements the scaffold that was already designed in MVP.md. software-docs-minion will review in Phase 3.5. Evolution log documentation (docs/evolution/0002-*) is handled by the orchestration process, not by a specialist.
- **Observability**: NOT INCLUDED. No runtime components to observe yet. The health endpoint is the observability hook itself. Logging/metrics/tracing are not in the MVP scope at all (Helix Manifesto: YAGNI).

## Anticipated Approval Gates

1. **Project scaffold structure** (MUST gate): The file layout, `wrangler.toml` configuration, route dispatch pattern, and error utility design. This is hard to reverse (every subsequent step builds on it) and has maximum blast radius (7 downstream steps depend on it). All four consultations feed into this single decision point. Consolidating into one gate rather than four separate ones keeps gate budget reasonable.

   Expected confidence: HIGH -- Cloudflare Worker scaffolds are well-understood patterns, and the constraints (plain JS, KISS, specific bindings) narrow the design space significantly.

## Rationale

Four specialists are consulted because this step establishes four foundations that all subsequent steps inherit:

1. **Infrastructure scaffold** (iac-minion): `wrangler.toml` and project structure
2. **API conventions** (api-design-minion): routing pattern and response format
3. **Test infrastructure** (test-minion): Vitest + Miniflare configuration
4. **Error standard** (api-spec-minion): RFC 9457 utility shape

Each of these is a "decide once, live with it forever" choice for the project. Getting specialist input during planning prevents rework.

No other specialists are needed at the planning stage. This is a backend infrastructure task with no UI, no auth, no data modeling, no AI integration, and no observability requirements. The mandatory Phase 3.5 reviewers (security-minion, test-minion, ux-strategy-minion, lucy, margo) will still review the execution plan before code is written.

## Scope

**In scope**:
- `wrangler.toml` with Worker name and all bindings (R2, KV, Browser Rendering)
- `package.json` with dependencies (wrangler, vitest, @cloudflare/vitest-pool-workers)
- Worker entry point (`src/index.js`) with route dispatch
- `GET /health` endpoint returning `{"status":"ok"}` with HTTP 200
- RFC 9457 error response utility (`src/errors.js`)
- Vitest configuration (`vitest.config.js`)
- At least one test for the health endpoint
- Evolution log entry (`docs/evolution/0002-project-scaffold/`)

**Out of scope**:
- Any endpoint beyond `/health` (Steps 2-8)
- Creating actual R2 buckets or KV namespaces (bindings are declared but resources are created at deploy time)
- TypeScript configuration
- CI/CD pipeline
- Any framework or router library
- Deployment to production (verification is `wrangler dev` only)

## External Skill Integration

No external skills detected in project. The `.claude/skills/` and `.skills/` directories do not exist in the working directory. User-global skills (`~/.claude/skills/`) are all non-despicable-agents personal utilities (obsidian-tasks, transcribe, juli, etc.) with no relevance to Cloudflare Worker scaffolding.
