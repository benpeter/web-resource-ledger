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
