# Margo Review: TSA Error Logging (#72)

## Verdict: APPROVE

The plan is minimal and proportional to the problem. One empty catch block
needs observability; the plan adds exactly that and nothing more.

## Assessment

**Scope alignment**: The request is "replace empty catch {} with error logging."
The plan does exactly this plus the tri-state timestampStatus change (`'error'`),
which is directly required by the project's "Fail loudly, degrade intentionally"
principle -- operators must distinguish "TSA misconfigured" from "TSA not
configured." No scope creep detected.

**YAGNI compliance**: Good. The plan explicitly rejected classifyTsaError() and
logCtx, both of which would have been accidental complexity. No new abstractions,
no new dependencies, no new files.

**KISS compliance**: The change reuses existing patterns verbatim:
- `await log(env, 4, 'capture', {...})` matches capture.header_fail (line 128)
  and capture.wacz_fail (line 203) in capture.js
- `String(err?.message ?? '').slice(0, 256)` matches capture.js lines 119 and 238
- Severity 4 (warn) is correct for degraded-but-functional
- The `import { log }` is the only new import

**Tri-state timestampStatus**: Adding `'error'` is the minimum change needed to
distinguish "no TSA configured" (`'absent'`) from "TSA failed" (`'error'`).
Without this, production would still show `'absent'` for both cases, defeating
the observability goal. The ternary chain
(`tsaResult ? 'present' : (tsaError ? 'error' : 'absent')`) is straightforward.

**Test cases**: All three are necessary and test behavior, not implementation:
1. `'absent'` when no TSA_URL -- baseline regression guard for existing behavior
2. `'error'` on HTTP 500 -- the most likely production failure mode (Sectigo returning errors)
3. `'error'` on unreachable TSA -- covers network-level failures (DNS, timeout)

No log() assertions -- correct, since log() is a no-op without CORALOGIX_ENDPOINT.
Tests assert the observable return value (`timestampStatus`), not internal logging.

**Function signature stability**: buildWacz signature unchanged. Return type adds
one union member (`'error'`). capture.js already destructures timestampStatus and
passes it through without type-checking, so no downstream changes needed.

**Complexity budget**: zero new dependencies, zero new abstractions, zero new
services. Net addition is roughly 10 lines of production code and 3 test cases.

No findings to flag.
