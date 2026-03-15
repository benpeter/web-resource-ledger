# Web Resource Ledger (WRL)

[![CI](https://github.com/benpeter/web-resource-ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/benpeter/web-resource-ledger/actions/workflows/ci.yml) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE) [![despicable](https://img.shields.io/badge/%E2%9A%97%EF%B8%8F-despicable-FFC107?style=flat&labelColor=FFF8E1)](https://github.com/benpeter/despicable-agents) [![Vibe Coded](https://img.shields.io/badge/Vibe_Coded-ff69b4?logo=claude&logoColor=white)](https://github.com/trieloff/vibe-coded-badge-action)

Tamper-evident archival of web resources -- captures rendered screenshots, HTML snapshots, HTTP headers, and resource manifests as cryptographically signed, immutable bundles.

Submit a URL, get back a screenshot, rendered HTML, HTTP headers, and an Ed25519-signed archive that anyone can verify without an account. Deploy it on your own infrastructure; your captures, your keys, your evidence.

## What you get

A single API call produces:

- **Full-page screenshot** (PNG)
- **Rendered HTML** -- the DOM after JavaScript execution
- **HTTP response headers** -- the server's response at capture time
- **Signed WACZ bundle** -- all artifacts packaged, hashed, and signed with Ed25519
- **Verification URL** -- a shareable link anyone can use to confirm authenticity

## Usage

Requires a running WRL instance. See [Setup](#setup) below.

```bash
export WRL_API_KEY=your_capture_api_key
```

Replace `wrl.example.com` with your deployment URL, or `localhost:8787` for local dev.

#### Step 1: Submit a capture

```bash
curl -X POST https://wrl.example.com/v1/captures \
  -H "Authorization: Bearer $WRL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "statusUrl": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status",
  "note": "No list endpoint is available. Store the capture ID -- it is the only way to access this capture."
}
```

Store the capture ID. There is no listing endpoint to recover it.

#### Step 2: Poll for completion

```bash
curl https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status
```

No auth required -- the capture ID acts as the access secret. Poll until `status` is `complete` or `failed`. The response includes a `captureUrl` when complete.

#### Step 3: Retrieve artifacts

```bash
curl https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

Returns metadata and signed artifact URLs (screenshot, html, headers, wacz) plus a `verifyUrl`.

#### Step 4: Verify the bundle

```bash
curl https://wrl.example.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

Returns a JSON verification result with three checks: `artifactHashes`, `bundleHash`, and `signature`. The `verifyUrl` from step 3 also renders as a human-readable page in browsers.

The `verifyUrl` is safe to share publicly. The raw capture ID grants full access to all artifacts -- treat it as a secret.

For error codes and full request/response shapes, see [`openapi.yaml`](openapi.yaml).

## Setup

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated
- Node.js 20+
- Cloudflare account with R2 and Browser Rendering enabled

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

### 4. Configure capture API key

`CAPTURE_API_KEY` is the static bearer token used to submit captures. It is required -- the capture endpoint returns 401 without it.

In the usage examples above, this is `$WRL_API_KEY`.

Generate a key:

```bash
openssl rand -hex 32
```

Set the production secret:

```bash
wrangler secret put CAPTURE_API_KEY
```

For local dev, add to `.dev.vars`:

```
CAPTURE_API_KEY=<hex string from the command above>
```

**Security:** Never commit this value to version control. `.dev.vars` is already in `.gitignore`.

### 5. Configure signing key

WRL signs WACZ bundles with Ed25519. The signing key is optional -- if `SIGNING_KEY` is not set, captures complete successfully but without WACZ bundles (screenshot, HTML, and headers are still stored).

Generate a key pair:

```bash
node scripts/generate-signing-key.js
```

The script prints a private key (PKCS8 DER, base64) and the corresponding public key (raw, base64). The public key is embedded automatically in every signed bundle for verification -- no separate distribution needed.

Set the production secret:

```bash
wrangler secret put SIGNING_KEY
# Paste the private key (PKCS8 DER, base64) when prompted
```

For local dev, add to `.dev.vars`:

```
SIGNING_KEY=<base64 string from the script>
```

**Security:** Never commit the private key to version control. `.dev.vars` is already in `.gitignore`.

### 6. Deploy

```bash
wrangler deploy
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for local dev setup, test conventions, and contribution guidelines.

## Built with despicable-agents

WRL was built using [despicable-agents](https://github.com/benpeter/despicable-agents), a multi-agent orchestration framework. Every phase of development is documented in [`docs/evolution/`](docs/evolution/) -- 12 phases from initial scaffolding to open-source readiness. The prompts, decisions, and outcomes are all there.

## Reference

### Key Rotation

> **Warning:** Rotating the signing key invalidates signature verification for all captures signed with the previous key. There is no key history endpoint yet -- old captures will show "Verification Failed" until key versioning is implemented.

1. Generate a new key pair: `node scripts/generate-signing-key.js`
2. Update the production secret: `wrangler secret put SIGNING_KEY`
3. Update local dev secret in `.dev.vars` (if applicable)

New captures are signed with the new key. Existing captures signed with the old key will fail signature verification. The `/.well-known/signing-key` endpoint serves the current key -- third-party verifiers should re-fetch after rotation. Caches converge within 1 hour.

Key versioning and old-key verification are not yet implemented. See `docs/backlog.md` under "Signing and Legal Admissibility."

### Public Key Endpoint

`GET /.well-known/signing-key` returns the current Ed25519 public key for independent verification. Third-party verifiers can fetch the key without trusting the `publicKey` embedded in individual WACZ bundles. The response is JSON with shape `{ algorithm, publicKey }`, where `publicKey` is the base64-encoded raw 32-byte Ed25519 key. Responses are cached for 1 hour at the edge.

## License

[Apache 2.0](LICENSE)
