---
task: "MVP Step 2: URL Validation and SSRF Prevention"
date: 2026-03-13
slug: mvp-step-2-url-validation-ssrf-prevention
mode: execution
source-issue: 2
task-count: 3
gate-count: 1
compaction-events: 2
---

## Summary

Built a tested URL validation module (`src/url-validation.js`, 428 lines) that blocks SSRF bypass vectors for the Cloudflare Worker's Browser Rendering pipeline. The module implements a 9-step validation pipeline with 14 IPv4 and 8 IPv6 blocked ranges, WHATWG-delegated IPv4 parsing, and DNS pre-resolution with resolver injection. The test suite (`test/url-validation.test.js`, 472 lines, 108 tests) serves as the project's primary security catalog. All 118 tests pass (108 new + 10 existing). Two redirect-dependent acceptance criteria from Issue #2 are deferred to Step 3 (redirect orchestration).

## Original Prompt

GitHub Issue #2: MVP Step 2 -- URL Validation and SSRF Prevention

Build a tested URL validation module that blocks known SSRF bypass vectors before URLs are passed to Browser Rendering (headless Chromium). The module validates scheme, credentials, IP addresses (all encoding variants), DNS resolution, and double-encoding. Returns a result object with the validated URL and resolved IP, or a rejection with status and detail that plugs directly into the existing RFC 9457 error utility.

## Key Design Decisions

1. **Result object over throw** -- `{ok, url, ip}` or `{ok, status, detail}` instead of throwing ValidationError. Resolved IP structurally only available on success. Plugs into `problemResponse()` with zero transformation. 3-line caller integration. Conflict between security-minion (throw) and ux-strategy-minion (result object) resolved in favor of result object.

2. **WHATWG URL constructor for IPv4 parsing** -- `parseIPv4` delegates to `new URL('http://' + hostname).hostname` instead of a hand-rolled 40-60 line WHATWG IPv4 parser. 5 lines of code, eliminates the biggest bug surface area. Margo advisory proved correct.

3. **Single-URL validation, not redirect follower** -- Module validates one URL per call. Redirect orchestration deferred to Step 3. Browser Rendering follows its own redirects; our fetch chain would differ, creating false confidence.

4. **TOCTOU gap accepted** -- Browser Rendering re-resolves DNS independently. Returned IP is informational only. Chromium sandbox runs in Cloudflare's network-isolated infrastructure. YAGNI for MVP.

5. **BLOCKED_RANGES kept internal** -- Not exported. Tests validate via `isPrivateIP` behavior. No current consumer; exporting locks data structure as API contract.

6. **IPv4-mapped IPv6 hex-group handling** -- `::ffff:7f00:1` (hex-group form) handled by extracting low 32 bits from BigInt. WHATWG URL normalizes to this form, not dotted-decimal. Critical bypass vector caught by security-minion advisory.

## Phases

### Phase 1: Meta-Plan
Identified 5 specialists for planning: security-minion (SSRF threat model, IP classification), test-minion (test architecture, bypass vector catalog), ux-strategy-minion (API ergonomics, caller integration), edge-minion (Cloudflare Worker DNS, Browser Rendering constraints), software-docs-minion (evolution log structure).

### Phase 2: Specialist Planning
All 5 specialists contributed. Key consensus: result object API, DNS resolver injection for testability, WHATWG URL constructor for parsing, defense-in-depth blocklist beyond issue requirements. One conflict: throw vs result object (security-minion vs ux-strategy-minion).

### Phase 3: Synthesis
Produced 3-task plan with 1 approval gate. Resolved throw-vs-result-object conflict in favor of result object (4 reasons: structural safety, codebase convention, caller simplicity, Fetch API convention). Deferred redirect chain following to Step 3.

### Phase 3.5: Architecture Review
5 mandatory reviewers (security-minion, test-minion, ux-strategy-minion, lucy, margo). No discretionary reviewers selected (no UI, no web-facing runtime). Results: 0 APPROVE, 5 ADVISE, 0 BLOCK. 19 advisories incorporated across 3 tasks:
- [security] IPv4-mapped IPv6 hex-group bypass handling
- [security] Double-encoding check covers query string
- [security] IPv4 preference for returned IP with TOCTOU documentation
- [testing] 12 test suite enhancements (boundary tests, direct unit tests, expanded patterns)
- [compliance] Code signature `// tva`, deferred acceptance criteria documentation
- [complexity] URL constructor delegation for IPv4 parsing
- [scope] Evolution log prompt.md reflects actual phase scope

### Phase 4: Execution
3 tasks, 1 gate:
- **Task 1** (security-minion): Implemented `src/url-validation.js` (393 lines initially). Gate approved.
- **Task 2** (test-minion): Implemented `test/url-validation.test.js` (472 lines, 108 tests). Found and fixed a real bug: `parseIPv6ToBigInt` didn't handle dotted-decimal IPv4-mapped addresses (`parseInt('127.0.0.1', 16)` truncates at the dot).
- **Task 3** (software-docs-minion): Created evolution log `docs/evolution/0003-url-validation/` with prompt.md, decisions.md, outcome.md. Updated README.md index.

