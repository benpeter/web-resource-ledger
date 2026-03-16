# Phase 0016: Process

## TL;DR

Two dependent issues (#38 R8 auth enrichment, #31 R1 list captures) implemented
in a single nefario orchestration. 7 specialists consulted for planning, 6
architecture reviewers, 3 sequential execution tasks, 2 code review fixes
applied. 384 tests pass, 17 files changed (+1,160/-128 lines). The hardest
decisions were around KV key schema (irreversible) and cursor strategy (locks in
API contract). Both resolved through specialist debate.

## The Orchestration

### Phase 1: Who should plan this?

Nefario identified four primary domains and three cross-cutting concerns:

- **Primary**: api-design-minion (first collection endpoint, sets the pattern),
  data-minion (KV key schema is the hardest-to-reverse decision),
  security-minion (auth refactor changes the trust model),
  observability-minion (new endpoint with a <300ms latency SLO)
- **Cross-cutting**: test-minion (pagination testing is non-trivial),
  ux-strategy-minion (list endpoint eliminates the biggest documented UX pain
  point), software-docs-minion (OpenAPI spec is a first-class deliverable)

Seven agents is on the higher end for nefario, but the task spans two issues with
a hard dependency between them. Each specialist had a distinct, non-overlapping
planning question.

### Phase 2: What the specialists argued

All 7 specialists ran in parallel. The key tensions that emerged:

**Sort order**: api-design-minion recommended newest-first with reverse-timestamp
encoding as "more robust" for user expectations. data-minion countered with
ascending (oldest-first) per KISS -- KV `list()` returns ascending naturally, and
reverse-timestamp encoding complicates every key operation (create, complete,
fail). Both acknowledged ascending is acceptable for MVP.

**Cursor format**: api-design-minion proposed a custom cursor encoding
`{timestamp, captureId}` that would survive a D1 migration. security-minion
preferred exposing KV's native cursor directly (server-signed, not forgeable).
The tension: migration insulation vs. implementation simplicity.

**Status filtering complexity**: The original spec called for a multi-iteration
over-fetch loop with a 500-key scan budget when filtering by status. This was
later challenged by margo in the architecture review.

**Note field**: api-design-minion considered removing the `note` field from the
202 response entirely. software-docs-minion flagged that it's a `required` field
in the OpenAPI schema -- removing it would be a breaking API change. ux-strategy-
minion argued for keeping it but changing the value from a warning ("No list
endpoint is available") to a capability pointer ("Use GET /v1/captures...").

**requireAuth() extraction**: security-minion recommended extracting auth
enforcement into a shared helper. With only 2 authenticated endpoints, this was
deferred per KISS.

No specialist recommended additional agents beyond the initial 7.

### Phase 3: Synthesis resolved five conflicts

Nefario consolidated specialist contributions into 3 sequential tasks with 1
approval gate:

1. **Sort order**: Ascending wins. The API contract doesn't promise order, so
   this can change with D1. KISS principle from the Helix Manifesto tipped it.

2. **Cursor**: Compromise -- wrap KV's native cursor in a custom base64url
   envelope (`{"kv":"<native-cursor>"}`). This gives D1 migration insulation
   (the envelope format is ours) while using KV's built-in pagination (no
   start-after logic needed).

3. **Note field**: Keep field, change value. Breaking change avoidance won.

4. **requireAuth()**: Deferred. 2 endpoints don't justify the abstraction.

5. **Write order**: Primary record first, then index key. data-minion's analysis
   was more thorough than api-design-minion's (who suggested index-first). The
   failure mode "capture works but isn't listed" is safe degradation.

A sixth conflict (CaptureSummary vs. CaptureListItem naming) was resolved
trivially -- the name describes what, not where.

### Phase 3.5: Architecture review found three things

Six reviewers ran in parallel (5 mandatory + observability-minion as
discretionary pick for the latency SLO):

- **security-minion**: APPROVE. Dual-layer tenantId validation is sound, cursor
  forgery is mitigated by tenant prefix enforcement, CaptureSummary field
  stripping is correct.

- **test-minion**: APPROVE. Flagged that `beforeEach` in kv.test.js needs to
  clean up index keys (adopted in Task 1). Also recommended a tenantPrefix()
  validation test (adopted).

- **ux-strategy-minion**: APPROVE. Journey is coherent, simplification calls are
  correct, no suggestions.

- **lucy**: ADVISE. Evolution log entry is missing (addressed in wrap-up). Plan
  is aligned with issues, no scope creep.

- **margo**: ADVISE. The multi-iteration status filter loop is ~20 lines of
  control flow that will never activate at current scale and will be replaced by
  D1. Simplify to single-pass `limit * 3` fetch. This was adopted -- the
  synthesis was revised before execution.

- **observability-minion**: ADVISE. `list.error` log event is missing
  `durationMs`. Without it, you can't tell if a KV failure was preceded by a
  slow operation already violating the SLO. Single field addition, adopted in
  Task 2.

### Phase 4: Three tasks, one gate

**Task 1 (R8)**: Auth identity enrichment. The implementation agent modified 9
files: `verifyApiKey()` now returns `{ ok: true, tenantId: 'default' }`,
`createCapture()` accepts tenantId as a required parameter (forcing every call
site to break explicitly -- test-minion's completeness audit pattern),
`tenantPrefix()` provides defense-in-depth validation, and secondary index keys
are written with matching TTL. 12 new tests added. 349 tests pass.

The human did not intervene at the Task 1 gate. The API contract and KV schema
were well-specified by synthesis and the implementation matched.

**Task 2 (R1)**: List captures endpoint. The `listCaptures()` function in kv.js
handles cursor decode, KV list with over-fetch, parallel record fetches,
status filtering, and cursor encoding. The handler in index.js adds auth, rate
limiting, parameter validation, CaptureSummary projection, and structured
logging. OpenAPI spec gained 3 new schemas and a new path. 34 new tests added.
384 tests pass.

**Task 3 (docs)**: Documentation cleanup. 8 lost-ID references removed/updated
across 5 files. README gained a "Finding and sharing captures" section with the
dual-access model framing that ux-strategy-minion designed. Backlog updated.

### Phase 5: Code review caught two real bugs

Three reviewers ran in parallel:

- **code-review-minion**: ADVISE with 2 actionable findings:
  1. Dead-branch cursor logic: `hasFilterMore` could never produce a valid cursor
     when KV exhausted its last page. The condition was unreachable but logically
     wrong. Simplified to `hasMore = !list_complete`.
  2. Missing `GLOBAL_CAPTURE_LIMITER` on the list endpoint. The list handler
     fans out to N+1 KV operations per request. Without global limiting, an
     authenticated caller could drive up KV costs. Both per-IP and global limits
     now apply.

- **lucy**: ADVISE (evolution log -- already planned for wrap-up).
- **margo**: APPROVE. Zero complexity budget spend.

Both code-review findings were fixed and committed before wrap-up.

## Human interventions

The human pre-approved all gates ("all approvals given, but pause before creating
the PR"). This means:

**What the human chose NOT to intervene on:**
- Team composition (7 specialists accepted as-is)
- Architecture review team (5 mandatory + observability, no adjustments)
- Execution plan (3 tasks, 1 gate -- approved without changes)
- Task 1 gate (API contract + KV schema -- accepted as synthesized)
- Post-execution options (run all: code review, tests, docs)

**What the human explicitly controlled:**
- Pause before PR creation -- the human wanted to review the branch state before
  the PR went up.

This is a high-trust orchestration pattern: the human set the scope (two specific
issues), pre-approved the process, and retained a single veto point at the end.

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/2026-03-16-101431-r8-auth-identity-r1-list-captures/phase2-*.md`
- Synthesis (delegation plan): `docs/history/nefario-reports/2026-03-16-101431-r8-auth-identity-r1-list-captures/phase3-synthesis.md`
- Architecture review verdicts: `docs/history/nefario-reports/2026-03-16-101431-r8-auth-identity-r1-list-captures/phase3.5-*.md`
- Code review findings: `docs/history/nefario-reports/2026-03-16-101431-r8-auth-identity-r1-list-captures/phase5-*.md`
- Nefario execution report: `docs/history/nefario-reports/2026-03-16-101431-r8-auth-identity-r1-list-captures.md`
