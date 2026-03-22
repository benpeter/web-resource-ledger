# Phase 0043: Batch Capture Endpoint

## Source

GitHub Issue #48: R18: Batch capture endpoint

## Task Description

**Outcome**: Legal teams, monitoring services, and CI pipelines can archive multiple pages in one API call, enabling bulk archival workflows.

**Success criteria**:
- `POST /v1/captures/batch` accepts array of URLs (up to configurable limit)
- Per-URL validation (SSRF prevention applied to each)
- 207 Multi-Status response with per-URL outcome
- Rate limit interaction designed (batch counts as N requests against quota)
- OpenAPI spec updated
- Tests cover: mixed success/failure, rate limit exhaustion mid-batch, max batch size

**Scope**:
- In: New batch endpoint, per-URL validation, 207 response format, rate limit interaction, OpenAPI update, tests
- Out: Batch status tracking UI, priority ordering within batch, scheduled batch execution

**Constraints**:
- R1 (list endpoint) and R5 (rate limit headers) should ship first
- Rate limit interaction must be designed upfront — a batch of 50 URLs that silently consumes the entire rate limit budget is hostile DX
