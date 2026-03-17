# Meta-Plan: CLI Verify Tool (`@wrl/verify`)

## Task Summary

Build a standalone CLI npm package (`@wrl/verify`) that provides independent,
offline-capable cryptographic verification of WRL WACZ captures. This closes the
verification gap where the Worker can only check hash matches and messageImprint
but cannot validate the full CMS/PKCS#7 certificate chain from the TSA.

The package must be npx-runnable with zero install, accept both local `.wacz`
files and remote capture URLs, and produce human-readable (default) or JSON
output with clear pass/fail exit codes.

## Planning Consultations

### Consultation 1: Package Structure and Code Reuse Strategy

- **Agent**: devx-minion
- **Planning question**: How should we structure the `@wrl/verify` CLI package
  to maximize reuse of the existing Worker verification logic (`src/verify.js`,
  `src/signing.js`, `src/rfc3161.js`, `src/canonical-json.js`) while keeping
  the CLI package independently publishable via npx? Specific concerns:
  - The Worker code uses `fflate` for ZIP and `node:crypto` for Ed25519 -- both
    work in Node.js. But `sha256` is imported from `src/warc.js` which uses
    `crypto.subtle` (Web Crypto). Should we shim or re-implement for Node?
  - Should shared code live in a shared package (monorepo workspace) or should
    the CLI copy/vendor the needed modules?
  - The CLI needs `fflate` (ZIP extraction) and something for CMS/X.509
    verification. What's the minimal dependency footprint for npx zero-install?
  - How should the CLI handle the `bin` entry, shebang, and ESM modules for
    npx execution?
- **Context to provide**: `package.json` (root), `src/verify.js`, `src/signing.js`,
  `src/rfc3161.js`, `src/canonical-json.js`, `src/warc.js` (for the `sha256`
  export), `vitest.config.js`
- **Why this agent**: CLI design and SDK packaging expertise. The npx zero-install
  requirement has specific constraints around package structure, bin entries, and
  dependency bundling that devx-minion specializes in.

### Consultation 2: CMS/PKCS#7 Chain Validation Approach

- **Agent**: security-minion
- **Planning question**: What is the correct approach for full RFC 3161
  CMS/PKCS#7 signature chain validation in a Node.js CLI tool? Specific concerns:
  - The existing `rfc3161.js` only verifies messageImprint (hash match) -- the
    CMS SignedData envelope is parsed but its cryptographic signature is NOT
    verified, and the TSA certificate chain is NOT validated against a trusted root.
  - Which Node.js library should handle CMS signature verification and X.509
    chain validation? Options: `node-forge`, `pkijs`, `@peculiar/x509`, raw
    `node:crypto` X509Certificate API (Node 15+). Evaluate: maturity, bundle
    size (matters for npx), maintenance status, API quality.
  - How should the trust anchor be handled? Bundle a root CA store? Use the
    system's trust store? Pin specific TSA root certs (currently DigiCert)?
  - What is the verification chain: TSA response -> CMS SignedData -> signer
    certificate -> intermediate(s) -> trusted root? What checks are mandatory
    (signature, validity period, key usage, extended key usage for timestamping)?
  - The existing DER parsing in `rfc3161.js` is purpose-built and minimal. Should
    the CLI extend this parser or use a full ASN.1 library?
- **Context to provide**: `src/rfc3161.js` (full file -- the DER parser and
  extractTSTInfo function), the `wrangler.toml` TSA_URL (`http://timestamp.digicert.com`),
  the backlog entry about CMS chain validation being deferred
- **Why this agent**: Security domain expertise on PKI, X.509, and CMS. The CMS
  chain validation is the core new capability and the hardest part to get right.
  Wrong choices here undermine the entire verification claim.

### Consultation 3: CLI Output Design and UX

- **Agent**: ux-strategy-minion
- **Planning question**: What should the human-readable CLI output look like for
  verification results? The tool needs to serve two audiences:
  - **Technical users** running `npx @wrl/verify capture.wacz` who want to
    understand exactly what was verified and what failed
  - **Non-technical users** (lawyers, journalists, compliance officers) who need
    a clear "this capture is authentic" or "this capture failed verification"
    signal
  - How should the 5 verification checks (artifact hashes, bundle hash,
    Ed25519 signature, CMS chain, messageImprint) be presented? All at once?
    Progressive disclosure?
  - What should the error output look like when verification fails? How much
    detail is appropriate?
  - Should there be a summary line that's copy-pasteable into a legal document
    or evidence report?
  - What's the right exit code strategy? (0 = pass, 1 = fail, 2 = error/usage?)
- **Context to provide**: The existing Worker verification result structure
  (from `src/verify.js`), the JSON output format from the `/v1/verify/` endpoint
  (from `src/index.js` handleVerifyCapture), the success criteria from the issue
- **Why this agent**: The CLI output is the user-facing deliverable. A
  cryptographically correct tool with confusing output defeats the purpose.
  UX strategy needs to evaluate the user journeys and cognitive load.

### Consultation 4: Ed25519 Public Key Resolution

