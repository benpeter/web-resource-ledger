---
alert: "[WRL] Auth Failure Spike"
events:
  - security.auth_fail
priority: P1
---

# Runbook: [WRL] Auth Failure Spike

## What fires this

More than 10 `security.auth_fail` events with a credential in a 15-minute
window. Failures without any credential (`reason:"missing_header"`) are not
counted: MCP clients connect without a key first, and crawlers probe the API.

## Check

Query Coralogix:

```
event:"security.auth_fail" AND NOT reason:"missing_header" AND applicationName:"wrl"
```

Look at:
- `cip` — hashed IP correlation token. Same `cip` = single source. Multiple
  `cip` values = distributed activity.
- `reason` — why authentication failed:
  - `missing_header` — no Authorization header sent (not counted by the alert)
  - `invalid_scheme` — header present but not `Bearer`
  - `key_not_found` — API key doesn't exist
  - `key_revoked` — key was explicitly revoked
  - `scope_insufficient` / `legacy_scope_insufficient` — key lacks the required scope
  - `invalid_admin_key` — wrong key on an admin endpoint
- `via` — `mcp` when the request came through the MCP endpoint

## Likely causes

**Scanner/bot probing.** Automated scanners hitting the API with made-up
credentials. Reason is `invalid_scheme` or `key_not_found`, often from several
`cip` values within a few minutes.

**Misconfigured client.** Wrong API key in a client. Usually one `cip`, reason
is `key_not_found`. May happen during key rotation.

**Key rotation overlap.** Old key revoked but still cached somewhere. Reason
is `key_revoked` or `key_not_found`. Should resolve within minutes.

**Credential stuffing.** Multiple `cip` values, high volume, reason varies.
More concerning — may indicate a targeted attack.

## Fix

1. **Check `cip` distribution.** Single source vs. multiple sources changes
   the response.
2. **Single source (scanner):** If it's a known scanner pattern, consider
   adding rate limiting at the Cloudflare level (WAF rule).
3. **Misconfigured client:** Identify the client and correct the API key.
   Check 1Password WRL vault for the current key.
4. **After key rotation:** Verify the old key is no longer in use anywhere.
   Expected to self-resolve within minutes.
5. **Distributed attack:** Review Cloudflare WAF logs. Consider temporary
   IP blocking or additional rate limiting.

## False positive?

Possible during key rotation if the old key is cached and retried. Also
possible if a vulnerability scanner (e.g., from a hosting provider) probes
the endpoint. Check `reason` and `cip` to distinguish operational noise
from real threats.
