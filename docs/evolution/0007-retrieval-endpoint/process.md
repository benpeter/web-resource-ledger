# Process: Retrieval Endpoint

## TL;DR

5 specialists planned, 5 reviewers pre-reviewed, 4 tasks executed across 2
batches with 2 approval gates. 3 code reviewers all approved. 230/230 tests
pass. The main design conflict -- direct R2 URLs vs worker-proxied -- was
resolved by 3-specialist consensus overriding the simplicity argument. One
runtime discovery (R2 ReadableStream doesn't work in workerd test runner)
led to a buffering workaround. Total: 578 lines across 5 files, 3 commits.

## Team Composition

**Planning (Phase 2)**: api-design-minion, api-spec-minion, security-minion,
ux-strategy-minion, test-minion.

**Architecture Review (Phase 3.5)**: security-minion, test-minion,
ux-strategy-minion, lucy, margo.

**Execution (Phase 4)**: frontend-minion (Tasks 1, 2), api-spec-minion
(Task 3), test-minion (Task 4). All on sonnet.

**Code Review (Phase 5)**: code-review-minion (sonnet), lucy (opus),
margo (opus).

Model directive: user requested sonnet for all execution agents. Opus
reserved for governance reviewers (lucy, margo) per nefario convention.

## What the Specialists Argued

### The URL Strategy Conflict

The central design question: how should artifact URLs work?

**ux-strategy-minion** argued for direct R2 public URLs. Simpler for callers,
one fewer hop, no Worker CPU on downloads. The capture ID already controls
access, so the Worker isn't adding authentication value.

**api-design-minion** countered: the issue says "Content-Type and Content-Length
headers" on artifact responses. You can only control response headers if the
Worker is in the serving path. Direct R2 URLs delegate header control to R2's
public access settings.

**security-minion** escalated: the backlog's "Captured HTML XSS prevention"
item is non-deferrable. If `rendered.html` is served as `text/html`, any
attacker-controlled content from the headless browser render becomes a
stored-XSS vector. The Worker MUST intercept and override Content-Type to
`text/plain`. Direct R2 would serve whatever Content-Type was set at write
time.

**api-spec-minion** added: the capture-ID-as-access-secret model breaks if
R2 keys become the access mechanism. R2 keys follow the pattern
`captures/{captureId}/screenshot.png` -- knowing the capture ID and the
naming convention gives you all artifact keys.

Resolution: worker-proxied URLs. Three independent security/correctness
arguments outweighed the simplicity argument. The Task 1 belt-and-suspenders
httpMetadata fix (setting Content-Type at R2 write time too) was added as
defense-in-depth.

### The Lifecycle State Debate

**api-spec-minion** proposed returning all lifecycle states (pending, complete,
failed) from the retrieval endpoint. Rationale: reduces round-trips -- callers
don't need to hit the status endpoint first.

**ux-strategy-minion** argued for clean separation: the status endpoint owns
lifecycle, the retrieval endpoint owns completed captures. Mixing them
creates ambiguity about which endpoint to use and when.

**security-minion** tipped it: differentiating "unknown ID" from "capture
exists but is not complete" via different 404 bodies or status codes enables
ID enumeration. An attacker can distinguish "this ID was submitted" from
"this ID doesn't exist" by observing the response.

Resolution: single static 404 for all non-200 cases. security-minion proposed
the timing side-channel as an accepted residual risk -- KV hit vs KV miss
produces statistically different latency, but the ID-as-secret model accepts
this. Documented in a SECURITY comment in the code.

### The Schema Shape

**api-design-minion** proposed fully nested objects per artifact:
`{ url, contentType, size }`. Extensible for future metadata.

**ux-strategy-minion** proposed flat URL strings: callers just need the URL.
WACZ is special -- it carries `bundleHash` and `size` for verification.

Resolution: hybrid. Flat strings for simple artifacts, nested for WACZ. This
was ux-strategy-minion's original proposal and api-spec-minion agreed it was
cleaner than the fully-nested alternative.

## How Architecture Review Changed the Plan

Phase 3.5 produced 1 APPROVE and 4 ADVISE verdicts (0 BLOCKs). The advisories
were substantive:

**security-minion** caught that the Task 2 prompt didn't explicitly require a
`record.status !== 'complete'` guard on the artifact handler. The metadata
handler had it, but the artifact handler prompt only checked for null records.
This was incorporated before execution -- the guard was added to the prompt.

**security-minion** also flagged `Cache-Control: no-store` on ALL 404 paths,
not just the ones where it was obvious. The prompt had it for the "record not
found" case but not for "R2 object null" or "artifact key undefined" cases.

**test-minion** predicted which test cases would be missing: artifact route
coverage, pending-capture 404, absent optional artifact. All were added to the
Task 4 prompt.

**margo** noted the Task 3 approval gate was potentially low-value since the
spec is mechanically derived from the handler response shape. The human chose
to keep the gate -- the OpenAPI spec is a contract that downstream consumers
depend on, and mechanical derivation doesn't guarantee correctness.

**lucy** verified full requirements traceability: every Issue #5 acceptance
criterion mapped to a plan task and test.

## Human Interventions

### What was changed

- **Kept Task 3 gate** despite margo's suggestion to drop it. The OpenAPI spec
  is a public contract -- worth a human glance even if mechanically derivable.
- **Selected all post-execution phases** (no skips). The default was to run
  code review, tests, and documentation.

### What was deliberately left alone

- **arrayBuffer() workaround**: The test agent discovered R2 ReadableStream
  doesn't work in the workerd test runner and switched to buffering. This is
  a reasonable trade-off for MVP. The human did not intervene -- the agent
  made the right call and documented it.
- **Code review NITs**: All three reviewers returned APPROVE with NITs (weak
  test assertions, missing CORS assertions, missing Cache-Control assertions
  on artifacts). The human accepted these as non-blocking documentation of
  future improvements.
- **No Phase 8 documentation**: The OpenAPI spec IS the API documentation.
  The human accepted the skip.

## Runtime Discovery

The test agent (test-minion on sonnet) made an important discovery during
Task 4 execution: R2's `obj.body` ReadableStream doesn't work properly in
the `@cloudflare/vitest-pool-workers` test runner. The agent independently
diagnosed the issue, switched to `await obj.arrayBuffer()`, and documented
the workaround with a comment. This was later validated by all three code
reviewers (margo specifically flagged it as a backlog item for streaming).

This is the kind of runtime constraint that planning phases can't predict --
it only surfaces when you actually run code in the target environment.

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/2026-03-14-143102-mvp-step-5-retrieval-endpoint/phase2-*.md`
- Architecture review verdicts: `docs/history/nefario-reports/2026-03-14-143102-mvp-step-5-retrieval-endpoint/phase3.5-*.md`
- Code review verdicts: `docs/history/nefario-reports/2026-03-14-143102-mvp-step-5-retrieval-endpoint/phase5-*.md`
- Synthesis (delegation plan): `docs/history/nefario-reports/2026-03-14-143102-mvp-step-5-retrieval-endpoint/phase3-synthesis.md`
- Execution report: `docs/history/nefario-reports/2026-03-14-143102-mvp-step-5-retrieval-endpoint.md`
