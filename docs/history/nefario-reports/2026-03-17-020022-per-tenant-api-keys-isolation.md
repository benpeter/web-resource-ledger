---
task: "R12: Per-tenant API keys and tenant isolation -- admin key identity and provisioning"
date: 2026-03-17
slug: per-tenant-api-keys-isolation
mode: advisory
source-issue: 42
task-count: 0
gate-count: 0
compaction-events: 0
---

## Summary

Five specialists analyzed R12's per-tenant API key design, resolving two open questions: (1) the admin key is NOT implicitly tenant 1 -- it is a separate infrastructure credential (`ADMIN_KEY` wrangler secret) that can provision keys for any tenant; (2) key provisioning happens exclusively via admin API (`/v1/admin/keys`), not CLI. The team reached strong consensus on the core architecture: SHA-256 hash-then-lookup in KV, three scopes (`capture`, `read`, `admin`), server-generated 256-bit keys, soft-delete revocation, and v1 API contract unbroken. One significant conflict -- whether admin auth uses the existing `CAPTURE_API_KEY` as temporary superadmin (security-minion) or a dedicated `ADMIN_KEY` secret (iac-minion) -- resolved in favor of `ADMIN_KEY` for cleaner separation of tenant and infrastructure credentials.

## Original Prompt

Issue #42: R12 Per-tenant API keys and tenant isolation. User's additional questions: (1) There seems to be no plan for what the admin key is -- is that implicitly tenant 1? (2) Key provisioning must happen via admin API, not CLI. If CLI at all then later and it would work with the admin API.

## Key Design Decisions

1. **`ADMIN_KEY` is a separate infrastructure credential, not tenant 1** -- Dedicated wrangler secret (like `SIGNING_KEY`, `IP_HASH_SEED`). Can provision keys for any tenant. Tenant 1 (`default`) gets its own tenant keys through the admin API like any other tenant. `CAPTURE_API_KEY` remains as backward-compatible fallback for the `default` tenant during migration, then gets removed.

2. **Admin API only, no CLI in R12** -- Three endpoints: `POST /v1/admin/keys` (create), `GET /v1/admin/keys` (list), `DELETE /v1/admin/keys/{keyHash}` (revoke). CLI, if ever built, would be a thin client calling these endpoints.

