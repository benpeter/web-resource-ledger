# Process: CLI Verify Tool

## TL;DR

Six specialists planned, five reviewers assessed, four sequential tasks
executed. The team built a standalone `@wrl/verify` CLI tool with full
CMS/PKCS#7 certificate chain validation in ~2 hours of wall clock time.
Key conflict: security-minion won the PKIjs argument over devx-minion's
lightweight-only stance. 136 tests pass. One surprise: DigiCert TSA tokens
don't embed intermediate certificates, requiring future work for full
offline chain validation.

## What happened

### Phase 1: Meta-Plan

Nefario analyzed the task and selected 6 specialists: devx-minion (package
structure), security-minion (CMS chain validation), ux-strategy-minion (CLI
output design), api-design-minion (key resolution), test-minion (test
strategy), and software-docs-minion (documentation approach).

No external skills were discovered in the project.

### Phase 2: Specialist Planning (6 agents, parallel)

All six specialists were spawned in parallel with domain-specific planning
questions.

**devx-minion** argued for vendoring modules (no monorepo workspace), `fflate`
as the sole runtime dependency, and explicitly recommended against PKIjs due
to bundle size (~200-300KB). Proposed `node:crypto` for SHA-256 and
`crypto.subtle` for Ed25519.

**security-minion** argued PKIjs is the only viable option for CMS chain
validation. Evaluated node-forge (broken PKCS#7 verify), @peculiar/x509 (no
CMS support), and raw node:crypto (no chain walking). Flagged PKIjs issue #332
as a critical risk requiring validation. Recommended bundling DigiCert root
certs and deferring CRL/OCSP.

**ux-strategy-minion** argued against a `--verbose` flag (default shows
everything, `--json` for power users). Proposed splitting timestamp into two
checks (imprint + chain), exit codes 0/1/2, and a copy-pasteable verdict
sentence for legal/compliance use.

**api-design-minion** proposed `--origin` over `--key-url` for key resolution,
with automatic keyId matching from `/.well-known/signing-keys`. Required
explicit key source for local files with `--trust-embedded` as an escape hatch.

**test-minion** recommended `node:test` over vitest (zero dependencies,
matches CLI ethos). Proposed two-layer CMS testing: synthetic DER for unit
tests, one real TSA fixture for integration.

**software-docs-minion** recommended `--help` as primary reference, CLI gets
its own README (scoped to the CLI audience), and the JSON output format
should be treated as a contract from day one.

### Phase 3: Synthesis

Nefario synthesized all contributions into a 4-task sequential plan. Key
conflict resolutions:

1. **PKIjs vs. no CMS library**: security-minion won. The task explicitly
   requires full CMS chain validation -- hand-rolling would be thousands of
   lines of security-critical code. devx-minion's concern about bundle size
   was acknowledged but overruled.

2. **--verbose flag**: ux-strategy-minion won. No intermediate verbosity level.

3. **--origin vs. --key-url**: api-design-minion won. More user-friendly.

4. **Test runner**: test-minion won. `node:test` for zero dependencies.

5. **5 checks vs. 4**: ux-strategy-minion won. Timestamp split is honest.

### Phase 3.5: Architecture Review (5 mandatory reviewers)

All five mandatory reviewers ran in parallel:

- **security-minion**: ADVISE (6 items) -- zip bomb timing, embedded-key trust
  disambiguation, HTTPS enforcement, response size limits, cert fingerprint
  verification, JSON field naming. All incorporated.

- **test-minion**: APPROVE -- noted key-resolver fetch paths lack unit tests
  and macOS glob quoting risk.

- **ux-strategy-minion**: APPROVE -- plan is coherent, skip status serves
  two causes (noted for future monitoring).

- **lucy**: ADVISE (4 items) -- evolution log timing, backlog update,
  webcrypto import snippet could mislead, verifiedAt determinism. Process
  items addressed.

- **margo**: ADVISE (5 items) -- trust store scanner is mild YAGNI, verifiedAt
  may be speculative. None blocking.

No discretionary reviewers selected (CLI tool, no UI/web/runtime).

### Phase 4: Execution (4 sequential tasks)

All approval gates skipped per user instruction.

**Task 1 (devx-minion)**: Scaffolded `packages/verify/` with vendored modules,
package.json with pinned PKIjs, bundled DigiCert root cert with fingerprint
verification. All imports resolve cleanly.

**Task 2 (security-minion)**: Implemented `cms-verify.js` with full RFC 3161
Section 2.4.2 compliance. PKIjs crypto engine configured with Node.js built-in
WebCrypto. Added `timingSafeEqual` for messageImprint comparison. The PKIjs
#332 guard test (empty trustedRoots must fail) passes correctly.

**Task 3 (devx-minion)**: Built the complete CLI interface with manual arg
parsing, three key trust levels, ANSI color output, JSON schema, and exit
codes. HTTPS-only enforcement on origin URLs. Response size guards on fetches.

**Task 4 (test-minion)**: 136 tests using `node:test`. Real DigiCert TSA
fixture obtained from production capture. Discovered that DigiCert tokens
don't embed intermediate certificates -- CMS chain validation reports the
specific gap rather than claiming success.

**Post-execution fix**: vitest.config.js updated to exclude `packages/` from
Worker test discovery (the CLI uses `node:test`, not vitest).

### Post-Execution Verification

- Worker tests: 503 passed (23 test files)
- CLI tests: 136 passed (7 test files)
- Smoke tests: `--help`, `--version`, error handling all correct
- Code review: security advisories incorporated during execution
- Documentation: `--help` text is comprehensive, README deferred

## Where to read more

- Meta-plan: `docs/history/nefario-reports/` (companion directory)
- Specialist contributions: scratch files (copied to companion directory)
- Synthesis with conflict resolutions: companion `phase3-synthesis.md`
- Architecture review verdicts: companion `phase3.5-*.md` files
