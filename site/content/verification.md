---
layout: layouts/doc.njk
title: Verification
description: How to verify a WRL capture using the CLI or REST API, what each check confirms, and how the Ed25519 and RFC 3161 trust model works.
---

# Verification

Every WRL capture produces a WACZ bundle signed with Ed25519 and timestamped by an independent RFC 3161 authority. Verification confirms the capture has not been modified since it was created and that an independent party recorded the time.

## How to verify

### Command-line (offline, independent)

The `@w-r-l/verify` CLI runs entirely on your machine. It fetches the WACZ bundle, resolves the signing key from the operator's public endpoint, and performs all checks without trusting the WRL server for the verification decision itself.

Pass the capture URL directly:

```bash
npx @w-r-l/verify https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

Or download the WACZ file first and verify it locally:

```bash
npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com
```

Requires Node.js 20 or later. No installation needed -- `npx` fetches the package on demand.

**Example output (all checks passing):**

```
Verification PASSED

  File integrity     PASS
  Bundle integrity   PASS
  Digital signature  PASS
  Time verification  PASS
  Timestamp chain    PASS

Captured URL:  https://example.com
Signed at:     2026-03-22T10:30:12.350Z
Timestamp:     2026-03-22T10:30:12.481Z
TSA:           DigiCert Timestamp Authority
```

Exit code `0` means all checks passed. Exit code `1` means one or more checks failed. Exit code `2` means a usage error (bad arguments, missing file, or network failure fetching the key or bundle).

For machine-readable output, add `--json`. For full CLI options, see the [verify package README](https://github.com/benpeter/web-resource-ledger/tree/main/packages/verify).

### REST API (server-side)

The `GET /v1/verify/{id}` endpoint runs the same checks on the server and returns JSON. No authentication required.

```bash
curl https://api.webresourceledger.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

```json
{
  "verified": true,
  "capture": {
    "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "createdAt": "2026-03-22T10:30:00.000Z",
    "completedAt": "2026-03-22T10:30:12.481Z",
    "renderQuality": "full"
  },
  "signing": {
    "bundleHash": "sha256:e3b0c44298fc1c149afbf4c8996fb924...",
    "signedAt": "2026-03-22T10:30:12.350Z",
    "timestamp": {
      "genTime": "2026-03-22T10:30:12.481Z",
      "tsa": "http://timestamp.digicert.com"
    }
  },
  "checks": [
    { "name": "artifactHashes", "status": "pass" },
    { "name": "bundleHash",     "status": "pass" },
    { "name": "signature",      "status": "pass" },
    { "name": "timestamp",      "status": "pass" }
  ]
}
```

> **Note:** A `200` response does not mean the capture is verified. Always check the `verified` field. A `200` with `"verified": false` means the endpoint ran successfully but one or more checks failed.

The `verifyUrl` included in every capture record also renders as a human-readable browser page. Share it freely -- no account is needed to view it.

### What each check confirms

| Check | What it confirms |
|-------|-----------------|
| **File integrity** (`artifactHashes`) | Every file in the WACZ archive matches its recorded SHA-256 hash. No individual artifact has been modified. |
| **Bundle integrity** (`bundleHash`) | The archive manifest (`datapackage.json`) has not been altered. The hash covers the canonical form of the manifest. |
| **Digital signature** (`signature`) | The bundle was signed by the operator's Ed25519 private key. The signature is over the bundle hash. |
| **Time verification** (`timeVerification`) | An independent timestamp authority recorded the time of capture. Shows the strongest available tier: qualified electronic timestamp (eIDAS Art. 41) when present, otherwise standard RFC 3161 timestamp. |
| **Timestamp chain** (`timestampChain`) | The timestamp was signed by a certificate authority in a trusted chain (CLI only). Confirms the TSA itself is legitimate. |

When all checks pass, you know: every byte matches what was captured; the WACZ was assembled by the operator who holds the signing key; and an independent authority recorded the time at capture -- meaning the capture cannot have been backdated.

For how these technical properties map to legal authentication standards (FRE 901/902, eIDAS), see [Legal Evidence](/legal-evidence/). To obtain a certification document designed to support a Rule 902(13) self-authentication foundation, use `GET /v1/captures/{captureId}/certificate` or the "Download Certificate" button in the web UI -- see [Certified records](/legal-evidence/#rule-90213-certified-records).

---

<details>
<summary>Under the hood: how the trust model works</summary>

### Ed25519 signatures

When WRL completes a capture, it signs the WACZ bundle using an Ed25519 private key held by the operator. The signature covers the SHA-256 hash of the bundle manifest. Ed25519 is a modern elliptic-curve signing algorithm; the signature is 64 bytes and the public key is 32 bytes.

What a valid signature proves: the operator who holds the corresponding private key signed this exact bundle hash. If any byte of the bundle changes after signing, the signature will not verify.

What a valid signature does not prove: that the operator is trustworthy, that the captured page is accurate, or that the page has not since changed. The signature attests to the operator's action, not to the content's meaning.

The operator's current public key is available at `GET /.well-known/signing-key`. Third-party verifiers can fetch it independently rather than trusting the key embedded in the WACZ bundle itself.

### RFC 3161 timestamps

After signing the bundle, WRL submits the bundle hash to a third-party Timestamp Authority (TSA) -- currently DigiCert -- using the RFC 3161 protocol. The TSA records the hash along with the current time and signs the result with its own certificate.

What this timestamp proves: DigiCert observed this exact bundle hash at this specific time. Because the timestamp is bound to the hash, it cannot be transferred to a different bundle. Because DigiCert signed the timestamp, it cannot be forged without DigiCert's private key.

Why this matters: a capture signed only by the operator could theoretically be backdated -- the operator controls the clock. An RFC 3161 timestamp from an independent TSA removes that possibility. A third party (DigiCert) independently confirms when the bundle hash existed.

The TSA identity and the raw timestamp are embedded in the WACZ bundle's `datapackage-digest.json`. The CLI performs full CMS/PKCS#7 certificate chain validation to confirm the TSA certificate is legitimate.

### WACZ bundle structure

A WRL WACZ bundle is a ZIP archive containing:

```
datapackage.json           Manifest: file list with SHA-256 hashes for each artifact
datapackage-digest.json    Signing metadata: bundle hash, Ed25519 signature, RFC 3161 timestamp
pages/pages.jsonl          Page records
archive/                   WARC file(s) containing the captured content
```

The hash chain works bottom-up: each artifact file is hashed individually and recorded in `datapackage.json`. The canonical JSON of `datapackage.json` is then hashed to produce the bundle hash. The bundle hash is what gets signed and timestamped. Verification runs the chain in reverse: verify individual files against the manifest, verify the manifest hash, verify the signature over the manifest hash, verify the timestamp over the same hash.

### Key rotation

Old captures continue to verify after the operator rotates signing keys. Each capture records which key signed it. The key archive at `GET /.well-known/signing-keys` lists all historical public keys. During verification, the correct historical key is looked up automatically -- you do not need to manage this yourself.

Rotating the signing key does not break existing captures or existing verification links.

</details>
