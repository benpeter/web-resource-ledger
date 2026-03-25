# Margo Review: MCP Directory Listings and Ecosystem (R35)

## Verdict: ADVISE

The plan is proportional to the task. Eight tasks for a docs-fix-then-submit-everywhere workflow is reasonable -- Task 1 is real work, Tasks 2-8 are independent fire-and-forget submissions. The single approval gate on Task 1 is correct. Parallelism after the gate is correct. No unnecessary abstractions, no dependency bloat, no code complexity.

Three concerns, all non-blocking.

---

### Finding 1: server.json version bump to 1.0.0 signals more than intended

**SCOPE**: `server.json` version field
**CHANGE**: Consider keeping `0.1.0` or moving to `0.9.0` instead of `1.0.0`
**WHY**: The `version` field in server.json is MCP registry metadata. Directory reviewers and downstream consumers may interpret `1.0.0` as a semver stability commitment on the MCP tool interface -- meaning no breaking changes to tool names, parameters, or response shapes without a major version bump. The API versioning commitment (PR #191) covers the REST API (`/v1/`), not the MCP tool interface specifically. If a tool parameter gets renamed or a response shape changes in a future phase, a 1.0.0 version means that is a breaking change requiring 2.0.0. The plan's rationale ("4 stable tools, stable transport, stable auth") is sound, but the decision should be made deliberately: is the team ready to commit to the MCP tool interface being frozen? If yes, 1.0.0 is correct. If there is any chance of MCP tool changes in the near term, 0.9.0 signals maturity without locking in the semver contract.

This is an ADVISE, not a BLOCK, because the plan explicitly documents the rationale and the decision was deliberate. The concern is about whether the downstream implications were fully considered, not about the decision process.

---

### Finding 2: Task 6 (PulseMCP) may be zero-work

**SCOPE**: Task 6 submission to PulseMCP
**CHANGE**: None required -- but the plan should acknowledge this may resolve as a verification-only task
**WHY**: The plan correctly notes PulseMCP auto-indexes from the official MCP registry. If Task 2 succeeds, Task 6 may consist entirely of "check the URL, confirm it's there, done." The plan already handles this (step 1 checks for auto-indexing), so no change needed. Noting it because if the team is tracking task counts as a complexity signal, this one is likely near-zero effort.

---

### Finding 3: Task 8 target list may not be a good fit

**SCOPE**: Task 8 submission of @w-r-l/verify to awesome-nodejs-security
**CHANGE**: None required for plan structure. The executing agent should be ready to skip the task if neither target repo has a fitting category.
**WHY**: awesome-nodejs-security focuses on npm supply chain security, vulnerability scanning, and application security hardening. A cryptographic verification tool for web captures is adjacent but may not fit any existing category. The task prompt already includes a fallback (awesome-forensics), which is good. The concern is that forcing a PR onto a list where it does not fit damages credibility with those communities. The executing agent should be empowered to report "no good fit found" as a valid outcome rather than shoehorning.

---

### Items reviewed and found proportional (no concerns)

- **Task count (8)**: Appropriate. Task 1 is the only one with real complexity (docs fix + metadata updates). Tasks 2-8 are independent, small-scope submissions. Decomposing by target repo is correct -- each has different format requirements, audiences, and submission mechanisms.
- **glama.json**: Two lines of JSON. Required by Glama's directory. Zero complexity cost.
- **Smithery skip**: Correct YAGNI call. A Docker proxy for a Cloudflare Worker is accidental complexity.
- **batch_capture removal**: Correct. Removing phantom docs for a non-existent tool is a bug fix, not scope creep.
- **Client config additions (VS Code, Cline)**: Low-effort JSON snippets in existing docs. The prompt asks for "at least one other MCP client" beyond Claude Code and Cursor; adding two more is minimal marginal effort.
- **"Try it" prompt**: One line of markdown. Negligible.
- **IIPC submission (Task 7)**: Explicitly requested by success criteria ("at least one web archiving tool index"). Audience-appropriate positioning (no MCP jargon) is correct.
- **Approval gate placement**: Single gate on Task 1 before any external submissions go out. Correct -- you cannot un-submit external PRs with wrong tool names.
- **No new dependencies**: The plan modifies markdown and JSON. No npm packages added. No runtime changes. `mcp-publisher` is a CLI tool used once for registry publishing, not a project dependency.
