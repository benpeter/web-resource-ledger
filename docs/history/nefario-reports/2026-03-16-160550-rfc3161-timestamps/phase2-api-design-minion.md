# API Design Contribution: RFC 3161 Timestamp Integration

## Summary

This document provides API design recommendations for evolving the `datapackage-digest.json` format and the verification API response to support RFC 3161 timestamps alongside the existing Ed25519 self-signatures.

---

## Recommendations

### 1. Signatures Array Schema: Discriminated Union with Type-Specific Fields

**Recommendation:** Use a `type` discriminator property with type-specific fields. Do NOT attempt a common-shape envelope that papers over the fundamental differences between a self-signature and a TSA timestamp token.

**Rationale:** The two signature types are structurally different. An Ed25519 self-signature has a `publicKey`, `keyId`, and `signature` (base64 of raw Ed25519 bytes). An RFC 3161 timestamp token is an opaque ASN.1 blob (`TimeStampToken`) plus a TSA identifier. Forcing both into a common shape would require nullable fields everywhere, which is worse than a clean discriminator. The discriminator pattern is also specifiable -- OpenAPI 3.1's `discriminator` keyword maps directly to this design, enabling typed SDK generation.

**Proposed `datapackage-digest.json` structure:**

```json
{
  "path": "datapackage.json",
  "hash": "sha256:...",
  "signedData": {
    "hash": "sha256:...",
    "created": "2026-03-16T10:00:00.000Z",
    "software": "WRL/0.2",
    "version": "0.2.0",
    "signatures": [
      {
        "type": "self",
        "signature": "base64...",
        "publicKey": "base64...",
        "keyId": "hex8chars"
      },
      {
        "type": "rfc3161",
        "token": "base64...",
        "tsa": "http://timestamp.digicert.com"
      }
    ]
  }
}
```

**Key design decisions:**

- **`signedData` stays as an object, not replaced.** The `hash`, `created`, `software`, `version` fields are common metadata about the signing event. The new `signatures` array lives inside `signedData`, holding the individual cryptographic proofs.
- **Existing flat fields (`signature`, `publicKey`, `keyId`) are removed** from `signedData` and moved into the `type: "self"` entry in the `signatures` array. This is a clean break -- see backward compatibility section below.
- **`type` is the discriminator.** Values: `"self"` (Ed25519 operator signature) and `"rfc3161"` (RFC 3161 TSA timestamp token).
- **`version` bumps to `"0.2.0"`.** This signals the new schema unambiguously. Verifiers can check `signedData.version` to decide which parsing path to use.

**Type-specific fields:**

| Field | `type: "self"` | `type: "rfc3161"` | Notes |
|-------|---------------|-------------------|-------|
| `signature` | Required, base64 Ed25519 | N/A | 64-byte Ed25519 signature |
| `publicKey` | Required, base64 | N/A | 32-byte raw key, informational only |
| `keyId` | Required, 8-char hex | N/A | SHA-256 fingerprint prefix |
| `token` | N/A | Required, base64 | ASN.1 DER TimeStampToken |
| `tsa` | N/A | Required, string | TSA endpoint URL for provenance |

**Why not a fully common shape?** A "common shape" approach would look like `{ type, data: "base64...", metadata: {} }` -- but this hides the semantics behind generic field names. SDK consumers would need to decode `data` differently depending on `type`, with no type system help. The discriminated union makes it obvious what each field is for, and OpenAPI `discriminator` generates type-safe variants automatically.

### 2. Verification API Response: Per-Signature Checks Within a Restructured `signing` Object

**Recommendation:** Do NOT add a flat 4th check called `timestamp`. Instead, restructure the `signing` object to report per-signature verification results.

**Rationale:** The existing three checks (`artifactHashes`, `bundleHash`, `signature`) map to three distinct verification steps. The `signature` check currently verifies the Ed25519 self-signature. With multiple signatures, the question is: what does the `signature` check mean? It should mean "all cryptographic proofs over the bundle hash verified." The per-signature detail belongs inside the `signing` section of the response, not as a top-level check that would break the existing check-count contract.

**Proposed verification response:**

```json
{
  "verified": true,
  "capture": {
    "id": "cap_abc123...",
    "createdAt": "2026-03-16T10:00:00.000Z",
    "completedAt": "2026-03-16T10:00:45.123Z",
    "renderQuality": "full"
  },
  "signing": {
    "bundleHash": "sha256:...",
    "signedAt": "2026-03-16T10:00:00.000Z",
    "signatures": [
      {
        "type": "self",
        "status": "pass",
        "publicKey": "base64...",
        "keyId": "hex8chars"
      },
      {
        "type": "rfc3161",
        "status": "pass",
        "tsa": "http://timestamp.digicert.com",
        "timestampedAt": "2026-03-16T10:00:01.000Z"
      }
    ]
  },
  "checks": [
    { "name": "artifactHashes", "status": "pass" },
    { "name": "bundleHash", "status": "pass" },
    { "name": "signature", "status": "pass" }
  ]
}
```

