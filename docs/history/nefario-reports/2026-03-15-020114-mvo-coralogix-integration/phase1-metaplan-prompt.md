MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
Every capture pipeline failure, successful capture, and security event is logged as structured JSON and shipped to Coralogix in real time, so that no incident goes undiagnosable. This is a product requirement, not optional infrastructure — WRL's tamper-evident archival promise is hollow if the capture pipeline can fail silently with no evidence trail. The Coralogix integration must ship with this work and must not be deferred or descoped during planning or review.

**Success criteria**:
- Every capture pipeline stage failure (browser render, R2 write, KV write, WACZ bundling, signing) emits a structured JSON log with captureId, stage name, error category, and retryable flag
- Every successful capture emits a structured log with captureId, total duration, WACZ success/fail, and bundle size
- Auth failures, SSRF blocks, and rate limit hits each emit a security event log
- All log entries are shipped to Coralogix via their REST ingestion endpoint using a non-blocking fetch() in waitUntil — Coralogix failures are swallowed and never affect the request path
- CORALOGIX_SEND_KEY is configured as a Worker secret (already done)
- CORALOGIX_ENDPOINT is configured as a `[vars]` entry in wrangler.toml (default: `https://ingress.eu2.coralogix.com/logs/v1/singles`)
- The log helper is a single function under 30 lines with no external dependencies
- All existing tests pass
- No new npm dependencies added

**Scope**:
- In: Structured logging at capture pipeline stages, security event logging, Coralogix REST ingestion, CORALOGIX_ENDPOINT wrangler var, updating backlog items for structured logging and security monitoring
- Out: OpenTelemetry, distributed tracing, metrics pipelines, dashboards, alerting rules, SLOs, sampling logic, request-level middleware, logger factory abstractions, logging libraries

**Constraints**:
- Coralogix as the observability platform (REST ingestion endpoint, no SDK)
- Ingestion endpoint: `https://ingress.eu2.coralogix.com/logs/v1/singles` (EU2/Stockholm region) — configured via CORALOGIX_ENDPOINT var in wrangler.toml
- No new npm dependencies — console.error + JSON.stringify + one small log() helper
- Non-negotiable: Coralogix integration ships with this work, not deferred. This constraint survives simplification review.

**Pre-work completed**:
- Coralogix account created (EU2/Stockholm region)
- CORALOGIX_SEND_KEY secret set in Cloudflare Worker
</github-issue>

Additional context: all approvals granted, dont pause for compaction. create the PR when all is complete but do not merge it yet.

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
No project-local skills found (.claude/skills/ and .skills/ do not exist in the working directory).

## Codebase Context

The project is a Cloudflare Worker that captures web pages (screenshot, HTML, headers) and bundles them into signed WACZ archives for tamper-evident archival.

Key files:
- `src/index.js` -- main Worker entry point, route handler, request dispatch
- `src/capture.js` -- browser rendering capture pipeline (Playwright), runs in ctx.waitUntil()
- `src/auth.js` -- API key authentication
- `src/url-validation.js` -- SSRF prevention
- `src/kv.js` -- KV operations (createCapture, completeCapture, failCapture)
- `src/wacz.js` -- WACZ bundling
- `src/signing.js` -- Ed25519 signing
- `src/responses.js` -- problemResponse/jsonResponse helpers
- `wrangler.toml` -- Worker config (R2, KV, rate limiters, browser binding)
- 17 test files in test/

The capture pipeline in capture.js has clear stages:
1. Browser render (screenshot + HTML)
2. Header fetch
3. R2 artifact storage
4. WACZ bundling + signing
5. KV status update (completeCapture/failCapture)

Auth failures happen in index.js (handleCreateCapture), SSRF blocks in url-validation.js, rate limits in index.js.

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills discovered.
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wUNrkM/mvo-coralogix-integration/phase1-metaplan.md`
