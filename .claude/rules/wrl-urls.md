- **Production**: `https://api.webresourceledger.com` (custom domain)
- **Staging**: `https://staging.webresourceledger.com` (custom domain)

Use `api.webresourceledger.com` for all production API calls and `staging.webresourceledger.com` for staging. The old workers.dev URLs (`wrl.benpeter.workers.dev`, `wrl-staging.benpeter.workers.dev`) are dead (Cloudflare 1042).

## Key URL patterns

| Purpose | Pattern | Example |
|---------|---------|---------|
| Verify page | `{base}/v1/verify/{captureId}` | `https://api.webresourceledger.com/v1/verify/cap_7e5d881d4a474be0849888c36fbb8af4` |
| Capture detail | `{base}/v1/captures/{captureId}` | `https://api.webresourceledger.com/v1/captures/cap_abc123` |
| Artifact download | `{base}/v1/captures/{captureId}/artifacts/{type}` | type: `screenshot`, `html`, `headers`, `wacz`, `certificate` |
| Diff view | `{base}/v1/captures/{captureId}/diff/{baseId}` | Compare two captures |
| Dashboard | `{base}/ui` | Browser-based tenant dashboard |
| Signing key | `{base}/.well-known/signing-key` | Public Ed25519 verification key |

For the full route table, see `docs/INTERNALS.md` § API Routes.
