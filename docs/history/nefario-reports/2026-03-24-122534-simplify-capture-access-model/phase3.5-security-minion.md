## Security Review: simplify-capture-access-model

### Verdict: APPROVE

The plan is sound. The security model is coherent, the migration is safe, and the
implementation instructions correctly handle every handler that currently depends on
`captureAuth`. One issue requires attention during Task 1 execution -- the artifact
handler has a rate-limiter gap -- but it is bounded in scope.

---

### Findings

#### MEDIUM -- Rate limiter not applied to newly-public artifacts (screenshot, html, headers)

**Location**: `src/index.js` `handleGetCaptureArtifact`, lines ~1586-1600

**Description**: The current code has two branches:
- `!captureAuth && artifactName !== 'wacz'` → 401 (these are currently auth-gated)
- `!captureAuth && artifactName === 'wacz'` → rate-limit check via `VERIFY_RATE_LIMITER`

After Task 1, `captureAuth` will be unset for all public requests. The first branch
(the 401 gate) will be removed. But the rate limiter in the second branch is written as
`if (!captureAuth && env.VERIFY_RATE_LIMITER)` -- it only fires when `captureAuth` is
absent. Once all artifact requests are public, `captureAuth` will always be absent, so
the rate limiter will fire for ALL artifact types, not just WACZ.

This is actually the correct behavior after the change. However, the Task 1 prompt
does not explicitly instruct the agent to verify this path. The agent must not
accidentally preserve a guard that blocks non-WACZ artifacts before the rate limiter
runs. The current `if (!captureAuth && artifactName !== 'wacz') return 401` at line
1586 must be deleted in its entirety. If the agent deletes only the check text and
leaves a residual structure, the rate limiter could be bypassed for non-WACZ artifacts.

**Impact**: If the rate limiter is bypassed for screenshot/html/headers artifacts,
those R2 reads are unbounded per IP. Manageable risk since rate limiting is already
deferred as a separate concern, but the existing WACZ rate limiter should carry over
to all public artifacts without regression.

**Remediation**: Task 1 step 2 should explicitly state: delete the `if (!captureAuth &&
artifactName !== 'wacz') return 401` block entirely, and verify the existing
`if (!captureAuth && env.VERIFY_RATE_LIMITER)` block below it still fires. The rate
limiter already handles the public path correctly -- it just needs the 401 gate removed
above it. No new code needed.

---

#### LOW -- `handleGetCapture` and `handleCaptureStatus` access `captureAuth` unconditionally before null check

**Location**: `src/index.js` lines ~1486-1490 (`handleGetCapture`), lines ~1845-1850 (`handleCaptureStatus`)

**Description**: Both handlers currently do `captureAuth.scopedCaptureId` and
`captureAuth.tenantId` checks that assume `captureAuth` is always set. After Task 1,
`captureAuth` will be `undefined` for public requests. The Task 1 prompt correctly
identifies this and instructs: "if `env._captureAuth` exists, enforce tenant isolation;
if NOT set, skip tenant isolation and serve to anyone." The instruction is correct.

This is called out to ensure the executing agent does not accidentally reference
`captureAuth.tenantId` on the unauthenticated code path, which would throw a runtime
TypeError instead of serving the response.

**Impact**: Unhandled TypeError on public requests -- effective 500 for all public
capture access until fixed in production.

**Remediation**: The Task 1 prompt already covers this. Flagged here for the agent
to treat these checks as null-unsafe. Pattern to use:

```javascript
if (captureAuth && record.tenantId !== captureAuth.tenantId) {
  return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
}
```

---

#### LOW -- IP field exposure audit on public path not explicitly verified

**Location**: `src/index.js` `handleGetCapture` response body construction (~line 1538+)

**Description**: The `handleGetCapture` response currently omits `ip` (the plan's
test suite addition "ip field absent from unauthenticated response" covers this for
the test perspective). A grep of the current handler confirms `ip` is not included in
the JSON response body construction, so this is informational only. The test minion's
new test validates the invariant at the correct layer.

**Remediation**: No action required. The test minion's new assertion ("ip field absent
from unauthenticated response") is the correct defense-in-depth check.

---

### D1 Migration Assessment: SAFE

The `0013_drop_share_tokens.sql` migration is correct:
- Indexes are dropped before the table (required for SQLite; D1 is SQLite-backed)
- `DROP INDEX IF EXISTS` and `DROP TABLE IF EXISTS` make the migration idempotent
- The `share_tokens` table has two FK columns (`capture_id`, `tenant_id`) referencing
  `captures` and `tenants` respectively. In SQLite, dropping the child table
  (`share_tokens`) does not require or affect the parent tables -- this is safe
- No other table references `share_tokens` as a foreign key target, so there are
  no cascading concerns
- Sequence is correct: code change removes all writes to the table before the
  migration removes it. No window where code tries to write to a dropped table.

---

### Auth Removal Attack Surface Assessment

**Enumeration**: The list endpoint stays auth-gated. The only way to enumerate
captures is to guess 128-bit UUIDs (cap_ + 32 hex chars = ~122 bits of entropy from
UUID v4). This is computationally infeasible. The threat model rationale in
SECURITY.md is accurate.

**Old share token URLs**: URLs with `?token=wrl_share_...` continue to work after the
change -- the endpoint is now public and the router ignores unknown query parameters.
The token is never looked up. This is the correct behavior: old links keep working,
they just stop requiring a valid token. No broken links, no data exposure.

**Cross-tenant leakage**: Without auth, there is no "cross-tenant" concept for
individual captures. Anyone with a capture ID can read it. This is the intended design.
The list endpoint (where cross-tenant isolation matters) remains auth-gated.

**Artifact content-type**: The HTML artifact is already served as `text/plain` (not
`text/html`) with Content-Disposition: attachment, preventing XSS. This is unchanged
by the plan.

**CORS**: `Access-Control-Allow-Origin: *` is already on the capture metadata response.
Making it public does not change this exposure.

---

### Deferred Items (Correctly Deferred)

The plan defers rate limiting, X-Robots-Tag, and capture ID entropy to separate
issues. These deferral decisions are correct -- none of them are required for the
access model change to be safe, and bundling them would obscure the simplification.
Rate limiting is the highest-priority follow-on given R2 egress cost exposure.
