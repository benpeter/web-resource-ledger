MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-data-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-observability-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-edge-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-software-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-gru.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-lucy.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-devx-minion.md

## Key consensus across specialists:

1. security-minion: KV lookup first then legacy fallback with hardcoded scopes; separate verifyAdminKey function; 503 misconfiguration guard
2. api-design-minion: POST 201 with raw key + keyHash; same pagination as captures; idempotent soft-delete; separate adminAuth scheme
3. data-minion: No secondary index; no TTL; existing captures already tagged; createdBy: "admin"
4. observability-minion: Extend auth result object with observability fields; authMethod field; 6 distinct reason values; 8-char hash prefix safe for found-but-rejected
5. edge-minion: Namespace IDs 1004/2004; no CORS; Cache-Control: private, no-store; separate admin rate limit group
6. test-minion: Never mock KV, use miniflare; new admin-keys.test.js; round-trip lifecycle test; shared hash helper
7. ux-strategy-minion: Implicit tenant creation; idempotent DELETE; 3-phase runbook; natural-language 403 messages; warning field in POST
8. software-docs-minion: Version 0.5.0; separate adminAuth scheme; OPERATIONS.md runbook; TERMS.md unchanged
9. gru: Custom KV auth confirmed correct; no Cloudflare-native replacement; wrl_live_ prefix confirmed; no KV caching needed
10. lucy: ADVISE -- gating condition not explicitly cleared; evolution log is 0037; 4 CLAUDE.md conventions load-bearing; R13 boundary intact
11. devx-minion: Use Authorization: Bearer for both; full keyHash in responses; idempotent DELETE; effective scopes in POST; curl examples

## Conflicts to resolve:
- Revoked key visibility in GET: api-design-minion says exclude by default (?include=revoked); devx-minion says include by default
- Name uniqueness: ux-strategy-minion flagged for discussion (friction during key rotation)
- Lucy's gating condition: must be resolved before execution

## External Skills Context
No external skills detected.

## CLAUDE.md Conventions (from lucy, load-bearing):
1. Fail-loudly error handling: every catch must log or handle specific error types
2. 300ms latency budget: auth + KV lookup must fit within budget
3. Real-boundary testing: use real miniflare KV, not mocks
4. Evolution log structure: prompt.md, decisions.md, outcome.md in docs/evolution/0037-per-tenant-api-keys/

## Instructions
1. Review all specialist contributions
2. Resolve the conflicts listed above
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format with:
   - Complete, self-contained prompts for each task
   - Agent assignments (use sonnet for execution agents)
   - Dependencies between tasks
   - Approval gates (budget 2-3 gates max)
   - Model assignments (sonnet for execution)
   - Mode: bypassPermissions for code-writing tasks, default for research-only
5. The plan should cover: auth module, admin API endpoints, wrangler.toml, tests, OpenAPI, OPERATIONS.md runbook, evolution log, backlog updates
6. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase3-synthesis.md`
