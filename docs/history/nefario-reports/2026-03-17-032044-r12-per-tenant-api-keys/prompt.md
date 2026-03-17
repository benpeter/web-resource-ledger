Issue #42: R12 Per-tenant API keys and tenant isolation.

Implement per-tenant API keys with KV-based key lookup, admin API for key provisioning, scope enforcement, and tenant isolation. Design decisions from advisory 2026-03-17 are settled (see issue body). The implementing PR must include a migration runbook.

Additional directives:
- edge-minion, iac-minion, and security-minion must be part of the planning team
- Skip no post-execution phases
- Write process.md in the evolution log directory
- Check evolution log sequence numbers on upstream main before PR creation