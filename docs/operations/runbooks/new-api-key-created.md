# Runbook: [WRL] New API Key Created

## What fires this

Any `admin.key_create` event with `responseStatus:201` in the `wrl` (production)
application. Threshold is 0 — every successful key creation fires immediately.

## Check

Query Coralogix:

```
event:"admin.key_create" AND responseStatus:201 AND applicationName:"wrl"
```

Look at:
- `tenantId` — which tenant the key was provisioned for
- `name` — human-readable label given to the key
- `scopes` — capability grants (`capture`, `read`, `admin`)
- `keyHashPrefix` — first 8 characters of the key hash (cross-reference against
  1Password WRL vault to confirm the key was intentionally created)
- `cip` — hashed IP correlation token for the admin request source

## Likely causes

**Expected: operator provisioning a new tenant key.** The notification is
informational. Confirm the `tenantId`, `name`, and `scopes` match an expected
onboarding or key rotation action. No further action required.

**Expected: key rotation for an existing tenant.** A new key was created to
replace an expiring or compromised one. Confirm the old key (`DELETE
/v1/admin/keys/:keyHash`) was or will be revoked.

**Unexpected: creation not initiated by the operator.** If the `tenantId` or
`name` does not match any known provisioning intent, treat this as a potential
admin credential compromise.

## Fix

### Confirm expected creation

1. Open 1Password → WRL vault. Locate the tenant item (`Tenant: {tenantId}`).
2. Verify the `PRODUCTION_API_KEY` or `STAGING_API_KEY` field was recently
   updated and the `keyHashPrefix` matches.
3. If confirmed, no action required — close the alert.

### Investigate unexpected creation

1. Check `cip` to identify the request source. Is it a known IP or a new one?
2. Check for `admin.key_create_fail` events near the same time — a pattern of
   failures followed by a success may indicate brute-force or replay.
3. If the creation appears unauthorized:
   - **Revoke the new key immediately:**
     ```bash
     source ~/.wrl-keys
     curl -s -X DELETE "https://api.webresourceledger.com/v1/admin/keys/{keyHash}" \
       -H "Authorization: Bearer $WRL_PROD_ADMIN_KEY"
     ```
   - Rotate the `ADMIN_KEY` in 1Password and push it via `wrangler secret put`.
   - Review Cloudflare Access / WAF logs for the admin endpoint access pattern.

## False positive?

This alert has no false positives by design — it fires on every successful key
creation. Every notification warrants a 30-second confirmation check. The only
"noise" scenario is during bulk onboarding of multiple tenants in a short period,
which would send one notification per key created.
