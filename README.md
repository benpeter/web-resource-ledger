# Web Resource Ledger (WRL)

Tamper-evident archival of web resources — captures rendered screenshots, HTML snapshots, HTTP headers, and resource manifests as cryptographically signed, immutable bundles.

Built on Cloudflare Workers with R2 storage and Browser Rendering.

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated
- Node.js 18+
- Cloudflare account with R2 and Browser Rendering enabled

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create KV namespace

```bash
wrangler kv namespace create wrl-kv
```

Update `wrangler.toml` with the returned `id` and `preview_id`.

### 3. Create R2 bucket

```bash
wrangler r2 bucket create wrl-captures
wrangler r2 bucket create wrl-captures-preview
```

## Signing Key Setup

WRL signs WACZ bundles with Ed25519. A signing key must be configured before captures produce signed bundles.

### Generate a key pair

```bash
node scripts/generate-signing-key.js
```

The script prints a private key (PKCS8 DER, base64) and the corresponding public key (raw, base64). The public key is embedded automatically in every signed bundle for verification — no separate distribution needed.

### Set the production secret

```bash
wrangler secret put SIGNING_KEY
# Paste the private key (PKCS8 DER, base64) when prompted
```

### Set the local dev secret

Add to `.dev.vars`:

```
SIGNING_KEY=<base64 string from the script>
```

**Note:** The signing key is optional. If `SIGNING_KEY` is not set, captures complete successfully but without WACZ bundles — individual artifacts (screenshot, HTML, headers, manifest) are still stored in R2.

**Security:** Never commit the private key to version control. `.dev.vars` is already in `.gitignore`.

## Key Rotation

> **Warning:** Rotating the signing key invalidates signature verification for all captures signed with the previous key. There is no key history endpoint yet -- old captures will show "Verification Failed" until key versioning is implemented.

1. Generate a new key pair: `node scripts/generate-signing-key.js`
2. Update the production secret: `wrangler secret put SIGNING_KEY`
3. Update local dev secret in `.dev.vars` (if applicable)

New captures are signed with the new key. Existing captures signed with the old key will fail signature verification. The `/.well-known/signing-key` endpoint serves the current key -- third-party verifiers should re-fetch after rotation. Caches converge within 1 hour.

Key versioning and old-key verification are not yet implemented. See `docs/backlog.md` under "Signing and Legal Admissibility."

### Public Key Endpoint

`GET /.well-known/signing-key` returns the current Ed25519 public key for independent verification. Third-party verifiers can fetch the key without trusting the `publicKey` embedded in individual WACZ bundles. The response is JSON with shape `{ algorithm, publicKey }`, where `publicKey` is the base64-encoded raw 32-byte Ed25519 key. Responses are cached for 1 hour at the edge.

## Development

```bash
npm run dev
```

## Deploy

```bash
wrangler deploy
```

## API

See `openapi.yaml` for the full API specification.

The capture endpoint accepts a URL and returns a capture ID. Use the capture ID to retrieve the stored artifacts or verify the signed bundle.
