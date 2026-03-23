# Phase 0062: Process

## TL;DR

Seven specialists planned, six reviewed, three executed. The biggest impact
came from Phase 3.5 reviewers (lucy and margo) who stripped three YAGNI
features from the synthesis -- revocation endpoint, label field, and
per-capture token limit -- before a single line of code was written.
Execution produced 4 commits across 3 agents: security-minion (core auth
gate + share tokens + tests), devx-minion (CLI token propagation), and
software-docs-minion (SECURITY.md, README, OpenAPI, backlog). Code review
caught two real issues: quarantined capture share tokens and missing
try/catch on D1 write. 49 test files, 1174 tests pass.

## Planning Phase

### Team Selection (Phase 1)

Nefario selected seven specialists:

- **security-minion** — primary domain owner. Auth gate, token format,
  threat model, SECURITY.md. Asked to evaluate route-level vs per-handler
  auth, opaque vs HMAC tokens, and 404-vs-403 for cross-tenant.
- **data-minion** — D1 schema design. Asked about column set, index
  strategy, token_hash lookup patterns, per-capture limits.
- **api-design-minion** — API contract for POST /share, query parameter
  naming, response shapes, 410 vs 404 for expired tokens.
- **devx-minion** — CLI backward compatibility. Asked to evaluate HMAC
  signed URLs vs --token flag vs URL propagation.
- **test-minion** — test strategy for auth gates, tenant isolation, token
  lifecycle.
- **ux-strategy-minion** — user journey impact of switching from "ID as
  secret" to "private by default with sharing."
- **software-docs-minion** — SECURITY.md restructuring, documentation scope.

Notable exclusions: oauth-minion (no OAuth changes), frontend-minion (no
UI changes), edge-minion (no CDN changes).

### What Each Specialist Argued (Phase 2)

**security-minion** proposed opaque random tokens with SHA-256 hash storage
(following the existing api_keys pattern), route-level auth gate in fetch(),
and mutual exclusion of share token and API key auth to prevent
confused-deputy attacks. Recommended `stk_` prefix.

**data-minion** designed the share_tokens table with token_hash PK, capture
and tenant FKs, three indexes (capture lookup, tenant listing, expiry
cleanup via partial index). Suggested a 20-token-per-capture limit.

**api-design-minion** proposed `wrl_share_` prefix (consistent with
`wrl_live_` API keys), 410 Gone for expired tokens (information leak is
acceptable because tokens are intentionally shared), and allowing share
creation on pending captures (not just complete).

**devx-minion** proposed three CLI approaches: (A) HMAC-signed ephemeral
URLs in verify response, (B) --token CLI flag, (C) URL-based token
propagation. Favored option A initially but flagged dual-token confusion
risk.

**test-minion** mapped the full test matrix: auth paths (API key, session,
share token, unauthenticated), tenant isolation (same tenant, cross-tenant,
non-existent), share token lifecycle (valid, expired, invalid format), and
CLI backward compatibility.

**ux-strategy-minion** analyzed the user journey transition from "URL is the
secret" to "URL + auth." Flagged that the share token UX should be
zero-friction: paste a URL, it works. No --token flags, no manual extraction.

**software-docs-minion** identified the SECURITY.md restructuring scope:
remove "known gap" paragraph, add Access Model / Share Token Design / Threat
Analysis sections.

### Where They Disagreed

Three main conflicts emerged during synthesis:

1. **CLI backward compatibility** — devx-minion initially favored HMAC-signed
   ephemeral URLs (option A), but security-minion and ux-strategy-minion
   both pushed back: HMAC adds a second token mechanism and turns the public
   verify endpoint into a download vector. devx-minion's own concern about
   dual-token confusion tipped the decision toward option C (URL-based token
   propagation). This was the simplest approach: tenant generates a share URL,
   gives it out, recipient pastes it into `npx @w-r-l/verify` — done.

2. **Token prefix** — security-minion proposed `stk_`, data-minion and
   api-design-minion both proposed `wrl_share_` for consistency with
   `wrl_live_` API keys. Practical argument won: consistent naming lets the
   auth gate route tokens to the correct lookup table by prefix without
   trying both. 2-to-1 consensus.

3. **Expired token response** — api-design-minion argued for 404 everywhere
   to prevent information leakage. The issue spec said 410 Gone. Decision:
   follow the spec. The information leaked (that a token once existed) is
   acceptable because the token was intentionally shared. The 410 helps
   legitimate users understand why their link stopped working.

### Architecture Review (Phase 3.5)

Six reviewers examined the synthesis. The most impactful verdicts came from
the scope-checking agents:

**margo** (ADVISE) flagged three YAGNI violations:
- Per-capture token limit of 20 — "No user has requested this limit. No
  performance data justifies it. The limit adds a count query on every
  INSERT, a constant to maintain, a 422 error path to test, and a
  user-facing error message to document."