3. **Hybrid admin scope model** -- `ADMIN_KEY` env var is global superadmin (cross-tenant). KV-stored keys with `admin` scope are tenant-scoped (can only manage their own tenant's keys). Gives operators full control while enabling tenant self-service.

4. **Three scopes: `capture`, `read`, `admin`** -- `capture` implies `read`. `admin` does NOT imply `capture`/`read` (prevents god-keys). 403 responses name the required scope for usability.

5. **KV key record: `apikey:{sha256hex}` -> `{ tenantId, scopes, name, createdAt, createdBy, revoked }`** -- SHA-256 hash-then-lookup eliminates timing side-channel. Soft-delete revocation (60s KV eventual consistency accepted).

6. **Server-generated 256-bit keys with `wrl_live_` prefix** -- Returned exactly once at creation. Prefix enables secret scanner detectability.

7. **Dedicated admin rate limiter (5/min)** -- Rate check BEFORE auth on admin endpoints to throttle pre-auth abuse. New `ADMIN_RATE_LIMITER` binding (namespace 1004/2004).

8. **No KV key caching** -- 10-40ms latency acceptable (within 300ms budget). Security (instant revocation) trumps latency optimization.

9. **Observability: enrich, don't proliferate** -- Add `keyName` and `reason` fields to existing events. New `admin` subsystem for key_create/key_revoke. R12 enriches existing events; R13 adds new audit events.

## Phases

### Phase 1: Meta-Plan
Identified 5 specialists: security-minion (auth design), api-design-minion (admin API contract), edge-minion (rate limiting, caching, latency), iac-minion (wrangler config, secrets, deployment), observability-minion (logging schema). Team adjusted from original 7 (removed data-minion, software-docs-minion, ux-strategy-minion, test-minion; added edge-minion, iac-minion).

### Phase 2: Specialist Planning
- **security-minion**: KV-first lookup with env-var fallback, three scopes, soft-delete revocation, timing-safe analysis. Proposed using `CAPTURE_API_KEY` as bootstrap superadmin.
- **api-design-minion**: Three admin endpoints, `wrl_live_` key prefix, `capture` implies `read`, 403 for scope violations, v1 contract preserved.
- **edge-minion**: Keep global 200/min limiter, new admin 5/min limiter (rate-before-auth), no KV caching, per-tenant limiting deferred.
- **iac-minion**: Separate `ADMIN_KEY` secret, `ADMIN_RATE_LIMITER` binding, no pipeline changes, staging parity via wrangler.toml.
- **observability-minion**: `reason` field on auth_fail, `keyName` on tenant events, new `admin` subsystem, R12/R13 boundary drawn.

### Phase 3: Synthesis
Resolved the ADMIN_KEY vs CAPTURE_API_KEY conflict in favor of dedicated ADMIN_KEY. Resolved admin scope (hybrid: global for env var, tenant-scoped for KV keys). Resolved 403 detail messages (name the scope). Resolved key ID format (full hash for operations, short display ID for lists).

### Phases 3.5-8
Skipped (advisory-only orchestration).

## Agent Contributions

| Agent | Phase | Key Contribution |
|-------|-------|-----------------|
| security-minion | planning | Auth module design, key storage format, scope model, timing-safe analysis, revocation strategy, bootstrap mechanism |
| api-design-minion | planning | Admin API contract (3 endpoints), error responses, scope implications, key prefix format, v1 contract analysis |
| edge-minion | planning | Rate limiting strategy (global vs per-tenant vs admin), KV lookup latency analysis, caching implications, CDN future-proofing |
| iac-minion | planning | Secrets management (ADMIN_KEY), wrangler bindings, staging parity, deployment pipeline assessment, migration sequence |
| observability-minion | planning | Log event enrichment (keyName, reason), admin subsystem, R12/R13 boundary, severity levels, forward-compatible schema |

## Team Recommendation

### Executive Summary

Implement a KV-based key lookup with a dedicated `ADMIN_KEY` wrangler secret as the bootstrap/superadmin credential, separate from tenant keys. Key provisioning happens exclusively through an admin API (`/v1/admin/keys`). The existing `CAPTURE_API_KEY` remains as a dual-mode fallback for tenant `default` during migration, then gets removed. CLI tooling is out of scope for R12.

The admin key is NOT tenant 1. It is a separate infrastructure-level credential that can provision keys for any tenant, including the first one. Tenant 1 (`default`) gets its own tenant keys through the admin API, just like any other tenant.

### Consensus
- KV-based key lookup with SHA-256 hash-then-lookup (all agree)
- Three scopes: capture, read, admin (all agree)
- Server-generated 256-bit keys returned once (all agree)
- Soft-delete revocation with 60s KV consistency window accepted (all agree)
- v1 API contract unbroken (all agree)
- Admin API only, no CLI in R12 (all agree)
- Dedicated admin rate limiter with rate-before-auth ordering (all agree)
- No KV key caching (all agree)
- Observability: enrich existing events, new admin subsystem (all agree)

### Dissenting Views

1. **ADMIN_KEY vs CAPTURE_API_KEY as superadmin**: security-minion proposed using `CAPTURE_API_KEY` as temporary bootstrap superadmin (no new secret, simpler config, delete after provisioning). iac-minion proposed dedicated `ADMIN_KEY`. Resolved: `ADMIN_KEY` wins -- cleaner separation of tenant vs infrastructure credentials, follows existing secret pattern, easier to document.

2. **Admin scope: global vs tenant-scoped**: security-minion said tenant-scoped admin keys. api-design-minion said global admin for list-all. Resolved: hybrid -- `ADMIN_KEY` is global, KV admin keys are tenant-scoped.

3. **403 detail messages**: security-minion initially recommended not naming the required scope (avoid oracles). api-design-minion recommended naming it (usability). Resolved: name the scope -- the scope model is public, withholding hinders operators without improving security.

### Conditions to Revisit
1. A second user is real or imminent (activation gate for implementation)
2. Tenant count grows beyond single digits (may need key rotation endpoint, per-tenant rate limiting)
3. R13 audit logging implementation (validates R12's forward-compatible schema decisions)

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` (this orchestration)

</details>

<details>
<summary>Compaction</summary>

0 compaction events during this session.

</details>

## Working Files

[`docs/history/nefario-reports/2026-03-17-020022-per-tenant-api-keys-isolation/`](./2026-03-17-020022-per-tenant-api-keys-isolation/)

Files: prompt.md, phase1-metaplan.md, phase1-metaplan-rerun.md, phase2-security-minion.md, phase2-api-design-minion.md, phase2-edge-minion.md, phase2-iac-minion.md, phase2-observability-minion.md, phase3-synthesis.md (+ corresponding -prompt.md files)