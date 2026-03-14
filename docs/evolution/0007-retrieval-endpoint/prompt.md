# MVP Step 5: Retrieval Endpoint

GitHub Issue #5

## Task Description

Add `GET /v1/captures/{id}` (metadata + artifact links) and
`GET /v1/captures/{id}/artifacts/{name}` (raw artifact download).

Complete the capture lifecycle: submit, poll, retrieve.

## Acceptance Criteria (from issue)

- `GET /v1/captures/{id}` returns JSON metadata with artifact URLs for a
  known complete capture
- Unknown capture IDs return RFC 9457 404
- Response time <300ms (KV lookup + JSON serialization, no computation)

## Orchestration

Executed via `/nefario #5 use sonnet throughout as the model for agents`.

Sonnet used for all execution agents. Opus used for governance reviewers
(lucy, margo).
