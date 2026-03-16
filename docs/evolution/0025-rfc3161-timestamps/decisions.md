# Decisions: RFC 3161 Timestamp Integration

## TSA Provider Selection

**Decision**: DigiCert (`https://timestamp.digicert.com`)

**Alternatives considered**:
- GlobalSign: equivalent capability, less market penetration
- FreeTSA: self-signed CA -- verifiers would need to manually trust it, undermining "independently verifiable"
- Custom TSA: over-engineering for the use case

**Rationale**: DigiCert chains to a universally trusted root CA, requires no TLS client certificates, responds in 50-200ms, and is the most widely used TSA in the industry. The HTTPS endpoint was chosen over HTTP per security-minion review (same endpoint, zero cost difference).

## ASN.1 Parsing Approach

**Decision**: Hand-rolled minimal DER codec in `src/rfc3161.js` (~545 lines)

**Alternatives considered**:
- `asn1.js` library: 8,000+ lines for two message types
- `@lapo/asn1js`: general-purpose, large surface area
- `asn1-ts`: TypeScript, not needed for this JS project

**Rationale**: RFC 3161 hasn't changed since 2004. TimeStampReq is nearly fixed bytes (only hash + nonce vary). TimeStampResp parsing is tag-based navigation of a known structure. Adding a general-purpose ASN.1 library would be the only "framework-style" dependency in a project with just 2 runtime dependencies. The hand-rolled codec matches the project's pattern of purpose-built modules (warc.js, cdxj.js, signing.js).

**Risk accepted**: DER parsing bugs in hand-rolled code. Mitigated with strict bounds checking, 64KB input cap, and 17 dedicated unit tests.

## Certificate Chain Validation Deferral

**Decision**: Do NOT verify the TSA's CMS cryptographic signature at verification time.

**Rationale**: Full X.509 chain validation requires `node:tls` or OpenSSL, neither available in Cloudflare Workers. The capture-time validations (status check, nonce match, messageImprint match) plus the raw token storage provide sufficient assurance for the MVP. Third-party verifiers with proper tooling can validate the full chain offline using the stored token.

**Future**: When offline verification tools are built (backlog item), they can implement full CMS signature verification against the TSA's certificate chain.

## Data Format Evolution (v0.1.0 → v0.2.0)

**Decision**: Keep `signedData` as the wrapper object, add `signatures` array inside it. Bump version to `0.2.0`.

**Alternatives considered**:
- Replace `signedData` entirely with `signatures` at the top level: more disruptive, breaks verification code that reads `digest.signedData.hash`
- Add a parallel `timestamps` field alongside `signedData`: violates the "signatures array" design from the original issue

**Rationale**: `hash`, `created`, `software`, `version` are shared metadata about the signing event. The `signatures` array holds individual cryptographic proofs. This is the least-disruption path -- verification code continues to read `digest.signedData.hash` without changing.

## Verification Check Count (3 vs 4)

**Decision**: Add a 4th check (`timestamp`) to the `checks` array.

**Conflict**: api-design-minion argued for keeping 3 checks and folding timestamp into an aggregate signature check. frontend-minion and ux-strategy-minion argued for a visible 4th check row.

**Resolution**: 4th check wins. The UX benefit (visible, independent verification status) outweighs the API stability concern. The check count was never a stable contract in a pre-1.0 API. The `verified` predicate changes from `every(pass)` to `every(pass || skip)` to tolerate absent timestamps.

## Verified Predicate with Skip Tolerance

**Decision**: `checks.every(c => c.status === 'pass' || c.status === 'skip')`

**Safety analysis**: The only `skip` reachable without a co-occurring `fail` is `timestamp: skip` (absent TSA entry on v0.2.0). All existing v0.1.0 `skip` paths (e.g., `artifactHashes: skip` when digest is missing) co-occur with other failing checks. Code review confirmed this.

## HTTP vs HTTPS for TSA URL

**Decision**: Default to HTTPS (`https://timestamp.digicert.com`).

**Conflict**: security-minion recommended HTTPS. iac-minion noted HTTP is industry-standard because TSA responses are self-authenticating (signed by the TSA's certificate).

**Resolution**: Use HTTPS by default since the endpoint supports it at no cost. Do not add HTTP/HTTPS validation or enforcement code -- YAGNI. The trust model is in the TSA signature, not the transport.

## Verification Page Label

**Decision**: "Independent time verification" with description "Time was recorded by an independent authority (not verified cryptographically)."

**Rationale**: Per security-minion review, the original "Confirms capture time was certified by an independent authority" overstates what the code does (messageImprint hash match only, no TSA signature verification). The parenthetical qualifier is honest about the limitation without undermining user confidence.
