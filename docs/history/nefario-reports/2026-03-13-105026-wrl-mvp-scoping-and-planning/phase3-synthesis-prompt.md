MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Scope and plan the WRL (Web Resource Ledger) minimum shippable product. The goal is the smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture.

Deliverables:
1. docs/MVP.md -- scope document (what's in, what's out, why)
2. Sequenced implementation plan where each step produces something runnable
3. GitHub issues for each work unit
4. docs/evolution/0001-kickoff/decisions.md and outcome.md

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-gru.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-lucy.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-margo.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-security-minion.md

## Key Consensus Across Specialists

### gru
WACZ bundle format (WARC+ZIP+SHA-256 manifest), RFC 3161 via FreeTSA, Cloudflare Browser Rendering, R2 content-addressed storage. WACZ makes all other decisions reversible.

### lucy
MVP = capture URL + store immutably + public verification. Screenshots/resource manifests/TSA gray zone -- defer. Include minimal static verification page. Evolution log entries should be terse bullet-point decisions.

### margo
All 7 YAGNI items OUT: no multi-tenancy, no auth, no web UI, no scheduler, no change detection, no notifications, no database, no OpenAPI spec. MVP = 3 endpoints. Headless browser = complexity iceberg.

### api-design-minion
4 endpoints: POST /captures (202+ID), GET /captures/{id}/status, GET /captures/{id}, GET /verify/{id}. Async polling. RFC 9457 errors. Verification returns result+metadata.

### iac-minion
Cloudflare-native serverless: single Worker, Browser Rendering, R2, KV. ~$5/month. Manual deploy via wrangler.

### security-minion
SSRF prevention = #1 non-negotiable. API keys for capture, unauthenticated verification. Ed25519 over SHA-256 content hash manifest, extensible signatures array. Rate limiting on all endpoints.

## Key Conflict: Bundle Format
- gru recommends WACZ (standards-based, legal pedigree, built-in integrity)
- margo recommends directory-of-files (simpler, less dependency)
- Resolution needed: weigh WACZ's upgrade path and legal benefits vs. margo's simplicity concern

## Key Tension: Auth for MVP
- margo says no auth needed for MVP
- security-minion says API keys for capture are essential (resource-intensive, needs kill switch)
- Resolution needed: minimal API key or rate-limiting only?

## External Skills Context
No external skills detected.

## Instructions
1. Read ALL specialist contributions from the scratch files
2. Resolve the bundle format conflict (WACZ vs directory-of-files)
3. Resolve the auth tension (API keys vs rate-limiting only)
4. Create the final execution plan with these tasks:
   - Task 1: Write docs/MVP.md (scope document)
   - Task 2-N: Implementation plan steps (each producing something runnable)
   - Final task: Create GitHub issues
   - Include evolution log updates (decisions.md, outcome.md)
5. For EACH task, provide:
   - Task title
   - Agent to execute (use sonnet model for execution tasks)
   - Complete self-contained prompt
   - Dependencies (which tasks must complete first)
   - Deliverables
   - Whether it needs an approval gate
6. Sequence tasks so each step produces something runnable/verifiable
7. Keep the total number of tasks to 5-8 (not more -- this is a planning/scoping task, not full implementation)
8. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase3-synthesis.md

IMPORTANT: This orchestration is about PLANNING and SCOPING the MVP, not implementing it. The tasks should produce:
- A scope document (docs/MVP.md)
- An implementation plan
- GitHub issues for future implementation
- Evolution log documentation
The tasks should NOT write application code.