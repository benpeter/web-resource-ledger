# Meta-Plan: RFC 3161 Timestamp Integration (R11)

## Task Summary

Integrate RFC 3161 timestamping into the WACZ signing pipeline so that every
capture includes an independent, third-party temporal proof from a TSA (Time
Stamping Authority). This upgrades WRL's evidence claims from operator-asserted
to independently verifiable. The current flat `signedData` object in
`datapackage-digest.json` must be extended to a `signatures` array supporting
multiple signature types (`self` + `rfc3161`). Verification must validate both
signatures. The verification HTML page must show the timestamp status.

## Scope

**In scope**: TSA integration module (HTTP-based RFC 3161 client), ASN.1
parsing of TSA responses, `datapackage-digest.json` format migration
(`signedData` -> `signatures` array), updated WACZ assembly, updated
verification pipeline (4th check: `timestamp`), updated verification page
UI, TSA provider selection (DigiCert or GlobalSign), graceful degradation
when TSA is unreachable, comprehensive tests.

**Out of scope**: eIDAS Qualified TSA, multiple TSA redundancy, WACZ-Auth
full spec compliance, KV data migration of existing captures.

## Planning Consultations

### Consultation 1: RFC 3161 Protocol and ASN.1 Parsing in Cloudflare Workers

- **Agent**: security-minion
- **Planning question**: What are the security implications of implementing RFC 3161 timestamp verification in a Cloudflare Workers environment? Specifically: (1) Which TSA providers (DigiCert, GlobalSign, FreeTSA) have HTTP-based RFC 3161 endpoints that work with Workers `fetch()` (no TLS client certs required)? (2) What ASN.1 parsing approach works in Workers without native Node.js modules -- can we use a pure-JS DER parser like `@lapo/asn1js` or `asn1.js`, or should we implement minimal DER parsing for the specific TSA response fields we need? (3) What certificate chain validation is required for the TSA response, and is it feasible in Workers (no `node:tls`, no OpenSSL)? (4) What are the attack vectors -- can a malicious TSA response be crafted to bypass verification? (5) How should the TSA URL be configured (env var vs. hardcoded)?
- **Context to provide**: `src/signing.js` (current Ed25519 approach), `src/wacz.js` (where timestamp request will be inserted), `wrangler.toml` (runtime: nodejs_compat, no native modules), `package.json` (minimal deps: fflate, @cloudflare/playwright)
- **Why this agent**: RFC 3161 is a cryptographic protocol with security-critical parsing. TSA certificate validation, ASN.1 attack surface, and the trust model (moving from self-signed to third-party verification) all have security implications that must be addressed before implementation.

### Consultation 2: Data Format Migration and Verification Pipeline Design

- **Agent**: api-design-minion
- **Planning question**: How should the `datapackage-digest.json` format evolve from the current flat `signedData` object to a `signatures` array that supports both `type: "self"` (Ed25519) and `type: "rfc3161"` (TSA timestamp)? Specifically: (1) What should the signatures array schema look like -- should each entry have a `type` discriminator plus type-specific fields, or should all entries share a common shape? (2) How should the verification API response change -- should the `checks` array gain a 4th entry (`timestamp`) or should each signature type get its own check? (3) Should the existing `signing` field in the verify response be restructured to accommodate multiple signatures? (4) What backward compatibility concerns exist for existing WACZ files that have the old flat format -- should `verify.js` handle both? (5) Is there an OpenAPI spec that needs updating?
- **Context to provide**: Current `datapackage-digest.json` structure from `src/wacz.js` lines 98-114, current verification response shape from `src/index.js` `handleVerifyCapture()`, current `verifyWacz()` function in `src/verify.js`, OpenAPI spec if it exists
- **Why this agent**: The format migration affects the API contract (verification endpoint response shape), the WACZ archive format, and backward compatibility. This needs deliberate API design to avoid breaking existing consumers.

### Consultation 3: Capture Pipeline Latency and Graceful Degradation

- **Agent**: iac-minion
- **Planning question**: The capture pipeline runs in `ctx.waitUntil()` with a ~30s budget. Adding an HTTP round-trip to an external TSA adds latency and a new failure mode. (1) What latency should we expect from DigiCert/GlobalSign TSA endpoints from Cloudflare edge? (2) Should the TSA request run concurrently with R2 upload, or sequentially after signing? (3) What timeout should the TSA fetch use -- and how does it interact with the existing 25s NAV_TIMEOUT_MS and partial capture budget? (4) If the TSA is unreachable or slow, the capture should still succeed with `timestamp: absent` -- what's the cleanest way to implement this given the current `buildWacz()` -> `completeCapture()` flow? (5) Should the TSA URL be configured as an env var or a wrangler.toml var?
- **Context to provide**: `src/capture.js` (full pipeline with timing budget), `src/wacz.js` (buildWacz flow), `wrangler.toml` (env vars pattern)
- **Why this agent**: Infrastructure concerns: Worker execution limits, external service latency, env configuration patterns, failure modes in a serverless context.

### Consultation 4: ASN.1 Dependency Selection and Implementation Strategy

