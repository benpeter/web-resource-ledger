# Gru Technology Review -- Usage Metering Phase 3 (Revision 1)

**Verdict: APPROVE**

---

## Handler Count Fix -- Verified

The revision corrects the handler count from 6 to 3. I verified against the
actual source (`src/index.js`): `verifyApiKey` is called in exactly three
handlers -- `handleCreateCapture` (line 415), `handleBatchCapture` (line 559),
and `handleListCaptures` (line 766). The other three handlers
(`handleCaptureStatus`, `handleGetCapture`, `handleGetCaptureArtifact`) are
public endpoints with no tenant auth. The plan now accurately reflects this.
The Task 2 prompt has been updated to match, and the Decisions section
documents the correction and reasoning clearly.

---

## Technology Assertions -- Still Hold

My prior APPROVE covered the following and nothing in this revision reverses
them:

**D1 UPSERT pattern**: Single-row-per-tenant-period with `ON CONFLICT DO UPDATE`
using `excluded.col` references is correct SQLite 3.24+ syntax. D1 runs SQLite.
The PRAGMA foreign_keys, CHECK constraints, and composite PK design are sound.

**ctx.waitUntil() fire-and-forget**: The deferred write pattern is the
established Cloudflare Workers pattern for non-blocking side effects. The
`.catch()` wrapping with `log(env, 4, ...)` on counter failures is correct.
The plan explicitly acknowledges this means underbilling on D1 failures --
that is the right direction for a billing error.

**computePeriod() using UTC**: `new Date().toISOString().slice(0, 7)` produces
UTC-based YYYY-MM. Period boundaries (periodStart/periodEnd) in the admin
endpoint are computed correctly via `Date.UTC()`. No timezone bug is
introduced.

**storedBytes approximation**: Computing from in-memory buffer sizes before R2
puts is accurate for logical content bytes. R2 does not transform content.
The plan documents this correctly as an approximation (excluding R2 metadata
overhead) and flags it as a known, low-impact limitation.

---

## Advisory Incorporation -- Adequate

The revision incorporates advisory feedback in the Cross-Cutting Coverage and
Decisions sections:

- security-minion: 404 for nonexistent tenants is implemented and tested.
  Decision is documented with rationale (404 does not leak new info; admin
  can already enumerate tenants).
- observability-minion: `usage.counter_incremented` success event added to
  queue consumer (not API handlers, justified by volume). Reconciliation
  backlog item flagged. The distinction between counter failure logging
  (severity 4) and counter success logging (severity 3) is appropriate.
- ux-strategy-minion: `updatedAt` semantics clarified in OpenAPI spec
  description and in the response shape rationale.

---

## No New Technology Concerns

The revision introduces no new technology choices, no new external
dependencies, and no changes to the execution order or task boundaries.
The fix is surgical: it corrects the handler count, updates the Task 2
prompt to match, and documents the decision. All other plan elements are
unchanged from the version I previously approved.

D1 as the usage counter store remains appropriate for this scale. The
atomic UPSERT pattern avoids counter races. The deferred write pattern
keeps capture/API response latency unaffected.

---

**APPROVE** -- proceed to delegation.