**Design rationale for this structure:**

1. **`checks` array stays at 3 entries.** The `signature` check is an aggregate -- it passes only when ALL entries in `signing.signatures` pass. This preserves the existing contract: consumers who check `result.checks.every(c => c.status === 'pass')` continue to work unchanged.

2. **`signing.signatures` provides the detail.** Each entry has a `type` and `status`, plus type-specific metadata. Failed entries include a `detail` string. This makes it clear which proof failed without inflating the top-level checks array.

3. **`signing.bundleHash` and `signing.signedAt` stay at the signing level** -- they are shared across all signature types (both the self-signature and the timestamp cover the same hash).

4. **`signing` remains nullable.** When the WACZ is missing from storage or the digest is absent, `signing: null` with all checks failed, just like today.

**Why not a 4th check?** Adding `{ "name": "timestamp", "status": "pass" }` creates several problems:
- Consumers that hard-code `checks.length === 3` break.
- The `verified` field's semantics change: does `verified: true` require the timestamp check to pass? If yes, old WACZ files without timestamps can never be `verified: true`. If no, you need a new field like `timestampVerified`.
- The check names become a list that grows with each new signature type. The discriminated union inside `signing.signatures` scales without changing the top-level contract.

### 3. Restructuring the `signing` Field

**Recommendation:** Evolve the `signing` field additively. Keep existing fields, add `signatures` array.

The current `signing` response object is:
```json
{
  "bundleHash": "sha256:...",
  "signature": "base64...",
  "publicKey": "base64...",
  "signedAt": "ISO8601"
}
```

The proposed evolution:
```json
{
  "bundleHash": "sha256:...",
  "signedAt": "ISO8601",
  "signature": "base64...",
  "publicKey": "base64...",
  "signatures": [
    { "type": "self", "status": "pass", "publicKey": "base64...", "keyId": "hex8" },
    { "type": "rfc3161", "status": "pass", "tsa": "http://...", "timestampedAt": "ISO8601" }
  ]
}
```

**The flat `signature` and `publicKey` fields are kept for backward compatibility** on the API response. They refer to the self-signature specifically. The `signatures` array provides the full picture. Consumers who only care about the self-signature continue to read the flat fields. Consumers who want timestamp details read `signatures`.

**Deprecation path:** The flat `signature` and `publicKey` fields in the verification response can be deprecated with a Sunset header after consumers have migrated to reading `signatures`. This is additive-first evolution.

### 4. Backward Compatibility Strategy

There are two distinct compatibility concerns:

**A. WACZ files on disk (the `datapackage-digest.json` format):**

Existing WACZ files use the flat `signedData` schema (version `0.1.0`). The verifier (`verify.js`) MUST handle both formats. Detection strategy:

1. Check for `signedData.version`. If `"0.1.0"` or absent, use legacy path (flat `signature`/`publicKey`/`keyId` on `signedData`).
2. If `"0.2.0"`, use new path (read `signedData.signatures` array).
3. Unknown versions: fail verification with a clear detail message ("Unsupported signedData version").

This is a simple version check, not a heuristic. The `version` field was wisely included in the original schema -- use it.

**Implementation in `verify.js`:**

```javascript
// Normalize: extract self-signature fields from either format
const version = signedData?.version ?? '0.1.0';
let selfSig, signatures;

if (version === '0.1.0') {
  // Legacy flat format
  selfSig = {
    signature: signedData?.signature,
    publicKey: signedData?.publicKey,
    keyId: signedData?.keyId,
  };
  signatures = [{ type: 'self', ...selfSig }];
} else if (version === '0.2.0') {
  // New array format
  signatures = signedData?.signatures ?? [];
  selfSig = signatures.find(s => s.type === 'self');
} else {
  // Unknown version -- fail
  checks.push({ name: 'signature', status: 'fail', detail: 'Unsupported signedData version' });
}
```

**B. API response backward compatibility:**

The verification API response (`GET /v1/verify/{captureId}`) evolves additively:
- `signing.bundleHash` and `signing.signedAt` remain.
- `signing.signature` and `signing.publicKey` remain (from the self-signature).
- `signing.signatures` is added (new array).
- `checks` array stays at 3 entries with the same names.
- `verified` semantics: `true` when ALL checks pass. The `signature` check passes when the self-signature verifies. RFC 3161 timestamp verification failures do NOT cause `verified: false` -- they cause `signing.signatures[n].status: "fail"` but do not block the aggregate. This keeps the existing verification contract intact.

