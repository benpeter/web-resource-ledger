MODE: SYNTHESIS
ADVISORY: true

You are synthesizing specialist planning contributions into a
team recommendation. This is an advisory-only orchestration --
no code will be written, no branches created, no PRs opened.

Do NOT produce task prompts, agent assignments, execution order,
approval gates, or delegation plan structure. Produce an advisory
report using the advisory output format defined in your AGENT.md.

## Original Task
<github-issue>
**Outcome**: A second operator can use WRL with their own API key. Captures are isolated by tenant. Key compromise affects only one tenant. The single static key becomes the first tenant's key — no breaking change to existing clients.

**Success criteria**:
- KV-based key lookup (`kv.get("apikey:{sha256}")` → `{ tenantId, scopes }`)
- Per-tenant capture isolation (tenant can only list/retrieve their own captures)
- Read/write key scoping (capture vs read-only keys)
- Key provisioning tooling (CLI or admin endpoint)
- Migration path for existing captures (tagged to "default" tenant via R8)
- v1 API contract unbroken — existing single key works as first tenant key
- Per-IP rate limiting retained as secondary control alongside per-tenant

**Scope**:
- In: New auth module (KV key lookup), tenant tagging in KV records, tenant-scoped list endpoint, key scoping, provisioning tooling, capture migration
- Out: OAuth, social signup, RBAC beyond read/write, admin web UI, billing

**Constraints**:
- Gated on multi-user decision — do not build until a second user is real or imminent
- R1 (list endpoint) and R8 (auth identity enrichment) must ship first
- Security-minion recommends per-tenant keys + isolation + scoping as a single PR, audit logging as follow-on
</github-issue>

---
Additional context: The user's specific questions:
1. There seems to be no plan for what the "admin key" is. Is that implicitly tenant 1?
2. Key provisioning must happen via admin API, not CLI. If CLI at all then later and it would work with the admin API.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-edge-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-observability-minion.md

## Key consensus across specialists:

### security-minion
KV-based key lookup with dual-path (KV first, env-var fallback). Three scopes: capture, read, admin. Bootstrap via existing CAPTURE_API_KEY env var as superadmin, delete after provisioning. Server-generated 256-bit keys, soft-delete revocation. No timing-safe comparison needed on KV path.

### api-design-minion
Three admin endpoints (POST/GET/DELETE) under /v1/admin/keys. v1 contract unbroken. GET /v1/captures/{id} stays unauthenticated. 403 for scope violations. capture scope implies read. wrl_live_ key prefix for scanner detectability.

### edge-minion
Keep global rate limiter at 200/min. Dedicated ADMIN_RATE_LIMITER (5/min) with rate check before auth. No KV key caching. 10-40ms latency acceptable. Per-tenant rate limiting deferred post-R12.

### iac-minion
Keep CAPTURE_API_KEY as dual-mode fallback. New ADMIN_KEY as separate wrangler secret. New ADMIN_RATE_LIMITER binding (namespace 1004/2004). No CI/CD changes needed. Staging parity via wrangler.toml.

### observability-minion
Enrich existing auth_fail with reason field. New admin subsystem at severity 4 for key_create/key_revoke. Add keyName to all tenant-carrying events. R12 enriches existing events; R13 adds new audit events.

## Key conflict to resolve
security-minion says NO separate ADMIN_KEY -- use CAPTURE_API_KEY as bootstrap superadmin, delete after provisioning.
iac-minion says YES separate ADMIN_KEY as new wrangler secret alongside CAPTURE_API_KEY.
This is the critical design conflict the synthesis must resolve.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Identify consensus and dissent -- preserve minority positions
4. Produce an advisory report with executive summary, team consensus,
   dissenting views, supporting evidence, risks, next steps, and
   conflict resolutions
5. Write your complete advisory synthesis to
   /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase3-synthesis.md