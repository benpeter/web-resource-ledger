Task 1: Auth module rewrite. See synthesis phase3-synthesis.md Task 1 section for full prompt. Agent: security-minion (edge-minion in plan, but security-minion has deeper auth domain knowledge). Model: sonnet. Mode: bypassPermissions.

Advisory incorporations:
- security-minion P3.5: Use binding-presence check for misconfiguration guard, not KV content scan
- observability-minion P3.5: Add kv_error reason value and try/catch around env.KV.get()
- observability-minion P3.5: auth.js needs to import log.js for security.legacy_auth_used event