- **Agent**: margo
- **Planning question**: RFC 3161 requires DER-encoding a TimeStampReq and parsing a TimeStampResp, both ASN.1 structures. Options range from full ASN.1 libraries (asn1.js, @lapo/asn1js, asn1-ts) to hand-rolling minimal DER encode/decode for just the two structures we need. (1) Which approach best fits the project's KISS/lean philosophy -- a general-purpose ASN.1 library (more dependencies, more capability than needed) or a focused, hand-rolled DER codec for RFC 3161 specifics? (2) The project currently has only 2 runtime dependencies (fflate, @cloudflare/playwright). How much weight should we put on keeping that count low vs. using a battle-tested library? (3) Is there a middle path -- a tiny, focused library that does just RFC 3161? (4) What's the YAGNI assessment: do we need full ASN.1 now, or can we start with the minimum viable DER encoder/decoder for TimeStampReq/Resp?
- **Context to provide**: `package.json` (current deps), project's engineering philosophy from CLAUDE.md (YAGNI, KISS, lean), the specific ASN.1 structures needed (TimeStampReq: hash algorithm OID + hash value; TimeStampResp: status + TimeStampToken containing the signed timestamp)
- **Why this agent**: Margo's YAGNI/KISS guardianship is critical here. ASN.1 is a rabbit hole -- the project could easily over-engineer this with a full ASN.1 toolkit when a minimal, focused codec would suffice.

### Consultation 5: Verification Page UX for Timestamp Display

- **Agent**: frontend-minion
- **Planning question**: The verification page (`src/verify-page.js`) currently shows 3 checks (file integrity, bundle integrity, digital signature). Adding RFC 3161 timestamp adds a 4th check. (1) How should the timestamp check be displayed -- same visual treatment as existing checks, or should it be visually distinguished as "independent verification" vs. "operator verification"? (2) The cryptographic details section currently shows bundle hash, signed-at, and public key. Should it be extended with TSA name, TSA certificate info, timestamp value? (3) If the timestamp is absent (graceful degradation), how should this be communicated to the user -- a "skip" status check, a separate section, or a note under the existing checks? (4) Should there be a visual indicator in the status banner distinguishing "verified with independent timestamp" from "verified (operator signature only)"?
- **Context to provide**: `src/verify-page.js` (full HTML/CSS/JS of the current verification page), the check rendering logic, the cryptographic details section
- **Why this agent**: The verification page is vanilla JS with carefully crafted HTML/CSS. Adding a 4th check and potentially restructuring the crypto details section needs frontend expertise for the specific patterns already in use.

## Cross-Cutting Checklist

- **Testing**: INCLUDE test-minion for planning. RFC 3161 adds a new external dependency (TSA HTTP endpoint) and ASN.1 parsing -- test strategy needs to cover: mocking TSA responses, testing DER encode/decode, testing graceful degradation, testing the 4th verification check, and ensuring backward compat with old WACZ format. The testing question: How should TSA responses be mocked in vitest/cloudflare:test? Should we embed real TSA response fixtures or generate synthetic DER?
- **Security**: INCLUDE -- covered as Consultation 1 (security-minion is the primary planner for TSA trust model, ASN.1 attack surface, and certificate chain validation).
- **Usability -- Strategy**: INCLUDE ux-strategy-minion. Planning question: The verification page currently communicates a binary verified/unverified state. RFC 3161 adds a third dimension: "verified with independent temporal proof" vs. "verified by operator only." How should this be communicated to non-technical users? Is the distinction meaningful to the target audience (journalists, researchers, legal professionals who need web evidence)? Should "operator signature only" (no timestamp) be presented as a warning or just a neutral absence?
- **Usability -- Design**: DEFER to execution. The UI changes (4th check row, crypto details extension) are incremental additions to an existing pattern. Frontend-minion covers the implementation-level design questions in Consultation 5.
- **Documentation**: INCLUDE software-docs-minion for planning. The `datapackage-digest.json` format change is an architectural change to the WACZ format. Planning question: What documentation artifacts need updating -- OpenAPI spec, ARCHITECTURE.md (if it exists), any format specification docs? Should the signatures array schema be formally documented as a format spec before implementation?
- **Observability**: DEFER to execution. The TSA fetch adds one new external call to monitor, but the existing Coralogix logging pattern (log levels, structured events) already covers the pattern. No architectural observability decisions needed at planning time.

## Anticipated Approval Gates

1. **TSA provider selection and ASN.1 approach** (MUST gate): Hard to reverse -- the DER codec and TSA-specific logic will be pervasive. High blast radius: every downstream task depends on which TSA and which ASN.1 approach is chosen. Security-minion + margo + iac-minion findings converge here.

2. **datapackage-digest.json format design** (MUST gate): Hard to reverse -- this is the WACZ archive format. Once captures are written with the new format, they must remain parseable. API contract change (verification response shape). Downstream: verification pipeline, verification page, and tests all depend on this decision.

3. **Verification page UI approach** (OPTIONAL gate): Easy to reverse (HTML/CSS changes). But if the distinction between "independently timestamped" and "operator-only" is user-visible, the UX decision has product implications.

## Rationale

The five planning consultations cover the critical domains:

- **security-minion** addresses the trust model shift (self-signed to third-party), ASN.1 parsing safety, and TSA provider vetting. This is the highest-risk domain -- getting the cryptographic protocol wrong undermines the entire feature.
- **api-design-minion** addresses the format migration, which is the architectural backbone. The `signatures` array design determines how verification works, how the API responds, and what backward compatibility looks like.
- **iac-minion** addresses the runtime constraints that are unique to Cloudflare Workers -- execution time limits, fetch behavior, env configuration. Without this input, the plan might assume capabilities the runtime doesn't have.
- **margo** provides YAGNI/KISS judgment on the ASN.1 approach -- the biggest risk of over-engineering in this feature.
- **frontend-minion** addresses the verification page changes, which are the user-visible surface of this feature.

Cross-cutting planning from **test-minion**, **ux-strategy-minion**, and **software-docs-minion** ensures the plan covers testing strategy, user communication, and documentation artifacts.

## External Skill Integration

No external skills detected in project.
