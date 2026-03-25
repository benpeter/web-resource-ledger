# Signing Key Rotation

## When to Rotate

- Suspected key compromise
- Scheduled rotation (recommended: quarterly)
- Compliance requirement

## Pre-Rotation Checklist

1. Verify the current signing key is operational: `curl -s https://verify.webresourceledger.com/.well-known/signing-key | jq .keyId`
2. Confirm admin access: ensure you have the ADMIN_KEY and can reach the admin API
3. Schedule during low-traffic period if possible (key rotation is safe at any time, but reduces cache churn)

## Rotation Procedure

### Step 1: Generate a New Signing Key

```bash
node scripts/generate-signing-key.js
```

This outputs a PKCS8-encoded Ed25519 private key (base64). Save it securely.

### Step 2: Archive the Current Key

The current public key is automatically archived to the `signing_keys` D1 table when a new key is deployed. The `/.well-known/signing-keys` endpoint serves all archived keys so verifiers can validate captures signed with previous keys.

### Step 3: Deploy the New Key

```bash
# Production
echo "<new-key-base64>" | wrangler secret put SIGNING_KEY

# Staging
echo "<new-key-base64>" | wrangler secret put SIGNING_KEY --env staging
```

### Step 4: Purge the Cache

**Critical**: Purge BEFORE advertising the new key. Stale cache entries for `/.well-known/signing-key` would serve the old key to verifiers, causing verification failures for captures signed with the new key.

```bash
# Purge signing key cache (production)
./scripts/purge-cache.sh signing-keys

# Purge signing key cache (staging)
./scripts/purge-cache.sh --staging signing-keys
```

Verify the purge took effect:
```bash
# Should return the new keyId
curl -s https://verify.webresourceledger.com/.well-known/signing-key | jq .keyId

# Should include both old and new keys
curl -s https://verify.webresourceledger.com/.well-known/signing-keys | jq '.keys | length'
```

### Step 5: Store in 1Password

Update the 1Password item in the WRL vault:
```bash
op item edit "Production" --vault WRL "SIGNING_KEY=<new-key-base64>"
```

### Step 6: Verify

1. **New captures**: Create a test capture and verify it uses the new keyId
2. **Old captures**: Verify an existing capture — it should still pass using the archived key
3. **Cache headers**: Check `Server-Timing` header shows `cache;desc="MISS"` on first request after purge

## Cache Behavior During Rotation

- Signing key endpoints are cached with `max-age=3600, stale-while-revalidate=300`
- After purge, the first request to each colo will be a cache MISS and fetch the new key
- The `stale-while-revalidate` window (300s) means some colos may serve the old key briefly while revalidating — this is acceptable because the old key remains valid via the archive

## Rollback

If the new key causes issues:

1. Revert to the old key: `echo "<old-key-base64>" | wrangler secret put SIGNING_KEY`
2. Purge cache: `./scripts/purge-cache.sh signing-keys`
3. Verify: `curl -s https://verify.webresourceledger.com/.well-known/signing-key | jq .keyId`

## Timing Guarantees

- Zone-level URL purge propagates globally within 30 seconds (Cloudflare SLA)
- Combined with the purge-before-advertise ordering, stale key exposure is bounded to:
  - 0 seconds for colos that haven't cached yet
  - ≤30 seconds for colos with stale cache (purge propagation)
  - ≤300 seconds for colos serving stale-while-revalidate (edge case: purge arrives during SWR window)
