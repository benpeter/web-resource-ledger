# Process: --legal flag for verify CLI

**TL;DR**: Four specialists planned a CLI legal report feature in parallel,
architecture review by five agents caught trust-model positioning and
regression test gaps, implementation was two tasks by the orchestrator plus
two delegated (tests + docs), and code review surfaced three fixable issues
(shell quoting, count scoping, unused imports). 230 tests pass. One PR,
four commits.

## Phase 1: Meta-plan

Nefario selected six specialists: user-docs-minion, devx-minion,
security-minion, software-docs-minion, frontend-minion, and
ux-strategy-minion. Lucy reviewed the team and cut frontend-minion and
ux-strategy-minion — this is a CLI text output feature, not a UI task.
Final team: four specialists.

## Phase 2: Specialist planning (4 agents, parallel)

### user-docs-minion
Proposed the 7-section report structure modeled on forensic expert
declarations. Key argument: each section serves a specific evidentiary
purpose (summary for the judge, methodology for opposing counsel's expert,
full technical details for independent verification). Recommended against
merging timestamp rows in legal mode — the distinction between standard
and qualified timestamps is legally significant.

### devx-minion
Argued for a separate `format-legal.js` module rather than extending
`format.js`. Reasoning: legal output shares almost no formatting code
with the existing formatters — different structure, no ANSI, no merging,
untruncated values. Also proposed the `WRL-LEGAL-1.0` format version and
3-way routing in `run()`.

### security-minion
Three key contributions:
1. Trust model must lead the report when `--trust-embedded` is used (not
   buried in Section 7). Users reading a legal report need to immediately
   know the trust level.
2. Reproducibility command must be built from the result object, not
   `process.argv`, to avoid leaking local filesystem paths.
3. Three timestamps must be clearly distinguished: capture time
   (self-asserted), TSA time (independent), verification time (report
   generation). Each has different evidentiary weight.

### software-docs-minion
Scoped documentation to README update, verification.md section, and
legal-evidence.md section. Explicitly rejected standalone spec file and
openapi.yaml changes (no new API endpoints).

## Phase 3: Synthesis

No conflicts between specialists — their recommendations were complementary.
The synthesis produced a 4-task execution plan:
1. CLI integration (--legal flag, argument parsing, routing)
2. format-legal.js (formatLegal + formatLegalJson)
3. Tests (format-legal.test.js)
4. Documentation (README, verification.md, legal-evidence.md)

Tasks 1-2 had a gate after Task 2 (legal report text is load-bearing for
credibility). Tasks 3-4 were parallelizable after the gate.

## Phase 3.5: Architecture review (5 reviewers)

Five mandatory reviewers: security-minion, test-minion, ux-strategy-minion,
lucy, margo.

- **security-minion**: ADVISE — credential-bearing URLs must be stripped
  from reproducibility command, key-file paths shouldn't leak. Both
  addressed by building command from result object.
- **test-minion**: ADVISE — positional assertion needed for embedded
  warning (should appear before Section 2, not just anywhere), CLI routing
  subprocess test needed.
- **ux-strategy-minion**: APPROVE — report structure maps well to legal
  professional mental model.
- **lucy**: APPROVE — requirements fully traceable.
- **margo**: APPROVE with note — WRL-LEGAL-1.0 version constant is the
  minimum needed, not a versioning framework.

## Phase 4: Execution

Tasks 1-2 were implemented directly by the orchestrator (not delegated)
because they required careful prose authoring for legal accuracy. The
orchestrator wrote ~720 lines of format-legal.js with the EXPLANATIONS
constant containing per-check `what`, `pass`, `fail`, `skip`, and
`significance` text.

### Task 2 gate — Lucy reviewed
Lucy traced all 8 success criteria to specific code sections. Verdict:
ADVISE with 3 minor findings:
1. Unused `CHECK_LABELS` import
2. Dead `legalMode` variable in cli.js
3. Reproducibility command missing `--trust-root` note

All three fixed before proceeding.

### Tasks 3-4 (parallel)
- test-minion wrote 82 tests across 14 suites covering structural
  assertions, no-ANSI invariant, untruncated values, timestamp separation,
  trust model visibility, legal references, graceful degradation, JSON
  schema, and reproducibility note.
- user-docs-minion updated README.md, verification.md, and
  legal-evidence.md.

## Post-execution

### Code review (code-review-minion)
Found 4 issues:
1. **Shell quoting** (blocking): Reproducibility command not safe for
   filenames with spaces. Fixed with `shellQuote()`.
2. **getVersion() silent catch** (blocking per convention): Pre-existing
   code, not introduced by this PR. Left unfixed (scope creep).
3. **Summary count mismatch** (blocking): Summary counted all checks but
   Section 3 only showed checks in `checkOrder`. Fixed by filtering.
4. **Missing --legal in cli-args.test.js** (blocking): Every other boolean
   flag had tests. Added 3 tests.

Also noted: duplicate `publicKey` in JSON output (captured in both
`capture.embeddedPublicKey` and `keyResolution.publicKey`). This is
intentional — `capture` holds the raw value, `keyResolution` holds it
with trust context.

### Test execution
230 tests, 0 failures. The 82 new format-legal tests all pass, and no
existing tests regressed.

### Documentation
Updated in Task 4. Surface consistency check confirmed no other surfaces
needed updating (OpenAPI, landing page, MCP server, legal pages all
unaffected by a CLI-only feature).

## What I'd do differently

The `getVersion()` silent catch is a pre-existing convention violation
that code review correctly flagged. It's technically out of scope for
this PR, but it feeds directly into the legal report's version field.
If `package.json` is missing, the report will show version `0.0.0`,
which undermines reproducibility. A follow-up should fix this.

## Where to read more

- Specialist contributions: scratch files in the nefario report
- Architecture review: phase 3.5 scratch files
- Code review findings: commit `9ec90c3` addresses all actionable items
