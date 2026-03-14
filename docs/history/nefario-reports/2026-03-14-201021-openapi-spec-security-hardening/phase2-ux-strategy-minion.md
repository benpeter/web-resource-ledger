# UX Strategy Minion -- Planning Contribution

## Summary

The `.well-known/signing-key` endpoint serves a narrow but critical user
journey: independent verification. The current verification page does the
right thing by verifying against the server's own key, but offers no path
for a skeptical verifier to obtain the public key and check the math
themselves. The signing-key endpoint closes that gap. The key UX question
is not whether to build it -- it is how to make the verification page
self-contained for casual users while also serving the independent
verification audience without cluttering the primary flow.

## Analysis

### Who are the users and what jobs are they hiring WRL for?

There are two distinct verification audiences with fundamentally different
jobs:

**1. Casual verifier (primary, ~90% of verification traffic)**
JTBD: "When someone sends me a WRL verification link, I want to see whether
the capture is authentic, so I can trust the evidence."

This user lands on the verification page, sees the green/red banner, scans
the checks, and leaves. They will never visit `/.well-known/signing-key`.
They do not know what Ed25519 is. The verification page already serves this
user well -- the status banner, check list, and progressive disclosure of
cryptographic details are a textbook application of progressive disclosure.

**2. Technical verifier (secondary, power user)**
JTBD: "When I need to independently verify a WRL capture outside the
service's own verification endpoint, I want to obtain the public key and
check the signature myself, so I don't have to trust the service's
self-assessment."

This user is a developer, security auditor, legal tech professional, or
archival specialist. They want to download the WACZ, fetch the public key,
and run verification in their own environment. They are comfortable with
command-line tools and JSON responses. They need the key to be
machine-readable and discoverable at a stable URL.

### Is `.well-known` discoverable enough?

**Yes, for the technical verifier audience.** The `.well-known` path is an
IANA-registered convention (RFC 8615) that technical users know to look for.
It signals "this is a machine-readable, stable metadata endpoint" -- exactly
the right affordance for developers and automated tools. Inventing a custom
path would violate consistency heuristics and make the key harder to find
for the people who actually need it.

**No, for the casual verifier -- but they don't need it.** A casual user
will never type `/.well-known/signing-key` into a browser. They should not
need to. The verification page should stand on its own for this audience.

### Should the signing key be linked from the verification page?

**Yes, but only within the progressive-disclosure "Cryptographic details"
section.** Here is the reasoning:

1. The verification page already has a `<details>` element labeled
   "Cryptographic details" that shows bundle hash and signed-at timestamp.
   This is the natural home for a "Public key" row with a link to the
   `.well-known` endpoint. It serves the technical verifier who is
   exploring the page before switching to CLI tools.

2. Placing the link in the collapsed details section means casual users
   never see it (zero cognitive load impact on the primary audience), while
   technical users who expand the section find exactly what they need next.
   This is progressive disclosure working as designed.

