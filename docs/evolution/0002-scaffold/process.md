# 0002: How the Scaffold Was Built

TL;DR: Four specialist agents planned the project scaffold across three
planning phases. Security-minion caught a reflected-input bug in the error
response convention before any code was written. The version strategy
(latest-with-fallback) was validated when the day-zero vitest release failed
and the fallback worked in 30 seconds. Ten tests pass, all acceptance
criteria met, zero runtime dependencies. The evolution log was missed during
wrap-up -- lucy caught the gap in review, the orchestrator acknowledged it,
then didn't execute it. Fixed retroactively.

---

## The Task

Issue #1: build the project scaffold. Nothing exists except docs from the
kickoff phase. Deliverables: wrangler config, Worker entry point with route
dispatch, health endpoint, RFC 9457 error utility, Vitest test
infrastructure. The constraint set: plain JavaScript (not TypeScript), Helix
Manifesto (YAGNI, KISS, Lean and Mean), Cloudflare-native serverless.

This is a foundation step -- every subsequent implementation step (2 through
8) will import from and build on whatever patterns are established here.
That makes the conventions more important than the code.

## Phase 1: Assembling the Team

Nefario selected four specialists:

- **iac-minion** -- wrangler.toml configuration, binding declarations, what
  breaks in Miniflare vs production
- **api-design-minion** -- route dispatch pattern for a Worker growing to
  ~8 routes, error response conventions, content-type standards
- **test-minion** -- vitest + @cloudflare/vitest-pool-workers setup, version
  compatibility, SELF.fetch vs direct import patterns
- **api-spec-minion** -- RFC 9457 application/problem+json shape, minimal
  spec-compliant error body, utility API design

The team was approved without changes. Four specialists for a scaffold step
is proportional -- each owns a distinct domain that the others don't cover.

Full meta-plan: [`phase1-metaplan.md`](../../history/nefario-reports/2026-03-13-133723-mvp-step-1-project-scaffold-cloudflare-worker/phase1-metaplan.md)

## Phase 2: The Four Arguments

### The error utility API fight

This was the main design conflict. api-design-minion proposed a four-parameter
signature: `problemResponse(status, type, title, detail)`. The caller
explicitly passes the type URI (as `about:blank#not-found` fragments) and
the title string. This gives maximum control and makes the error shape
visible at the call site.

api-spec-minion proposed two parameters: `problemResponse(status, detail)`.
Type is always `about:blank` (hardcoded). Title is auto-derived from a
status code lookup table. The caller only provides what varies per call.

The argument for api-spec-minion's version: since all WRL errors use
`about:blank`, a caller-provided type slug adds no information and creates a
consistency hazard. Every call site across 8 implementation steps would need
to pass the "correct" slug, with no enforcement that slugs stay consistent.
Auto-deriving title from status code eliminates another inconsistency class
("Not Found" vs "not found" vs "Resource Not Found").

The argument for api-design-minion's version: it's more explicit, and the
fragments (`about:blank#not-found`) could theoretically be used for
client-side routing of error types without parsing the status code.

**Resolution: api-spec-minion won.** The fragments add a namespace nobody
will consume. KISS. The optional `headers` parameter (for 405 `Allow` and
503 `Retry-After`) was added from api-design-minion's contribution.

### The version pinning question

test-minion did live npm registry checks and recommended the latest versions:
vitest@4.1.0 + @cloudflare/vitest-pool-workers@0.13.0. Both were released
the same day. test-minion's argument: greenfield project with zero tests
means zero migration cost. Starting on the latest maximizes runway. Fallback
versions (3.2.4 + 0.12.21) documented as a 30-second change.

iac-minion recommended conservative ranges: `vitest ~3.1.0` +
`@cloudflare/vitest-pool-workers ^0.8.0`.

**Resolution: test-minion's latest-with-fallback.** iac-minion's ranges were
based on older documentation and might not resolve correctly. The fallback
strategy turned out to be prescient -- the primary versions failed during
execution (see Phase 4 below).

### The response module location

api-design-minion proposed separate files: `src/errors.js` for
`problemResponse` and `src/response.js` for `jsonResponse`.

**Resolution: merge into `src/responses.js`.** Two functions, one concern.
Two files for two small functions is over-decomposition.

### The type URI format

api-design-minion proposed `about:blank#not-found`, `about:blank#method-not-allowed`, etc.

api-spec-minion proposed plain `about:blank` with no fragment.

**Resolution: plain `about:blank`.** Clients should switch on `status`, not
parse `type` fragments. The fragments add a namespace to manage that nobody
will consume.

Full specialist contributions:
[`phase2-*.md`](../../history/nefario-reports/2026-03-13-133723-mvp-step-1-project-scaffold-cloudflare-worker/)

## Phase 3.5: The Security Catch

Five mandatory reviewers audited the synthesized plan. No discretionary
reviewers were selected (no UI, no user-facing pages, single worker).

The important finding came from **security-minion**: the fallback 404 in
`src/index.js` was planned to echo `request.method` and `url.pathname` into
the error response body:

```js
return problemResponse(404, `No route matches ${request.method} ${url.pathname}`);
```

Security-minion flagged this as CWE-209 (information disclosure) and,
more importantly, as a convention problem. This is Step 1 of 8. Every
subsequent step will pattern-match from the first error call site. If
the first example reflects user input, the convention spreads. The fix:
a static string.

**test-minion** caught that the `[browser]` binding in wrangler.toml
requires explicit Miniflare configuration or all tests fail at Worker
startup. This was not in the original plan.

