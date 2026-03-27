---
alert: "[WRL] Auth Failure Spike"
events:
  - security.auth_fail
priority: P1
---

# Runbook: [WRL] Auth Failure Spike

## What fires this

More than 3 `security.auth_fail` events in a 15-minute window (~12/hour).
With one tenant and one API key, legitimate auth failures should be near zero.

## Check

Query Coralogix:

```
event:"security.auth_fail" AND applicationName:"wrl"
```

Look at:
- `cip` — hashed IP correlation token. Same `cip` = single source. Multiple
  `cip` values = distributed activity.
- `reason` — why authentication failed:
  - `missing_header` — no Authorization header sent
  - `invalid_format` — header present but wrong format (not Bearer)
  - `key_not_found` — API key doesn't exist in KV
  - `insufficient_scope` — key exists but lacks required scope
  - `revoked` — key was explicitly revoked
- `path` — which endpoint was targeted

## Likely causes

**Scanner/bot probing.** Automated scanners hitting the API without credentials.
All failures from one `cip`, reason is `missing_header` or `invalid_format`.

**Misconfigured client.** Wrong API key in a client. Usually one `cip`, reason
is `key_not_found`. May happen during key rotation.

**Key rotation overlap.** Old key revoked but still cached somewhere. Reason
is `revoked` or `key_not_found`. Should resolve within minutes.

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
