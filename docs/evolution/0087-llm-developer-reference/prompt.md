**Outcome**: A structured reference document exists that gives LLMs (and developers) the context needed to operate on WRL — D1 schema, API routes, KV namespaces, R2 buckets, env vars, and wrangler config — so that AI-assisted development sessions don't start with 10 minutes of codebase archaeology.

**Success criteria**:
- Document covers: D1 tables and columns, all API routes with methods, KV/R2 namespace names and purposes, environment variables and secrets (names only, not values), wrangler.toml bindings
- Clear separation between dev-only internals and public API surface
- Document lives in a location discoverable by LLMs (e.g., `llms.txt`, `CLAUDE.md` reference, or `docs/`)
- Accurate against current codebase (not stale)

**Scope**:
- In: D1 schema, API routes, bindings (KV, R2, DO), env vars, worker config
- Out: Public-facing API documentation (already on docs site), operational runbooks, architecture narratives
