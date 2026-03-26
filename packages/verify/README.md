# @w-r-l/verify

Verify the cryptographic integrity of [WRL](https://github.com/benpeter/web-resource-ledger) WACZ capture bundles -- offline, zero-install.

```bash
npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com
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

### Remote capture

```bash
npx @w-r-l/verify "https://api.webresourceledger.com/v1/captures/cap_abc123def456..."
```

The signing key is fetched from the server automatically. Individual captures are publicly accessible -- no authentication or tokens are needed.

### Remote capture via server-side verify endpoint

The `/v1/verify/cap_<id>` endpoint returns a server-side verification result as JSON or HTML, without downloading the WACZ locally. Use it when you want a lightweight check or don't need local verification:

```bash
npx @w-r-l/verify https://api.webresourceledger.com/v1/verify/cap_abc123def456...
```

The distinction:
- `/v1/captures/cap_<id>` -- CLI downloads the WACZ and verifies it locally (cryptographic proof)
- `/v1/verify/cap_<id>` -- server returns its own verification result (JSON or HTML)

### Local file

```bash
# Fetch the key from the operator
npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com

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

### Legal report

```bash
npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com --legal
```

Produces a structured plain-text report designed for use in legal proceedings or formal documentation. No ANSI color codes are written -- the output is safe to redirect to a file or attach as a document.

The report is organized into seven sections: a plain-language summary, a description of the subject (captured URL, capture time), per-check explanations in non-technical terms, a chain of custody narrative, applicable legal standards (FRE 901(b)(9) and eIDAS Art. 41), a methodology description, and full technical details with untruncated cryptographic values. The format version is WRL-LEGAL-1.0, which appears in the report header.

Standard and qualified timestamps are reported separately when both are present. A standard RFC 3161 timestamp (DigiCert) is included for every capture. An eIDAS-qualified timestamp appears only when the capturing account has opted into a qualified Trust Service Provider; the report identifies which tier applies and what legal weight it carries.

```bash
# Machine-readable version of the same report
npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com --legal --json
```

`--legal --json` produces a JSON object with the same seven sections as structured fields. All cryptographic values are untruncated in both output modes.

For a full explanation of the legal context and frameworks the report references, see the [Legal Evidence guide](https://webresourceledger.com/legal-evidence/).

### JSON output

```bash
npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com --json
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
    "origin": "https://api.webresourceledger.com",
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
npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com --trust-root /path/to/extra-root.pem
```

The tool bundles the DigiCert Trusted Root G4 certificate. Use `--trust-root` to add PEM certificates for other timestamp authorities. Can be specified multiple times.

## Options

```
--origin <url>       WRL instance URL for key resolution
--key <base64>       Ed25519 public key (base64)
--key-file <path>    Read public key from file
--trust-embedded     Use the embedded key (insecure)
--trust-root <path>  Additional trusted root certificate (PEM)
--legal              Produce a structured plain-text legal report (WRL-LEGAL-1.0)
--json               Output machine-readable JSON to stdout
--no-color           Disable colored output
-h, --help           Show this help message
--version            Show version number
```

`--origin`, `--key`, `--key-file`, and `--trust-embedded` are mutually exclusive.

`--legal` can be combined with `--json` for a machine-readable version of the same report. `--legal` implies `--no-color` -- ANSI codes are never written in legal mode.

## Requirements

Node.js 20 or later.

## Releasing

Releases are published to npm automatically when a `verify/v*` tag is pushed.

**Steps:**

1. Generate the changelog (review and edit before proceeding):
   ```bash
   ./scripts/changelog-verify.sh patch   # or minor, major
   ```

2. Bump version, commit, and create tag:
   ```bash
   cd packages/verify && npm version patch -m "chore(verify): release %s"
   ```

3. Push the commit and tag:
   ```bash
   git push origin main --follow-tags
   ```

The CI workflow runs tests and publishes to npm with provenance attestation.
If the version already exists on npm, the publish step exits cleanly.

## License

[PolyForm Shield 1.0.0](../../LICENSE)
