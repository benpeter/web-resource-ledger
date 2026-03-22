# Web Resource Ledger (WRL)

[![CI](https://github.com/benpeter/web-resource-ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/benpeter/web-resource-ledger/actions/workflows/ci.yml) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE) [![despicable](https://img.shields.io/badge/%E2%9A%97%EF%B8%8F-despicable-FFC107?style=flat&labelColor=FFF8E1)](https://github.com/benpeter/despicable-agents) [![99% Vibe Coded](https://img.shields.io/badge/99%25-Vibe_Coded-ff69b4?style=flat&logo=claude&logoColor=white)](https://github.com/ai-ecoverse/vibe-coded-badge-action)

Cryptographic evidence of web content -- capture what a page looked like, when, with proof anyone can verify.

Submit a URL, get back a screenshot, rendered HTML, HTTP headers, and an Ed25519-signed WACZ bundle. The verification URL works for anyone -- no account needed. Deploy on your own infrastructure; your captures, your keys, your evidence.

For comprehensive guides on authentication, verification, batch captures, and MCP integration, see [docs.webresourceledger.com](https://docs.webresourceledger.com).

> **Status:** Early development, single-operator deployment. The API is functional and deployed but pre-1.0. See the [roadmap](#roadmap) for what's coming.

## What you get

A single API call produces:

- **Dual screenshots** (PNG) -- before and after cookie consent dismissal, so both
  the banner presence and the underlying page content are preserved
- **Rendered HTML** -- the DOM after JavaScript execution
- **HTTP response headers** -- the server's response at capture time
- **Signed WACZ bundle** -- all artifacts packaged, hashed, and signed with Ed25519
- **Verification URL** -- a shareable link anyone can use to confirm authenticity

## Usage

Requires a running WRL instance. See [Setup](#setup) below.

```bash
export WRL_API_KEY=your_tenant_api_key
```

Tenant keys are created via the admin API (see [step 8a](#8a-configure-admin-key-required-for-per-tenant-key-management)). For deployments using the legacy static key, `WRL_API_KEY` is your `CAPTURE_API_KEY` value.

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
  "note": "Use GET /v1/captures to list and search your captures."
}
```

Your captures are always accessible. Use `GET /v1/captures` to list them, or save the capture ID for direct access.

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

Returns a JSON verification result with up to four checks: `artifactHashes`, `bundleHash`, `signature`, and (for new captures) `timestamp`. The timestamp check verifies an RFC 3161 independent timestamp obtained at capture time. Legacy captures return three checks. The `verifyUrl` from step 3 also renders as a human-readable page in browsers.

The `verifyUrl` is safe to share publicly. The capture ID grants full access to all artifacts without authentication -- treat it as a secret. Anyone with the ID can view the capture.

#### Offline verification

For independent, offline verification -- including full CMS/PKCS#7 certificate chain validation -- use the CLI tool:

```bash
npx @w-r-l/verify capture.wacz --origin https://wrl.example.com
```

See [`packages/verify/`](packages/verify/) for details.

#### Finding and sharing captures

**Finding captures:** `GET /v1/captures` lists your captures (requires your API key). Use it to browse and recover capture IDs. **Sharing captures:** The capture ID in any URL works without authentication. Share verification URLs freely.

```bash
curl https://wrl.example.com/v1/captures \
  -H "Authorization: Bearer $WRL_API_KEY"
```

```json
{
  "data": [
    {
      "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "status": "complete",
      "url": "https://example.com",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "completedAt": "2024-01-15T10:30:45.123Z"
    }
  ],
  "pagination": {
    "cursor": null,
    "hasMore": false,
    "limit": 20
  }
}
```

Optional query parameters: `limit` (1-100, default 20), `cursor` (for paging), `status` (`pending`, `complete`, or `failed`).

Captures are rate-limited to 10 per minute per IP. Verification is limited to 60 per minute per IP. Error responses use RFC 9457 `application/problem+json` format. For full details, see [`openapi.yaml`](openapi.yaml).

> **Detailed guides**: See [Getting Started](https://docs.webresourceledger.com) for a complete walkthrough, or browse the [API Reference](https://docs.webresourceledger.com/api-reference/) for the full endpoint catalog.

## Setup

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated
- Node.js 22+ (see `.nvmrc`)
- Cloudflare account with R2 and Browser Rendering enabled

### 1. Install dependencies

```bash
npm install
```

### 2. Create D1 database

```bash
wrangler d1 create wrl-metadata
```

Update the `database_id` in `wrangler.toml` under `[[d1_databases]]` with the returned ID. Then apply migrations:

```bash
wrangler d1 migrations apply wrl-metadata
```

### 2a. Create KV namespace (rate limiting)

KV is used only for rate limit counters. Create the namespace:

```bash
wrangler kv namespace create wrl-kv
```

Update `wrangler.toml` with the returned `id` and `preview_id`.

### 3. Create R2 bucket

```bash
wrangler r2 bucket create wrl-captures
wrangler r2 bucket create wrl-captures-preview
```

### 4. Configure capture API key (legacy fallback)

`CAPTURE_API_KEY` is a static bearer token that acts as a fallback when no tenant key is found in D1. For new deployments, consider setting up the admin API (step 8a) and creating tenant keys instead. For existing deployments, this key continues to work during migration.

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

### 6. Configure IP hash seed (recommended)

`IP_HASH_SEED` is an HMAC seed used to hash IP addresses before they appear in logs. Without it, log entries have no IP correlation for abuse analysis.

Generate a seed:

```bash
openssl rand -hex 32
```

Set the production secret:

```bash
wrangler secret put IP_HASH_SEED
```

For local dev, add to `.dev.vars`:

```
IP_HASH_SEED=<hex string from the command above>
```

### 7. Configure Coralogix log ingestion (required for production observability)

`CORALOGIX_SEND_KEY` is the API key for structured log ingestion to Coralogix. Without it, the Worker runs normally but logs go to console only -- no structured log ingestion occurs. For fork developers who do not use Coralogix, this key is effectively optional.

Find your send key in the Coralogix dashboard under **Settings > Send Your Data > API Keys**.

Set the production secret:

```bash
wrangler secret put CORALOGIX_SEND_KEY
```

For local dev, structured logs are emitted to the console. No key is needed for `wrangler dev`.

### 8. Configure CORS origins (optional)

`CORS_ORIGINS` is a comma-separated list of allowed origins for CORS preflight responses. Only needed if browser-based clients will call the API directly.

Set it as an environment variable in `wrangler.toml` (not a secret):

```toml
[vars]
CORS_ORIGINS = "https://app.example.com,https://www.example.com"
```

If omitted, cross-origin requests from browsers are blocked. Server-to-server requests are unaffected.

### 8a. Configure admin key (required for per-tenant key management)

`ADMIN_KEY` is the bearer token for the admin API (`/v1/admin/keys`). It grants the ability to create, list, and revoke per-tenant API keys. It does **not** grant capture or read access.

Generate a key:

```bash
openssl rand -hex 32
```

Set the production secret:

```bash
wrangler secret put ADMIN_KEY
```

For local dev, add to `.dev.vars`:

```
ADMIN_KEY=<hex string from the command above>
```

Once deployed, create your first tenant key:

```bash
curl -X POST <YOUR_PRODUCTION_URL>/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "default", "scopes": ["capture"], "name": "default-key"}' | jq .
```

Use the returned `key` value as `$WRL_API_KEY` going forward. See [OPERATIONS.md](OPERATIONS.md#multi-tenant-key-migration) for the full migration runbook.

**Security:** Never commit this value to version control. `.dev.vars` is already in `.gitignore`.

### 9. Deploy

```bash
wrangler deploy
```

Steps 1-9 are one-time setup. After initial deployment, the CD pipeline handles staging and production deploys automatically on every push to `main`. For the full deploy flow, environment configuration, rollback procedures, and how secrets map across Worker runtime, GitHub CI, and local development, see [OPERATIONS.md](OPERATIONS.md).

## MCP Server

WRL exposes all four core operations — capture, retrieve, list, and verify — as MCP tools. Any MCP-compatible agent or IDE can capture web pages and verify evidence without writing HTTP client code.

See the [MCP Server Guide](https://docs.webresourceledger.com/mcp/) for setup instructions and example workflows. For local reference, [`docs/mcp.md`](docs/mcp.md) covers Claude Code, Cursor, Windsurf, and generic clients along with the full tool reference.

## Web UI

WRL includes a browser-based interface for submitting captures and browsing
results. Navigate to `/ui` on your WRL deployment to access it. Authentication
requires a WRL API key with `capture` and `read` scopes.

The UI is served directly from the Worker — no separate hosting or CORS
configuration required.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for local dev setup, test conventions, and contribution guidelines.

See [OPERATIONS.md](OPERATIONS.md) for deployment, rollback, and environment setup.

### Staging

`wrangler.toml` includes an `[env.staging]` configuration with its own R2 bucket, D1 database, and KV namespace (rate limiting only). Before deploying, you must create those resources in your own Cloudflare account (same as steps 2-3 above, but scoped to staging).

Create the staging D1 database:

```bash
wrangler d1 create wrl-metadata-staging
```

Update the `database_id` under `[[env.staging.d1_databases]]` in `wrangler.toml`, then apply migrations:

```bash
wrangler d1 migrations apply wrl-metadata-staging --env staging
```

Create the staging KV namespace (rate limiting only):

```bash
wrangler kv namespace create KV --env staging
```

Update the `id` field under `[env.staging.kv_namespaces]` in `wrangler.toml` with the returned ID.

Create the staging R2 bucket:

```bash
wrangler r2 bucket create wrl-captures-staging
```

Then deploy to staging:

```bash
wrangler deploy --env staging
```

Staging auto-deploys on merge to `main` via `deploy-staging.yml`. Secrets must be set separately for the staging environment:

```bash
wrangler secret put CAPTURE_API_KEY --env staging
wrangler secret put SIGNING_KEY --env staging
# repeat for any other secrets
```

Smoke tests run against a live deployment. Set `SMOKE_URL` and `SMOKE_API_KEY`, then:

```bash
npm run smoke
```

## Roadmap

WRL follows a three-act development plan:

1. **Solid Foundation** (complete) -- List endpoint, key versioning, CORS, security hardening. Closes the trust gaps for single-operator use.
2. **Evidence-Grade** (in progress) -- RFC 3161 timestamps, per-tenant keys (complete), audit logging. Makes "evidence" independently verifiable.
3. **Infrastructure** -- MCP server, web UI, batch capture. Expands WRL into a platform other tools build on.

See [`docs/backlog.md`](docs/backlog.md) for the full roadmap and [GitHub issues](https://github.com/benpeter/web-resource-ledger/issues) for detailed tracking.

## Built with despicable-agents

WRL was built using [despicable-agents](https://github.com/benpeter/despicable-agents), a multi-agent orchestration framework. Every phase of development is documented in [`docs/evolution/`](docs/evolution/) -- the prompts, decisions, and outcomes are all there.

## Reference

### Key Rotation

Key rotation is safe -- old captures continue to verify after rotation. Every time a capture is signed, the signing key is archived automatically. Each key is identified by a `keyId`: the first 8 hex characters of the SHA-256 of the raw 32-byte public key. The `keyId` is stored in the WACZ bundle's `signedData.signatures` array (v0.2.0) or `signedData` directly (v0.1.0 legacy) and in the D1 capture record. During verification, the system looks up the correct historical key by `keyId` rather than assuming the current key.

Rotation procedure:

1. Generate a new key pair: `node scripts/generate-signing-key.js`
2. Update the production secret: `wrangler secret put SIGNING_KEY`
3. Update local dev secret in `.dev.vars` (if applicable)

New captures are signed with the new key. Existing captures are verified against the archived key that signed them. The `/.well-known/signing-keys` endpoint lists the full key archive for third-party verifiers.

### Public Key Endpoint

`GET /.well-known/signing-key` returns the current Ed25519 public key. Third-party verifiers can fetch the key without trusting the `publicKey` embedded in individual WACZ bundles. Responses are cached for 1 hour at the edge.

```json
{
  "algorithm": "Ed25519",
  "publicKey": "<base64-encoded raw 32-byte key>",
  "keyId": "<8-char hex fingerprint>"
}
```

`keyId` is the first 8 hex characters of the SHA-256 of the raw public key bytes. Use it to match against the key archive when verifying historical captures.

### Key Archive Endpoint

`GET /.well-known/signing-keys` lists all historical signing keys. Use this endpoint to verify captures signed with any key, not just the current one.

```json
{
  "keys": [
    {
      "keyId": "<8-char hex fingerprint>",
      "algorithm": "Ed25519",
      "publicKey": "<base64-encoded raw 32-byte key>",
      "archivedAt": "<ISO 8601 timestamp>"
    }
  ]
}
```

Third-party verifiers: match the `keyId` from a WACZ bundle's `signedData` (v0.1.0) or `signedData.signatures` array (v0.2.0) against this list to retrieve the correct public key for signature verification. Rate-limited at the same limit as the singular endpoint.

### Health Endpoint

`GET /health` returns the current service status and legal document URLs.

```json
{ "status": "ok", "legal": { "terms": "<url>", "policy": "<url>" } }
```

Useful for uptime monitoring and smoke tests.

### Response Headers

All responses include:

- `Link` -- points to the terms-of-service URL with `rel="terms-of-service"`. Present on every response.
- `Strict-Transport-Security` -- includes `preload` and `includeSubDomains`. Present on every response.
- `X-RateLimit-Limit` -- the rate limit ceiling for the endpoint. Present on responses from rate-limited endpoints (captures, verification, signing key endpoints).

## Legal

- [Terms of Service](TERMS.md)
- [Content Moderation Policy](CONTENT-POLICY.md)

By using this API, you agree to the [Terms of Service](TERMS.md).

## License

[Apache 2.0](LICENSE)
