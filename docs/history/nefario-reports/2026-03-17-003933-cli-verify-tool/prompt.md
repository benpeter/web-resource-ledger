**Outcome**: Anyone can independently verify the integrity and authenticity of a WRL capture — including the TSA's cryptographic signature — without installing software, closing the verification gap where the Worker can only check hash matches but not the CMS signature chain.

**Success criteria**:
- `npx @wrl/verify capture.wacz` runs without prior installation and produces a clear pass/fail report
- `npx @wrl/verify https://wrl.benpeter.workers.dev/v1/verify/cap_xxx` fetches and verifies a remote capture
- RFC 3161 CMS/PKCS#7 signature verified against TSA certificate chain up to trusted root
- Ed25519 bundle signature verified against operator's published signing key
- All artifact SHA-256 hashes verified against datapackage.json
- Human-readable output by default with `--json` flag for machine-readable output
- Exit code 0 on full verification pass, non-zero on any failure

**Scope**:
- In: WACZ extraction, datapackage-digest.json parsing, CMS signature verification, X.509 chain validation, Ed25519 signature verification, artifact hash verification, CLI with human and JSON output
- Out: Capture creation, Worker-side changes, browser-based verification UI, publishing to npm (deferred to a separate task)

**Constraints**:
- Node.js (npx-runnable, zero-install)
- Must work with current WACZ v0.2.0 format (signedData.signatures array with type:"self" and type:"rfc3161")

---
Additional context: skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement. IMPORTANT: other worktrees may be running in parallel -- pick the next available evolution sequence number (check docs/evolution/ for existing entries) and use the slug provided below. Evolution slug: cli-verify-tool.