## Decisions

### Gate 1: URL Validation Module API Contract
- **Decision**: Approve the 9-step validation pipeline, result object API, and IP blocklist
- **Rationale**: WHATWG-delegated IPv4 parser (5 lines vs 60), hex-group IPv4-mapped IPv6 handling, dual-form double-encoding check. All 6 advisories addressed.
- **Rejected alternatives**: Hand-rolled WHATWG IPv4 parser (too complex), exported BLOCKED_RANGES (YAGNI)
- **Confidence**: HIGH

## Execution

| Task | Agent | Status | Deliverable |
|------|-------|--------|-------------|
| 1. URL validation module | security-minion | Complete | `src/url-validation.js` (+428 lines) |
| 2. Test suite | test-minion | Complete | `test/url-validation.test.js` (+472 lines, 108 tests) |
| 3. Evolution log | software-docs-minion | Complete | `docs/evolution/0003-url-validation/` (3 files + README update) |

## Verification

- **Phase 5 (Code Review)**: 2 APPROVE (code-review-minion, margo), 1 ADVISE (lucy). 2 findings auto-fixed: parseIPv4 credential-bearing hostname guard, dead code removal. Lucy noted missing process.md (expected — written after PR per workflow).
- **Phase 6 (Tests)**: 118/118 pass (108 new + 10 existing). 3 test files, 3.3s duration.
- **Phase 8 (Docs)**: Skipped (no new API endpoints, user-facing features, or breaking changes triggering checklist items).

Verification: code review passed (2 findings auto-fixed), tests passed (118/118).

## Test Plan

- [x] `npx vitest run` -- 118/118 tests pass
- [x] IPv4 obfuscation: hex, octal, decimal, mixed, shorthand, bare zero -- all blocked
- [x] IPv6 private ranges: loopback, ULA, link-local, multicast, IPv4-mapped (both forms) -- all blocked
- [x] IPv4-mapped IPv6 hex-group bypass (`::ffff:7f00:1`) -- blocked
- [x] DNS resolution: private IPs blocked, partial failure handled, empty results rejected
- [x] Double-encoding: path and query string checked, null byte and traversal patterns caught
- [x] Error message safety: no IP addresses leaked in rejection details
- [x] Blocklist completeness: first and last address of all 14 IPv4 and 8 IPv6 ranges tested
- [x] Scheme allowlist: 11 blocked schemes tested including gopher: and ldap:
- [x] Embedded credentials: username-only and username+password rejected

## Agent Contributions

### Planning (Phase 2)

| Agent | Role | Key Contribution |
|-------|------|-----------------|
| security-minion | SSRF threat model | IPv4 encoding variants, IPv6 bypass vectors, DNS rebinding analysis |
| test-minion | Test architecture | Security catalog structure, parameterized test patterns |
| ux-strategy-minion | API ergonomics | Result object design, caller integration simplicity |
| edge-minion | Worker constraints | DNS resolver availability, Browser Rendering TOCTOU analysis |
| software-docs-minion | Evolution log | Phase structure, deferred scope documentation |

### Review (Phase 3.5)

| Agent | Verdict | Key Findings |
|-------|---------|-------------|
| security-minion | ADVISE | IPv4-mapped IPv6 hex-group bypass, double-encoding query string scope, IP return preference |
| test-minion | ADVISE | 7 test enhancements: boundary tests, direct unit tests, expanded patterns |
| ux-strategy-minion | ADVISE | prompt.md scope accuracy |
| lucy | ADVISE | Code signature, deferred acceptance criteria documentation |
| margo | ADVISE | URL constructor delegation, BLOCKED_RANGES not exported, test overlap reduction |

### Code Review (Phase 5)

| Agent | Verdict | Key Findings |
|-------|---------|-------------|
| code-review-minion | APPROVE | parseIPv4 credential guard (fixed), parseIPv6 non-:: path (low risk) |
| lucy | ADVISE | process.md reminder (expected per workflow) |
| margo | APPROVE | Dead code removal (fixed), clean module overall |

<details>
<summary>Session Resources</summary>

### Skills Invoked
- `/nefario` (orchestration)

### Compaction
2 compaction events (after Phase 3, after Phase 3.5).

</details>

<details>
<summary>Working Files</summary>

34 files in companion directory: `docs/history/nefario-reports/2026-03-13-155336-mvp-step-2-url-validation-ssrf-prevention/`

Phase 1: `phase1-metaplan-prompt.md`, `phase1-metaplan.md`
Phase 2: `phase2-{security,test,ux-strategy,edge,software-docs}-minion{-prompt,}.md`
Phase 3: `phase3-synthesis-prompt.md`, `phase3-synthesis.md`
Phase 3.5: `phase3.5-{security,test,ux-strategy}-minion{-prompt,}.md`, `phase3.5-{lucy,margo}{-prompt,}.md`
Phase 4: `phase4-{security,test,software-docs}-minion-prompt.md`
Phase 5: `phase5-{code-review-minion,lucy,margo}{-prompt,}.md`

</details>
