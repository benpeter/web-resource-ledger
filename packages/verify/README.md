# @w-r-l/verify

Verify the cryptographic integrity of [WRL](https://github.com/benpeter/web-resource-ledger) WACZ capture bundles -- offline, zero-install.

```bash
npx @w-r-l/verify capture.wacz --origin https://wrl.example.com
```

## What it checks

| Check | What it proves |
|-------|---------------|
| File integrity | Each file in the archive matches its SHA-256 hash |
| Bundle integrity | The archive manifest has not been modified |
| Digital signature | The bundle was signed by the operator's Ed25519 key |
| Timestamp imprint | The RFC 3161 timestamp references the correct bundle hash |
| Timestamp chain | The timestamp was signed by a trusted authority (CMS/PKCS#7 chain validation) |

Exit code `0` means all applicable checks passed. Exit code `1` means one or more failed. Exit code `2` means a usage error (bad arguments, missing file, network failure).

## Usage

### Remote capture (automatic key resolution)

```bash
npx @w-r-l/verify https://wrl.example.com/v1/captures/cap_abc123def456...
```

The signing key is fetched automatically from the server.

### Local file

```bash
# Fetch the key from the operator
npx @w-r-l/verify capture.wacz --origin https://wrl.example.com

# Or provide the key directly
npx @w-r-l/verify capture.wacz --key <base64-encoded-public-key>

# Or read the key from a file
npx @w-r-l/verify capture.wacz --key-file signing-key.pub
```

Local files require an explicit key source. The WACZ embeds a public key, but using it would be insecure -- an attacker who modifies the capture can also replace the embedded key.

### Self-consistency check

```bash
npx @w-r-l/verify capture.wacz --trust-embedded
```

Uses the key embedded in the WACZ. This proves the archive is internally consistent, but not that it came from a trusted operator.

### JSON output

```bash
npx @w-r-l/verify capture.wacz --origin https://wrl.example.com --json
```

Outputs a single JSON object to stdout. All human messages go to stderr in JSON mode.

```json
{
  "verified": true,
  "checks": [
    { "name": "artifactHashes", "label": "File integrity", "status": "pass", "detail": null },
    { "name": "bundleHash", "label": "Bundle integrity", "status": "pass", "detail": null },
    { "name": "signature", "label": "Digital signature", "status": "pass", "detail": null },
    { "name": "timestamp", "label": "Timestamp imprint", "status": "pass", "detail": null },
    { "name": "timestampChain", "label": "Timestamp chain", "status": "pass", "detail": null }
  ],
  "capture": {
    "bundleHash": "sha256:...",
    "signature": "...",
    "embeddedPublicKey": "...",
    "signedAt": "2026-03-16T14:22:07Z",
    "timestamp": { "genTime": "2026-03-16T14:22:08Z", "tsa": "DigiCert Timestamp Authority" }
  },
  "keyResolution": {
    "keyId": "a1b2c3d4",
    "source": "origin",
    "origin": "https://wrl.example.com",
    "endpoint": "/.well-known/signing-keys"
  },
  "source": "capture.wacz",
  "verifiedAt": "2026-03-17T00:30:00.000Z"
}
```

On errors, `verified` is `null` (not `false`) and an `error` field is present:

```json
{ "error": "Cannot read file capture.wacz: ...", "verified": null, "checks": [], "source": "capture.wacz" }
```

### Additional trusted roots

```bash
npx @w-r-l/verify capture.wacz --origin https://wrl.example.com --trust-root /path/to/extra-root.pem
```

The tool bundles the DigiCert Trusted Root G4 certificate. Use `--trust-root` to add PEM certificates for other timestamp authorities. Can be specified multiple times.

## Options

```
--origin <url>       WRL instance URL for key resolution
--key <base64>       Ed25519 public key (base64)
--key-file <path>    Read public key from file
--trust-embedded     Use the embedded key (insecure)
--trust-root <path>  Additional trusted root certificate (PEM)
--json               Output machine-readable JSON to stdout
--no-color           Disable colored output
-h, --help           Show this help message
--version            Show version number
```

`--origin`, `--key`, `--key-file`, and `--trust-embedded` are mutually exclusive.

## Requirements

Node.js 20 or later.

## License

[Apache 2.0](../../LICENSE)