**ux-strategy-minion** recommended `toMatchObject` over `toEqual` for
the health body assertion -- strict equality breaks on any future field
addition. Minor but exactly the kind of forward-friction that accumulates.

**lucy** raised two points: (1) `jsonResponse()` is technically scope creep
(the issue asks for "error response pattern," not "response utilities") but
justified by immediate use in the health handler -- 6 lines of code, no
action needed. (2) The evolution log directory (`docs/evolution/0002-scaffold/`)
is not in the plan. CLAUDE.md mandates it. Lucy recommended either adding a
task or documenting that the calling session owns it.

**margo**: APPROVE. Plan is proportional, all conflict resolutions favored
simplicity, nothing to cut.

Results: 4 ADVISE, 1 APPROVE, 0 BLOCK. Seven advisories incorporated into
the execution plan.

Review verdicts: [`phase3.5-*.md`](../../history/nefario-reports/2026-03-13-133723-mvp-step-1-project-scaffold-cloudflare-worker/)

## The Human Interventions

### What was approved without changes

The execution plan was approved as presented: 4 sequential tasks, 0 mid-
execution gates, 7 incorporated advisories. No post-execution phases were
skipped (code review, tests, and documentation all ran).

### What the human didn't intervene on

The human did not adjust the team (approved the 4 specialists as-is), did
not request changes to the plan, and did not skip any reviewers. This was a
straightforward scaffold step where the specialist recommendations aligned
well and the conflicts had clear resolutions.

The human also chose not to override the version decision (latest-with-
fallback). This turned out to matter -- see Phase 4 below.

## Phase 4: The Version Fallback

Four tasks ran sequentially because each depends on the prior task's output
files.

**Task 1 (iac-minion)**: Created wrangler.toml, package.json, vitest.config.js,
.gitignore, directories. The first interesting moment: `npm install` with
vitest@4.1.0 + pool-workers@0.13.0 failed -- pool-workers@0.13.0 doesn't
export `./config` when paired with vitest@4.1.0. iac-minion fell back to
the documented stable versions (3.2.4 + 0.12.21). Total time lost: ~30
seconds. This validated the risk mitigation strategy from the plan exactly
as designed.

**Task 2 (api-design-minion)**: Created src/index.js and src/responses.js.
The agent correctly used the static 404 message from the security advisory
rather than the reflected-input version that was still in the synthesis
document. All advisories were applied: fallback title comment, detail
message convention at the top of responses.js, CWE-209 comment on the
fallback.

**Task 3 (test-minion)**: Created both test files. Fixed a pre-existing bug
in vitest.config.js -- `browserRendering: true` is not a valid Miniflare
option; the correct form is `browserRendering: { binding: 'BROWSER' }`.
All 10 tests passed on first run.

**Task 4 (iac-minion)**: End-to-end verification. All acceptance criteria
confirmed via `npm test` and `curl` against `wrangler dev`. One harmless
warning: Miniflare's bundled runtime is dated 2026-03-10, so it falls back
from the 2026-03-13 compatibility date. No functional impact.

## Post-Execution: Code Review

Three reviewers ran in parallel:

- **code-review-minion**: APPROVE. Noted that the synthesis document still
  contains the reflected-input string (documentation lag, not a code issue).
  Recommended adding "verify detail strings are static" to the code review
  checklist for Steps 2-8.

- **lucy**: ADVISE. Found vestigial `.gitkeep` files in `src/` and `test/`
  (left behind after real files were created). Removed.

- **margo**: APPROVE. "Scaffold is minimal, proportional, and clean. Two
  source files, two test files, three devDependencies, zero runtime
  dependencies, no frameworks, no unnecessary abstractions."

No BLOCKs. No code changes required beyond the .gitkeep cleanup.

## The Evolution Log Miss

Lucy flagged during Phase 3.5 that the evolution log was not in the
execution plan. The orchestrator acknowledged it: "calling session owns
this." Then during wrap-up, the orchestrator wrote the nefario report,
created the PR, and cleaned up -- but never created the evolution log
directory.

Root cause: the nefario skill's wrap-up sequence has no hook for project-
specific documentation requirements. Lucy identified the gap, the
orchestrator acknowledged it, but acknowledgment isn't execution. The
responsibility fell between two chairs: not in the delegation plan, not in
the nefario wrap-up checklist.

This is being fixed retroactively (you're reading the result). A feedback
memory has been saved to prevent recurrence.

## Where to Read the Full Discussions

All specialist contributions, synthesis documents, reviewer verdicts, and
agent prompts are preserved in the companion directory:

```
docs/history/nefario-reports/2026-03-13-133723-mvp-step-1-project-scaffold-cloudflare-worker/
```

Key files:

| File | What it contains |
|------|-----------------|
| `phase2-api-spec-minion.md` | The winning argument for the 2-parameter error API |
| `phase2-api-design-minion.md` | The losing argument for 4 parameters and `about:blank#` fragments |
| `phase2-test-minion.md` | Version analysis with live npm registry checks |
| `phase3-synthesis.md` | Full delegation plan with all 4 conflict resolutions |
| `phase3.5-security-minion.md` | CWE-209 finding on reflected input |
| `phase3.5-lucy.md` | Evolution log gap identification |
| `phase5-code-review-minion.md` | Post-execution code review findings |

The nefario execution report:
[`docs/history/nefario-reports/2026-03-13-133723-mvp-step-1-project-scaffold-cloudflare-worker.md`](../../history/nefario-reports/2026-03-13-133723-mvp-step-1-project-scaffold-cloudflare-worker.md)