- `label` field — "No endpoint lists share tokens to a user. Without a list
  view, labels are write-only data."
- Revocation endpoint — "The user drew a clear line: revocation is out of
  scope. The plan crosses it."

**lucy** (ADVISE) independently flagged the same revocation endpoint and
label field as out of scope, plus caught a file ownership issue: Task 3
(software-docs-minion) was instructed to modify src/index.js comments, but
Task 1 already owns that file. Moved to Task 1 to prevent merge conflicts.

**security-minion** (ADVISE) raised several low-severity items including
variable naming preference (`isCaptureGetRoute` over `isCaptureReadRoute`
since POST /share is also a read route conceptually) and a note about raw
token exposure in auth context.

**api-design-minion** (ADVISE) refined error response consistency and
share token scoping details.

**test-minion** and **ux-strategy-minion** both APPROVEd.

All three YAGNI items (revocation, label, per-capture limit) were removed
from the schema and execution plan before any code was written. This was
the highest-leverage review outcome: three features eliminated, zero
implementation effort wasted.

## Execution Phase

### Task 1: Security-minion (core implementation)

The largest task: D1 migration, share-tokens.js module, auth gate in
fetch(), share endpoint, tenant isolation in all handlers, and
comprehensive tests.

Key implementation details:
- Auth gate placed after account-route gate in fetch(), before route
  dispatch — follows the established codebase pattern
- Share token and API key auth are mutually exclusive (prevents
  confused-deputy attacks where an expired token falls back to session auth)
- env._captureAuth carries auth context (follows env._session pattern)
- Raw token NOT stored in auth context (margo flagged this) — handlers
  extract from URL params directly when needed for artifact URL propagation
- handleListCaptures refactored to use env._captureAuth instead of its own
  internal verifyAuth() call (consistency win)

Gate approved with the implementation. Two downstream concerns noted
(CLI updates, docs) were correctly identified as Task 2 and Task 3
responsibilities.

### Task 2: devx-minion (CLI update)

Updated `packages/verify/lib/key-resolver.js`:
- `fetchWaczFromCaptureUrl()` detects `?token=` in input URL and forwards
  to artifact download
- `isWrlCaptureUrl()` handles URLs with query parameters
- 401 responses produce actionable error message explaining share tokens
- Version bump 0.1.0 → 0.2.0
- README updated with share URL examples

### Task 3: software-docs-minion (documentation)

Updated SECURITY.md (removed known-gap paragraph, added Access Model /
Share Token Design / Threat Analysis), README.md (removed all "ID as
secret" references, added auth headers to curl examples, new "Sharing
captures" section), openapi.yaml (shareToken security scheme, POST /share
endpoint, 401/410 responses), backlog.md (parking lot items for revocation,
analytics, auto-share), and site content pages.

## Post-Execution Verification

### Code Review (Phase 5)

Three reviewers (code-review-minion, lucy, margo). Result: 1 APPROVE, 2
ADVISE, 0 BLOCK.

Two substantive findings from code-review-minion:

1. **Quarantined capture check** — `handleCreateShare` blocked `failed`
   captures but silently allowed `quarantined` captures. A share token for a
   quarantined capture is technically valid but useless (artifacts return
   451). Fixed by adding `|| record.status === 'quarantined'` to the status
   check.

2. **Missing try/catch** — `createShareToken(env.DB, {...})` had no
   try/catch. If D1 fails, error propagates unlogged as 500. Every other D1
   write in the file wraps with try/catch and logs. Fixed with proper error
   handling, logging, and 500 response.

Lucy flagged documentation completions (evolution log index, process.md,
backlog Done section) — all addressed during wrap-up.

### Tests (Phase 6)

49 test files, 1174 tests pass, 2 skipped (batch capture edge cases). No
regressions introduced. Full test run: 18.76s.

### Documentation (Phase 8)

Phase 8a assessment found all documentation items were already addressed
by Task 3 during execution. No Phase 8b needed.

## Human Interventions

This phase ran in autonomous mode with Lucy acting as gate approver. No
human interventions during execution.

Key autonomous decisions:
- Lucy approved the team selection (7 specialists)
- Lucy approved the reviewer selection (5 mandatory + 1 discretionary)
- Lucy approved the execution plan after Phase 3.5 scope reductions
- Lucy approved the Task 1 gate, correctly noting that downstream concerns
  (CLI, docs) belonged to Tasks 2 and 3
- Post-execution option: "Run all" (code review, tests, docs)

## Where to Read More

- Full specialist discussions: `docs/history/nefario-reports/` (companion
  directory for this phase's report)
- Decisions with rationale: [decisions.md](decisions.md)
- What was produced: [outcome.md](outcome.md)
- Original prompt: [prompt.md](prompt.md)