**Why not gate `verified` on timestamp validity?** The RFC 3161 timestamp is supplementary evidence of time. The core trust chain is: artifact hashes -> bundle hash -> Ed25519 signature. The timestamp proves WHEN the signature was made, but the signature itself proves WHO signed. A failed timestamp means "we cannot prove the exact time" -- the signature is still valid. Mixing the two would make `verified` mean different things for old vs new WACZ files.

**Alternative (stricter):** If the project wants timestamp to be a hard requirement for `verified: true` on new WACZ files (version 0.2.0), add a `timestampRequired` boolean to the response and a 4th check. But I would strongly recommend starting with the soft model and upgrading later if needed. YAGNI.

### 5. OpenAPI Spec Updates

Yes, `openapi.yaml` (root of the project) must be updated. Specific changes:

**New/modified schemas in `components/schemas`:**

1. **`SignatureEntry`** -- discriminated union:
   ```yaml
   SignatureEntry:
     type: object
     required: [type]
     discriminator:
       propertyName: type
       mapping:
         self: '#/components/schemas/SelfSignature'
         rfc3161: '#/components/schemas/Rfc3161Signature'
     oneOf:
       - $ref: '#/components/schemas/SelfSignature'
       - $ref: '#/components/schemas/Rfc3161Signature'
   ```

2. **`SelfSignature`**:
   ```yaml
   SelfSignature:
     type: object
     required: [type, status]
     properties:
       type:
         type: string
         enum: [self]
       status:
         type: string
         enum: [pass, fail, skip]
       publicKey:
         type: [string, 'null']
       keyId:
         type: [string, 'null']
       detail:
         type: string
   ```

3. **`Rfc3161Signature`**:
   ```yaml
   Rfc3161Signature:
     type: object
     required: [type, status]
     properties:
       type:
         type: string
         enum: [rfc3161]
       status:
         type: string
         enum: [pass, fail, skip]
       tsa:
         type: [string, 'null']
       timestampedAt:
         type: [string, 'null']
         format: date-time
       detail:
         type: string
   ```

4. **`VerificationSigning`** -- add `signatures` array:
   ```yaml
   VerificationSigning:
     type: object
     required: [bundleHash, signature, publicKey, signedAt]
     properties:
       bundleHash:
         type: [string, 'null']
       signature:
         type: [string, 'null']
         deprecated: true
         description: >
           Base64-encoded Ed25519 signature. Deprecated: use signatures[].
       publicKey:
         type: [string, 'null']
         deprecated: true
       signedAt:
         type: [string, 'null']
       signatures:
         type: array
         items:
           $ref: '#/components/schemas/SignatureEntry'
   ```

5. **`VerificationCheck`** -- `name` enum unchanged (`artifactHashes`, `bundleHash`, `signature`). No 4th value added.

6. **Update examples** in the verify endpoint to include `signatures` array in the response.

**API version:** These changes are additive (new fields, no removed fields, no changed semantics for existing fields). No URL version bump is needed. The OpenAPI spec version should bump from `0.3.0` to `0.4.0` to reflect the schema additions.

---

## Proposed Tasks

### Task 1: Evolve `datapackage-digest.json` schema (wacz.js)

- Move `signature`, `publicKey`, `keyId` into a `signatures` array entry with `type: "self"`
- Bump `signedData.version` to `"0.2.0"`
- Add RFC 3161 token acquisition and embed as `type: "rfc3161"` entry
- Keep `hash`, `created`, `software` at the `signedData` level

### Task 2: Update verify.js for dual-format parsing

- Detect `signedData.version` to choose parsing path
- Version `0.1.0` (or absent): legacy flat format -- normalize to single-entry `signatures` array internally
- Version `0.2.0`: read `signedData.signatures` array
- Verify self-signature as before (from normalized array)
- Verify RFC 3161 token when present (new verification function)
- Aggregate results into `signing.signatures` response array

### Task 3: Update verification API response (index.js)

- Add `signing.signatures` array to the response body
- Keep flat `signing.signature`, `signing.publicKey` for backward compat
- The `signature` check in `checks` passes when the self-signature verifies
- RFC 3161 results are reported only via `signing.signatures[].status`

### Task 4: Update OpenAPI spec (openapi.yaml)

- Add `SignatureEntry`, `SelfSignature`, `Rfc3161Signature` schemas
- Add `signatures` array to `VerificationSigning`
- Mark flat `signature`/`publicKey` as deprecated
- Update response examples
- Bump spec version to `0.4.0`

