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

---
Additional context: look at #42, there seems to be no plan what the admin key is. is that implicitly tenant 1? also, key provisioning must happen via admin API, not CLI. if CLI at all then later and it would work with the admin API