3. Do NOT put the key link in the status banner, checks section, or any
   always-visible area. It would violate the principle that irrelevant
   information diminishes relevant information (Nielsen heuristic #8).

### Should the signing key be included in API responses?

**Include the `.well-known` URL in the verification JSON response and the
capture retrieval response.** Specifically:

- In the `GET /v1/verify/{captureId}` JSON response: add a
  `signingKeyUrl` field. This creates a self-contained verification payload
  -- a technical consumer of the JSON API can follow the link without
  guessing path conventions.

- In the `GET /v1/captures/{captureId}` JSON response: the `verifyUrl`
  field already exists. Adding `signingKeyUrl` alongside it completes the
  chain: capture -> verification -> independent verification.

- Do NOT embed the raw public key bytes in every API response. The key
  is already embedded in each WACZ bundle (in `datapackage-digest.json`).
  Adding it to the API response would be redundant, increase payload size,
  and create a third source of truth. A URL reference is sufficient and
  follows the principle of a single authoritative location.

### How does key rotation affect the verification UX?

This is the most significant UX risk in the current design. Let me map the
user journey through a key rotation event:

**Current state (pre-rotation):**
1. User visits verification page for capture signed with Key A
2. Server verifies with Key A (the current key) -- pass
3. All good

**After rotation to Key B:**
1. User visits verification page for old capture signed with Key A
2. Server verifies with Key B (the current key) -- FAIL
3. User sees red "Verification Failed" banner
4. The "Digital signature" check fails with "Ed25519 signature
   verification failed"
5. User has no idea why. The capture was legitimate. Trust is destroyed.

This is a catastrophic UX failure (Nielsen severity 4). The system tells
the user the capture is unverified when it was legitimately signed -- a
false negative that directly contradicts the product's core value
proposition.

**Required mitigations (in priority order):**

1. **Key ID in verification responses** (must-have for rotation).
   The verification JSON response should include which key ID was used to
   sign and which key ID the server is currently checking against. When
   these differ, the failure detail should say something like "Signed with
   a previous key that is no longer active" rather than the generic
   "Ed25519 signature verification failed." This transforms an opaque
   failure into an explainable one.

2. **Verification page: explain key-mismatch failures gracefully.**
   When the signature check fails and the WACZ contains a public key that
   differs from the server's current key, the verification page should show
   a distinct state -- not "Verification Failed" (which implies tampering)
   but something like "Signed with a previous key" with a clear explanation.
   This is a different emotional state: uncertainty is acceptable; false
   accusation of tampering is not.

3. **`/.well-known/signing-key` should return key metadata, not just
   raw bytes.** The response should include a key ID and a `created` or
   `activeFrom` timestamp. This lets technical verifiers determine whether
   a capture was signed before or after the current key became active.

4. **Key history endpoint or archive** (backlog item already exists as
   [should]). For full independent verification of old captures, the old
   public keys need to be retrievable. The `.well-known` endpoint could
   return a `previous` array or link to a key history endpoint. This is
   the backlog item "Old public key archive endpoint" -- it should be
   elevated to [must] if key rotation is documented as a supported
   operation.

**For this step specifically (Step 8 scope):** The signing-key endpoint
and README documentation of key rotation procedure are in scope. The full
key-mismatch UX is not. But the signing-key endpoint design should
anticipate rotation by including key metadata (key ID, creation date) in
the response schema from day one. Retrofitting it later means clients
built against the v1 response break.

### Signing-key endpoint response design recommendation

Return JSON (not raw bytes) at `GET /.well-known/signing-key`:

```json
{
  "algorithm": "Ed25519",
  "publicKey": "<base64-encoded 32-byte raw key>",
  "keyId": "<stable identifier, e.g. sha256 fingerprint of the key>",
  "createdAt": "2026-03-14T00:00:00.000Z"
}
```

Rationale:
- JSON is self-describing; raw bytes require out-of-band documentation
- `algorithm` makes the response parseable without prior knowledge
- `keyId` enables future rotation tracking
- `createdAt` lets verifiers reason about temporal validity
- `publicKey` in base64 matches the format already used in WACZ bundles
- Cache aggressively (`public, max-age=86400`) -- key changes are rare

### Verification page: specific recommendations

Add one row to the "Cryptographic details" `<details>` section:

```
PUBLIC KEY
[base64 key string]
Verify independently: /.well-known/signing-key
```

This follows the existing pattern (BUNDLE HASH, SIGNED AT) and adds
zero cognitive load to the casual verifier path since it is hidden behind
the disclosure toggle.

## Risks and Dependencies

| Risk | Severity | Mitigation |
|------|----------|------------|
| Key rotation produces false-negative verification results | Catastrophic | Design signing-key response with key ID from day one; document rotation as a breaking change for old captures until key history endpoint exists |
| `/.well-known` path not discoverable for casual users | Low | Not a real risk -- casual users use the verification page, not the key endpoint |
| Response format locks in without key metadata | Major | Include `keyId` and `createdAt` in v1 response even if rotation is not yet implemented -- costs nothing, prevents breaking change later |
| Signing-key endpoint reveals operational details | Low | Public key is already embedded in every WACZ bundle; the endpoint adds discoverability, not new information |

## Dependencies

- The signing-key endpoint depends on `getSigningKeys(env)` from
  `src/signing.js`, which already derives public key bytes from the
  private key. The endpoint needs the public key bytes base64-encoded
  and a key ID (suggest: first 8 chars of sha256 hex of the public key
  bytes, matching common key fingerprint patterns).

- Verification page changes depend on the signing-key endpoint existing
  and the response schema being finalized.

## Recommendations for Plan

1. **Design the `/.well-known/signing-key` JSON response with key metadata
   from the start.** Include `algorithm`, `publicKey`, `keyId`, and
   `createdAt`. The marginal cost is near zero; the cost of adding it
   later is a breaking change.

2. **Add a "Public key" row to the verification page's "Cryptographic
   details" section** that links to `/.well-known/signing-key`. Keep it
   inside the existing `<details>` element. Do not surface it in the
   primary verification flow.

3. **Add `signingKeyUrl` to the verification JSON response schema.**
   This makes the API self-documenting and creates a complete chain from
   verification result to independent verification capability.

4. **In the README key rotation section, explicitly warn that rotation
   invalidates verification of old captures** until a key history endpoint
   is built. This is an honest documentation choice -- do not paper over
   the limitation.

5. **Elevate the backlog item "Key versioning / key ID in signature
   entries" from [should] to [must]** in this step's backlog update. The
   signing-key endpoint creates the expectation that key rotation works
   gracefully; without key versioning, it doesn't.

## Out of Scope (but flagged)

- Key-mismatch UX on the verification page (requires key versioning in
  WACZ bundles -- future work)
- Key history / archive endpoint (backlog item, should be elevated)
- Multiple simultaneous active keys during rotation window (operational
  concern, not UX)

## Additional Specialists

No additional specialists needed beyond what is presumably already involved.
The security specialist should validate the key fingerprint approach and
confirm that exposing key metadata does not create new attack surface. The
API design specialist should ensure `signingKeyUrl` fits the existing
response schema conventions.
