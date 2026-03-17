Issue #42: R12 Per-tenant API keys and tenant isolation.

Implement per-tenant API keys with KV-based key lookup, admin API for key provisioning,
scope enforcement, and tenant isolation. Design decisions from advisory 2026-03-17 are
settled (ADMIN_KEY as separate infrastructure credential, admin API only for provisioning,
three scopes: capture/read/admin). The implementing PR must include a migration runbook.