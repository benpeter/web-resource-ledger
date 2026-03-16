# Lucy Review: cli-verify Delegation Plan

## Verdict: ADVISE

The plan aligns well with the user's stated intent and project conventions. Four items warrant attention before execution; none are blocking.

---

## Requirements Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|---|---|---|
| `npx @wrl/verify capture.wacz` runs without prior install | Task 1 (scaffold, package.json with bin), Task 3 (CLI) | Covered |
| `npx @wrl/verify https://wrl.../v1/verify/cap_xxx` fetches and verifies remote | Task 3 (cli.js remote URL handling, key-resolver.js) | Covered |
| RFC 3161 CMS/PKCS#7 signature verified against TSA cert chain | Task 2 (cms-verify.js) | Covered |
| Ed25519 bundle signature verified against operator key | Task 1 (vendored signing.js) | Covered |
| All artifact SHA-256 hashes verified | Task 1 (vendored verify.js) | Covered |
| Human-readable output, `--json` flag | Task 3 (format.js) | Covered |
| Exit code 0 pass, non-zero fail | Task 3 (cli.js exit code mapping) | Covered |
| WACZ v0.2.0 format support | Task 1 (verify.js vendoring), Task 2 (5th check) | Covered |

No stated requirements are unaddressed. No plan tasks lack traceability to a stated requirement.

---

## Findings

### 1. [COMPLIANCE] Evolution log directory not created by any task

**CLAUDE.md rule** (Evolution Log, Rule 1): "Before starting a phase: create the directory and write prompt.md with the exact prompt or task description."

The plan's four tasks build `packages/verify/`. None of them create the evolution log directory (`docs/evolution/NNNN-cli-verify-tool/`), write `prompt.md`, or update `docs/evolution/README.md`. The user's prompt instructs nefario to "pick the next available evolution sequence number" and "write process.md in the evolution log directory," but the delegation plan itself contains no task or explicit instruction for creating the evolution log entry _before_ execution begins.

**Recommendation**: Nefario's orchestration (not a delegated task) should create `docs/evolution/0032-cli-verify-tool/prompt.md` before dispatching Task 1. This is likely handled by nefario's wrap-up phase, but flagging because CLAUDE.md says "before starting" -- the prompt.md should exist before Task 1 runs, not after Task 4 finishes. Confirm this is in nefario's orchestration steps.

### 2. [COMPLIANCE] Backlog update not addressed

**CLAUDE.md rule** (Evolution Log, Rule 4): "Update the backlog: review docs/backlog.md after every phase."

The prompt.md scope says "Out: [...] publishing to npm (deferred to a separate task)." The backlog currently lists no item for a CLI verification tool. After this phase, `docs/backlog.md` should be updated: at minimum, the deferred npm publish should be recorded, and R11 (RFC 3161 timestamp integration, currently in Act 2) should be annotated as having its verification gap closed by this CLI tool.

**Recommendation**: Include backlog review in nefario's wrap-up checklist. Record deferred items (npm publish, CRL/OCSP revocation checking) and annotate R11's status.

### 3. [CONVENTION] `@peculiar/webcrypto` appears as a potential dependency without being in package.json

Task 2's prompt includes a code comment suggesting `pkijs.setEngine("NodeJS", new Crypto());` importing from `@peculiar/webcrypto`, then immediately contradicts it by noting Node 20+ has `globalThis.crypto`. The "What NOT to do" section says not to add `@peculiar/webcrypto` unless the built-in fails. However, the inline code snippet still contains the import line, which could mislead the implementing agent into adding the dependency.

**Recommendation**: Remove the `import { Crypto } from '@peculiar/webcrypto'` line from the prompt snippet. Keep only the `globalThis.crypto` path. The "What NOT to do" fallback instruction is sufficient.

### 4. [SCOPE] `verifiedAt` field in JSON output includes local clock time

Task 3's JSON output spec includes `"verifiedAt": "2026-03-16T15:00:00.000Z"`. The same task's design rules state "Verdict sentence does NOT include local clock time (deterministic output)." Including `verifiedAt` in JSON is fine for machine consumption (it records when verification ran), but the inconsistency between the human and JSON design principles could confuse the implementing agent about whether determinism is a goal.

**Recommendation**: No change needed to the field -- `verifiedAt` in JSON is justified for audit purposes. But add a one-line note in the JSON section: "verifiedAt uses the local clock intentionally (audit record); the human output excludes it for deterministic/testable output."

---

## Convention Compliance Summary

| Check | Result |
|---|---|
| CLAUDE.md Engineering Philosophy (YAGNI, KISS, lean and mean) | Pass. No speculative features. Vendoring over shared library is KISS. node:test over vitest is lean. No argument parsing libraries. |
| Prefer lightweight, vanilla solutions | Pass. Raw ANSI codes, manual argv parsing, native fetch, node:crypto. No framework dependencies. |
| Fail loudly, degrade intentionally | Pass. Every catch logs or handles specifically. Skip vs error distinction in check statuses. Max decompressed size check prevents zip bombs. |
| Test the real boundaries | Pass. Real TSA fixture for CMS chain validation. Integration test with production WACZ. The plan explicitly cites this CLAUDE.md directive in Task 4's context. |
| Module system (ESM) | Pass. `"type": "module"` in package.json, all imports use ESM. |
| JS over TS preference (CLAUDE.local.md) | Pass. All files are .js. |
| No emoji | Pass. Explicitly stated in format design rules. |
| Dependency policy | Pass. Only fflate (already used in Worker) and pkijs chain (justified by CMS requirement). Exact version pinning for security-critical deps. |
| Evolution log structure | See Finding 1. |
| Backlog governance | See Finding 2. |

## Scope Assessment

The plan has 4 tasks for a tool with clear boundaries. Task count is proportional to the problem: scaffold, crypto, CLI, tests. No gold-plating detected. The `--trust-root`, `--trust-embedded`, and key resolution features are all traceable to the stated requirement of independent verification (you need a trust basis to verify signatures). The 5th check (timestampChain) is the core new capability stated in the prompt. No adjacent features were added.

## Drift Assessment

No drift detected. The plan faithfully implements the prompt's stated outcome ("Anyone can independently verify the integrity and authenticity of a WRL capture") with the stated constraints (npx-runnable, offline-capable, WACZ v0.2.0 format).