### Task 5: Update tests

- `verify.test.js`: Add tests for v0.2.0 format parsing, backward compat with v0.1.0 format
- `verify.test.js`: Add tests for RFC 3161 token verification (mock TSA response)
- `wacz.test.js`: Verify new `signedData` structure with `signatures` array
- Integration tests: Verify end-to-end with both old and new format WACZ files

### Task 6: KV record schema update

- Store RFC 3161 token metadata in the KV capture record alongside existing `wacz.keyId` and `wacz.bundleHash`
- Add `wacz.tsaUrl` and `wacz.timestampedAt` fields for the verification endpoint to surface

---

## Risks and Concerns

### R1: RFC 3161 Token Size

RFC 3161 `TimeStampToken` is an ASN.1 DER structure that includes the TSA's certificate chain. Typical size: 2-5 KB base64-encoded. This increases `datapackage-digest.json` size but is well within ZIP and KV limits. No concern.

### R2: TSA Availability at Capture Time

The TSA is an external dependency. If the TSA is unreachable during `buildWacz()`, the capture must still succeed. The RFC 3161 entry should be omitted from the `signatures` array -- same graceful degradation pattern used for the signing key today. The `signatures` array may contain only `type: "self"` with no `type: "rfc3161"` entry.

**Risk level:** Medium. Mitigation: TSA timeout (2-3 seconds max), graceful skip, log the failure, capture completes with self-signature only.

### R3: TSA Token Verification Complexity

Verifying an RFC 3161 token requires ASN.1 parsing and X.509 certificate chain validation. On Cloudflare Workers, this means either:
- A pure-JS ASN.1 parser (e.g., `asn1js` + `pkijs`) -- adds non-trivial dependency weight
- A lighter approach: verify only the `messageImprint` hash matches the `bundleHash` and trust the token's structure (defer full chain validation to offline verifiers)

**Recommendation:** Start with message-imprint-only verification on the server. This proves the token covers the right hash. Full X.509 chain validation is a "consider" item for the parking lot -- it adds significant complexity for a trust assertion that third-party verifiers can make independently.

### R4: Discriminator and OpenAPI Tooling

OpenAPI 3.1's `discriminator` with `oneOf` is well-supported by modern code generators (openapi-generator 7+, Speakeasy, Stainless). Older tools may not handle it correctly. Since this project does not currently auto-generate SDKs, this is informational only.

### R5: Version Detection Robustness

The plan relies on `signedData.version` for format detection. The current schema always includes `version: "0.1.0"`. If there are any WACZ files in production without a `version` field (e.g., from a pre-version era), the verifier must treat missing `version` as `"0.1.0"`. The code in `wacz.js` has always included `version: '0.1.0'` since the initial implementation, so this risk is low.

### R6: Signature Check Semantics with Optional Timestamps

If RFC 3161 is optional (graceful skip when TSA is down), then the `signature` check in `checks` must not fail when the timestamp is simply absent. The check should only fail when a present timestamp fails verification. Clear semantics:
- No `rfc3161` entry in `signatures` array: `signature` check ignores timestamps entirely
- `rfc3161` entry present with valid token: `signing.signatures[1].status: "pass"`
- `rfc3161` entry present with invalid token: `signing.signatures[1].status: "fail"` AND `signature` check status: `"fail"`

This keeps `verified: true` achievable for WACZ files without timestamps, but ensures that a corrupt timestamp token causes verification failure.

---

## Additional Agents Needed

### security-minion

- Review the trust model: should a failed RFC 3161 timestamp cause `verified: false`? The API design recommendation is "no" (soft model), but security may disagree for evidence-grade claims.
- Evaluate TSA certificate pinning strategy -- should the server pin specific TSA certificates, or trust the TSA's published root?
- Review the message-imprint-only verification shortcut (R3) -- is it sufficient for the security model, or does full chain validation need to ship in v1?

### edge-minion / iac-minion

- Evaluate Cloudflare Workers constraints for ASN.1 parsing libraries (bundle size limits, crypto API availability)
- TSA outbound HTTP call from Workers -- are there egress restrictions?
- Evaluate whether TSA calls need to go through a Cloudflare Worker subrequest or can use `fetch()` directly

### data-minion

- Validate the KV record schema extension (`wacz.tsaUrl`, `wacz.timestampedAt`) against KV value size limits
- Determine if the RFC 3161 token itself needs to be stored in KV or only in the WACZ (the WACZ is in R2, the KV record is metadata-only)

### api-spec-minion

- Author the full OpenAPI spec changes based on the schemas and discriminator patterns described above
- Validate the `discriminator` + `oneOf` pattern works with the project's spec validation tooling