- **Agent**: api-design-minion
- **Planning question**: How should the CLI resolve the operator's Ed25519
  public key for signature verification? The Worker exposes
  `/.well-known/signing-key` (current key) and `/.well-known/signing-keys`
  (all historical keys with keyId). Specific concerns:
  - For remote verification (`npx @wrl/verify https://.../v1/verify/cap_xxx`),
    the CLI fetches the WACZ from the Worker and can also fetch the signing key
    from the same origin. Should it always do this automatically?
  - For local verification (`npx @wrl/verify capture.wacz`), the WACZ embeds
    a `publicKey` and `keyId` in `datapackage-digest.json`, but the Worker's
    security model explicitly says "NEVER trust the embedded key." How should
    the CLI handle this tension? Options:
    - Require `--key` flag for local verification
    - Require `--origin` flag to fetch from `/.well-known/signing-key`
    - Trust embedded key with a warning
    - Use keyId to fetch from `/.well-known/signing-keys/{keyId}`
  - What's the right default behavior vs. opt-in flags?
- **Context to provide**: `src/index.js` (handleGetSigningKey, handleGetSigningKeys),
  `src/verify.js` security comment about embedded publicKey, the WACZ
  `datapackage-digest.json` structure from `src/wacz.js`
- **Why this agent**: This is an API interaction design question -- how the CLI
  interacts with the Worker's public API endpoints and handles trust boundaries.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The CLI needs its own test
  suite separate from the Worker's vitest+miniflare setup. Key questions:
  test runner choice (vitest without workers pool? plain node:test?), how to
  create test fixtures (real WACZ files with known-good/known-bad signatures),
  whether to test CMS chain validation against real TSA responses or synthetic
  DER fixtures.

- **Security**: ALWAYS include -- covered as Consultation 2 (primary planning
  role). CMS chain validation IS the security domain.

- **Usability -- Strategy**: ALWAYS include -- covered as Consultation 3.

- **Usability -- Design**: Exclude for planning. This is a CLI tool with text
  output, not a visual UI. UX strategy covers the output design.

- **Documentation**: Include software-docs-minion for planning. Questions:
  should the CLI package have its own README? How does it relate to the main
  repo README? Should the `--help` text be the primary documentation? The
  package will eventually be published to npm -- what metadata matters?

- **Observability**: Exclude for planning. The CLI runs locally on the user's
  machine. No runtime services, no logging infrastructure, no metrics. Verbose
  output (`-v` flag) is a UX concern, not observability.

### Anticipated Approval Gates

Given the user's instruction to "skip all approval gates -- defer decisions to
gru and lucy instead of halting for human input," no approval gates will be
presented during execution. Instead, gru and lucy will serve as the decision
authorities at points that would normally gate:

1. **CMS library selection** -- normally a MUST gate (hard to reverse, all
   downstream code depends on it). Will be delegated to security-minion's
   recommendation with gru evaluating the technology choice.
2. **Public key resolution strategy** -- normally a MUST gate (defines the
   trust model for local vs. remote verification). Will be delegated to
   api-design-minion's recommendation with lucy validating intent alignment.
3. **Package structure** -- normally OPTIONAL gate. Will be delegated to
   devx-minion's recommendation.

### Rationale

Four specialists are consulted for planning because this task spans four
distinct domains that each require expertise beyond what nefario can provide:

1. **devx-minion**: The npm package structure and npx execution model have
   non-obvious constraints. Code reuse from the Worker is complicated by
   runtime differences (Workers vs Node.js). This is devx-minion's core domain.

2. **security-minion**: CMS/PKCS#7 chain validation is the entire point of this
   tool -- the Worker explicitly defers it. Getting the cryptographic
   verification chain wrong means the tool provides false assurance, which is
   worse than no tool at all.

3. **ux-strategy-minion**: The CLI output serves non-technical users (lawyers,
   compliance) as well as developers. The output design needs journey thinking,
   not just "print the JSON."

4. **api-design-minion**: The key resolution strategy defines the trust model.
   How the CLI interacts with the Worker API for key fetching and WACZ
   retrieval is an API interaction design problem.

Additionally, test-minion and software-docs-minion are included via the
cross-cutting checklist for planning input on test strategy and documentation
approach.

### Scope

**In scope**:
- New npm package at `packages/verify/` (or similar) in the WRL monorepo
- CLI entry point runnable via `npx @wrl/verify`
- WACZ ZIP extraction and `datapackage.json` / `datapackage-digest.json` parsing
- SHA-256 artifact hash verification against `datapackage.json`
- Bundle hash verification (canonical JSON of datapackage)
- Ed25519 signature verification against operator's signing key
- RFC 3161 CMS/PKCS#7 full chain validation (NEW capability)
- MessageImprint verification (existing capability, ported)
- Public key fetching from `/.well-known/signing-key` and `/.well-known/signing-keys`
- Remote WACZ fetching from `/v1/captures/{id}/artifacts/wacz`
- Human-readable output (default) and `--json` flag
- Exit code 0 (pass) / non-zero (fail)
- Test suite for the CLI package
- Evolution log entry (0031-cli-verify-tool)

**Out of scope**:
- Changes to the Worker code
- Browser-based verification UI
- npm publishing (deferred per issue)
- Changes to the WACZ format or signing pipeline

### External Skill Integration

No external skills detected in project. The `.claude/skills/` and `.skills/`
directories do not exist in the project. User-global skills at `~/.claude/skills/`
are all despicable-agents agents (nefario, despicable-prompter, etc.) and do not
provide domain-specific skills relevant to this task.
