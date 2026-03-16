# Decisions: 0021 Documentation Drift Audit

## PRODUCT.md and MVP.md: keep in place with status headers vs. move to evolution log

**Context**: Both files are pre-implementation documents now contradicted by the built system. ux-strategy-minion recommended moving them to `docs/evolution/0001-kickoff/` to eliminate competing narratives in the repo root. software-docs-minion recommended keeping them in place with status header blockquotes.

**Decision**: Keep in place with status headers.

**Rationale**:
- 20+ cross-references from `docs/backlog.md` and evolution log entries would break
- Evolution log is append-only by project convention — moving files there edits history
- Status headers address the cognitive load concern: a newcomer reading either file immediately sees it's historical and is directed to README/backlog
- Neither file is linked from README or GitHub's rendered entry point — you have to actively click into them
- KISS: 2-line change per file vs. multi-file refactor with reference-repair risk

**Alternative rejected**: Move to `docs/evolution/0001-kickoff/`. Higher information architecture purity but breaks existing cross-references and violates the append-only convention.

## OPTIONS preflight in OpenAPI spec: include vs. omit

**Context**: software-docs-minion recommended omitting OPTIONS (it's a browser transport concern, not API contract). api-spec-minion recommended including it (the route handler exists, returns specific headers, and is testable behavior).

**Decision**: Include OPTIONS.

**Rationale**: The spec documents what the server does, not what API consumers call intentionally. Omitting it means contract test tools (Schemathesis) would flag it as unexpected. The route exists at `src/index.js:55-67` with defined behavior.

## POST /v1/captures error responses: inline vs. shared components

**Context**: The POST endpoint needs CORS headers (Access-Control-Allow-Origin, Vary) on error responses, which other endpoints don't. This required either inlining the error responses with CORS headers or modifying shared Problem components.

**Decision**: Inline error responses for POST /v1/captures.

**Rationale**: Adding CORS headers to shared Problem components would incorrectly add them to non-POST endpoints. Inlining keeps the CORS-specific behavior scoped to the endpoint that needs it. Trade-off: ~120 lines of duplication. Margo flagged this in review — acceptable for now, extract shared CORS components if a second CORS endpoint is added.

## Pre-PR#54 captures edge case note: include vs. omit

**Context**: Task 2 prompt included a note about pre-key-versioning captures falling back to the current key. User indicated no such captures exist.

**Decision**: Omit the edge case note.

**Rationale**: No captures were created before key versioning shipped. Documenting a non-existent edge case would confuse deployers.
