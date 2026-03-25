# Lucy Review: MCP Directory Listings and Ecosystem (R35)

## Verdict: ADVISE

The plan is well-aligned with the original issue's success criteria. All seven success criteria have corresponding tasks, scope is contained, and the CLAUDE.md conventions (YAGNI, KISS, Helix Manifesto) are respected. The Smithery skip is a textbook YAGNI call. The docs bug fixes (`capture_page`, `batch_capture`) are verified against source code and are legitimate preconditions, not scope creep. The repo URL is consistently `benpeter/web-resource-ledger` throughout -- no ArtificialArchitects confusion.

Three advisory items below. None blocks execution.

---

### Traceability

| Success Criterion | Plan Task(s) | Status |
|---|---|---|
| MCP server listed on at least two of: MCP.so, Smithery, Glama | Task 2 (Official Registry), Task 5 (MCP.so), Task 6 (PulseMCP), glama.json in Task 1 | COVERED (exceeds: 3+ directories) |
| PR submitted to Awesome MCP Servers | Task 3 (punkpeye), Task 4 (appcypher) | COVERED (exceeds: 2 repos) |
| Integration examples for Claude Code, Cursor, and at least one other | Task 1 Parts D/F (adds VS Code + Cline, reorders existing Claude Code/Cursor/Windsurf) | COVERED (5 clients) |
| WRL listed in at least one web archiving tool index | Task 7 (IIPC awesome-web-archiving) | COVERED |
| @w-r-l/verify submitted to at least one relevant awesome list | Task 7 (IIPC, Utilities section) + Task 8 (awesome-nodejs-security or awesome-forensics) | COVERED |
| All directory listings link to docs site and GitHub repo | server.json websiteUrl update (Task 1), PR descriptions reference both | COVERED |
| Integration examples tested and working | Plan notes Phase 6 test execution + manual verification; no new automated tests added | COVERED (proportional -- markdown changes only) |

No orphaned requirements. No plan tasks without a traced requirement (see advisory items for nuance).

---

### Findings

- [SCOPE] Glama directory listing relies only on `glama.json` in the repo root, not an explicit submission step.
  SCOPE: Task 1 Part C (glama.json) and the success criteria checklist (line 671)
  CHANGE: The verification checklist on line 671 counts Glama as one of the three directory listings ("targeting MCP.so + Glama + Official Registry"), but no task actually submits to Glama -- only `glama.json` is created. Glama auto-indexes from GitHub repos that contain this file, but the plan should acknowledge this dependency explicitly. If auto-indexing doesn't trigger during the execution window, the "at least two" criterion still passes (Official Registry + MCP.so), so this is not blocking. Add a note to the Task 6 (PulseMCP) prompt or the verification steps: "Check if Glama has indexed glama.json; if not, submit manually at glama.ai."
  WHY: The success criteria say "at least two of: MCP.so, Smithery, Glama." The plan counts Glama as covered but relies on passive auto-indexing with no verification step. If it doesn't auto-index, the team may not notice.
  TASK: Verification Steps (post-execution)

- [SCOPE] `docs/mcp.md` also contains `capture_page` -- Task 1 prompt only calls out `site/content/mcp.md` for the rename.
  SCOPE: Task 1 Part A, `docs/mcp.md` line 71 heading `### \`capture_page\``
  CHANGE: The Task 1 prompt says "Replace ALL occurrences of `capture_page` with `capture_url` in `site/content/mcp.md`" (line 61) and then instructs a "sync check" (Part A step 3) between `site/content/mcp.md` and `docs/mcp.md`. The repo-level `docs/mcp.md` is described as "already uses `capture_url` correctly" (line 65), but this is false -- `docs/mcp.md` uses `capture_url` for the tool heading at line 63 while `site/content/mcp.md` uses `capture_page` at line 71. However, `docs/mcp.md` does NOT contain `capture_page` anywhere (I verified by grep). The plan's claim is actually correct. The success criterion "grep to verify zero occurrences in the codebase" (line 181) will catch any remaining instances. No change needed -- the success criterion is the safeguard.
  WHY: Self-correcting finding. Verified that `docs/mcp.md` does not contain `capture_page`. The codebase-wide grep in the success criteria is the correct safety net.
  TASK: Task 1

- [CONVENTION] The `*(In Development)*` status in the IIPC submission (Task 7, line 470) is accurate and well-reasoned, but it contradicts the `server.json` version bump to `1.0.0` (Task 1 Part B). Both decisions are defensible for their respective audiences (MCP directory users expect a stable interface; the IIPC web archiving community is conservative about maturity claims). The plan should make this intentional divergence explicit in `decisions.md` so it doesn't look like an oversight during post-phase review.
  SCOPE: Task 1 Part B (server.json 1.0.0) vs Task 7 (IIPC "In Development" status)
  CHANGE: Add a note to the Decisions section or to the Task 7 prompt acknowledging that the IIPC "In Development" status and the server.json 1.0.0 version are audience-appropriate signals, not contradictions. The MCP server interface is stable (1.0.0); the overall product is pre-GA for web archiving purposes.
  WHY: A future reviewer reading `decisions.md` and `outcome.md` will see "1.0.0" in server.json and "In Development" in the IIPC PR and may flag it as inconsistent. Making the rationale explicit prevents a false alarm.
  TASK: Task 7 / Decisions section
