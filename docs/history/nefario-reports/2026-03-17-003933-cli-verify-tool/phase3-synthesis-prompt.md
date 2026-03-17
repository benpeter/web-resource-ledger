MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Build a standalone CLI npm package (`@wrl/verify`) that provides independent, offline-capable cryptographic verification of WRL WACZ captures, including full CMS/PKCS#7 certificate chain validation for RFC 3161 timestamps.

Success criteria:
- `npx @wrl/verify capture.wacz` runs without prior installation and produces a clear pass/fail report
- `npx @wrl/verify https://wrl.benpeter.workers.dev/v1/verify/cap_xxx` fetches and verifies a remote capture
- RFC 3161 CMS/PKCS#7 signature verified against TSA certificate chain up to trusted root
- Ed25519 bundle signature verified against operator's published signing key
- All artifact SHA-256 hashes verified against datapackage.json
- Human-readable output by default with `--json` flag for machine-readable output
- Exit code 0 on full verification pass, non-zero on any failure

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-software-docs-minion.md

## Key consensus across specialists:

- devx-minion: Vendor verification modules (no monorepo). fflate sole runtime dep. node:crypto for SHA-256, crypto.subtle for Ed25519. ESM + bin entry with shebang.
- security-minion: PKIjs for CMS chain validation. Bundle DigiCert root certs. Keep existing DER parser for field extraction. Validate PKIjs issue #332.
- ux-strategy-minion: No --verbose. Exit codes 0/1/2. --json stdout, human stderr. Verdict sentence copy-pasteable. Skip handling explicit.
- api-design-minion: Remote auto key resolution. Local requires --origin/--key/--key-file. --trust-embedded escape hatch. Trust basis always visible.
- test-minion: node:test runner. Generate fixtures in setup. One committed real TSA fixture. Two-layer CMS testing.
- software-docs-minion: CLI gets own README. --help is primary reference. JSON output is contract from day one.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. The package should be placed at `packages/verify/` in the repo
7. All approval gates should be SKIPPED per user instruction -- defer decisions to gru and lucy instead
8. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase3-synthesis.md
