# Domain Plan Contribution: software-docs-minion

## Recommendations

### Question 1: OpenAPI spec timing -- contract-first, not alongside

**Write the spec before implementation.** This is not a close call. The project already committed to it: MVP.md line 44 says "An OpenAPI spec (`openapi.yaml`) is maintained as the API's source of truth," and the Gray Zone Decisions table explicitly marks it **IN** with the rationale that the "small surface area makes spec maintenance low-cost."

However, MVP.md Step 8 defers the full OpenAPI spec to after all endpoints are built. That plan made sense when the API surface was unbuilt. Now we are at Step 3, which introduces the first real API endpoints -- `POST /v1/captures` and `GET /v1/captures/{id}/status`. These are the first endpoints that return structured JSON bodies beyond the trivial `{"status":"ok"}` health check. This is the right moment to start the spec, not Step 8.

The argument for contract-first at this step:

1. **The response shapes are already designed.** MVP.md specifies the 202 body (capture ID + status URL), the status response shape (`pending|complete|failed`), and the error shape (RFC 9457). The spec is mostly transcription of existing decisions.

2. **It constrains the implementer.** Writing the spec first forces a clear answer on questions that would otherwise be resolved ad hoc during implementation: What exact field names does the 202 body use? Is the status URL absolute or relative? What happens when the status endpoint gets a malformed ID vs. a valid-format ID that does not exist? The spec makes these decisions explicit before anyone writes code.

3. **It prevents retroactive rationalization.** If the spec is written after implementation, it documents what was built, not what was intended. Any accidental divergence from the MVP.md design gets enshrined as the contract. Writing the spec first makes the contract the authority.

4. **It stays small.** Two endpoints plus the health check. The spec will be ~150-200 lines of YAML. This is not a burden.

**Recommended approach**: Write an `openapi.yaml` at the project root covering the three endpoints that will exist after Step 3 (`GET /health`, `POST /v1/captures`, `GET /v1/captures/{id}/status`). Use OpenAPI 3.1 (supports JSON Schema 2020-12 natively, which makes RFC 9457 `application/problem+json` representation cleaner). Add endpoints for Steps 5-7 as those steps are implemented. Step 8 then becomes a hardening/validation step for the spec, not the initial authoring step.

**What NOT to do**: Don't spec endpoints that do not exist yet (Steps 5-7). That is speculative documentation. Spec what Step 3 builds, and extend the spec as each step lands.

### Question 2: Documentation artifacts that need updating

The project has mandatory documentation requirements (CLAUDE.md is explicit that these are non-negotiable). For Step 3, these artifacts need attention:

**Must update (project requirements)**:

1. **`docs/evolution/0005-capture-endpoint/`** (or whatever the next sequence number is) -- `prompt.md` before starting, `decisions.md` during implementation, `outcome.md` after, `process.md` after PR creation. This is a CLAUDE.md requirement. The sequence number depends on whether there are intervening phases; check the evolution log index at the time of creation.

2. **`docs/evolution/README.md`** -- Add the new phase entry to the index table.

3. **`docs/backlog.md`** -- Review after the phase. Step 3 may resolve or partially address items like "Rate limit headers in responses" (if rate limiting is configured), "CORS configuration" (if CORS headers are added to the capture endpoint), or "TOCTOU gap mitigation" (if the browser rendering integration reveals anything new about the DNS re-resolution issue). Items deferred from Step 3 planning should be added.

4. **`openapi.yaml`** (new file) -- As argued in Question 1, created as part of this step.

**Should update (good practice, not mandated)**:

5. **JSDoc in new source files** -- The existing codebase sets a high standard. `responses.js` has a block comment convention. `url-validation.js` has a detailed module header plus JSDoc on every exported function. New modules for capture handling should follow the same density level.

6. **Test file organization** -- Continue the pattern from Step 2: descriptive `describe`/`it` names that read as a security and behavioral catalog.

**Should NOT update**:

7. **README.md** -- Does not exist yet (only `docs/evolution/README.md` exists). Do not create a project-level README for this step. The project does not have external users yet. When a README is needed (likely at or after MVP completion), it should cover the full API surface, not be incrementally updated per step.

### Question 3: Modeling RFC 9457 errors and custom JSON successes in OpenAPI

This is the most technically interesting question. The codebase already has clean conventions that map directly to OpenAPI.

**RFC 9457 Problem Detail (`application/problem+json`)**:

The shape from `src/responses.js` is:

```yaml
ProblemDetail:
  type: object
  required: [type, status, title, detail]
  properties:
    type:
      type: string
      format: uri
      default: "about:blank"
      description: Problem type URI. Always "about:blank" per RFC 9457 section 4.2.1.
    status:
      type: integer
      minimum: 400
      maximum: 599
      description: HTTP status code.
    title:
      type: string
      description: Short human-readable summary. Derived from status code.
    detail:
      type: string
      description: Human-readable explanation specific to this occurrence.
```

Key modeling decisions:

- **`type` is always `about:blank`**: The codebase hardcodes this (line 22 of `responses.js`). The spec should reflect this with `default: "about:blank"` and a description note. Per RFC 9457 section 4.2.1, when `type` is `about:blank`, `title` SHOULD match the HTTP status phrase, which the code already does via the `titles` lookup.

- **Content-Type is `application/problem+json`**: This is already set in `responses.js`. The OpenAPI spec must use this media type for error responses, not `application/json`. This is a meaningful distinction -- clients can switch on Content-Type to determine whether they received a success or a problem detail.

- **Use OpenAPI 3.1's `content` per status code**: Each error status code (400, 401, 404, 422) gets its own response entry with `application/problem+json` content type and a `$ref` to the shared `ProblemDetail` schema. Include a concrete `example` for each status code showing a realistic `detail` message (e.g., for 422: `"Host resolves to a private IP address"`).

**Custom JSON success responses**:

The 202 Accepted response for `POST /v1/captures` should be modeled as:

```yaml
CaptureAccepted:
  type: object
  required: [id, statusUrl]
  properties:
    id:
      type: string
      pattern: "^cap_[a-f0-9]{32}$"
      description: Capture identifier.
      example: "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    statusUrl:
      type: string
      format: uri
      description: Absolute URL to poll for capture status.
      example: "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status"
```

The status response:

```yaml
CaptureStatus:
  type: object
  required: [status]
  properties:
    status:
      type: string
      enum: [pending, complete, failed]
      description: Current capture processing state.
```

**Practical modeling notes**:

- **Discriminate success vs. error by Content-Type**, not by schema shape. The OpenAPI spec should make it clear that `application/json` = success, `application/problem+json` = error. This matches the existing `responses.js` implementation and is the RFC 9457 intent.

- **Include `examples` (plural, OpenAPI 3.1) for each response**. The project philosophy is "more code, less blah blah" -- concrete examples communicate faster than schema descriptions. Show what a real 202 response looks like, what a 401 looks like, what a 404 on the status endpoint looks like.

- **Field name for the status URL**: MVP.md does not specify the field name. This must be decided before implementation. I recommend `statusUrl` (camelCase, consistent with JS conventions in the codebase). Alternatives: `status_url` (snake_case, more common in REST APIs), `statusHref` (more precise), `location` (semantically loaded -- conflicts with the HTTP `Location` header convention). The spec should settle this.

- **Capture ID format**: MVP.md says `cap_` + `crypto.randomUUID()` with hyphens stripped. That produces `cap_` + 32 hex chars = 36 chars total. The spec should define the pattern `^cap_[a-f0-9]{32}$` so clients can validate IDs without hitting the API.

## Proposed Tasks

### Task 1: Create `openapi.yaml` with Step 3 endpoints (contract-first)

**What**: Write the OpenAPI 3.1 spec covering `GET /health`, `POST /v1/captures`, and `GET /v1/captures/{id}/status`. Define shared schemas for `ProblemDetail` (RFC 9457), `CaptureAccepted` (202 body), and `CaptureStatus`. Include realistic examples for every response (success and each error case). Add security scheme for Bearer token auth on `POST /v1/captures`.

**Deliverables**: `openapi.yaml` at the project root.

**Dependencies**: Must be written before implementation begins. The implementing agent should treat the spec as the contract and validate their implementation against it. If the implementation reveals a spec problem, update the spec (contract stays authoritative).

**Sizing**: ~150-200 lines of YAML. Small enough that it does not need a review step separate from the PR review.

**Decision needed from the planning team**: The field name for the status URL in the 202 response body. My recommendation is `statusUrl`. This should be settled in the planning phase so the spec and implementation agree.

### Task 2: Evolution log for this phase

**What**: Create `docs/evolution/NNNN-capture-endpoint/` with `prompt.md` (before implementation), `decisions.md` (during), `outcome.md` (after), `process.md` (after PR).

**Deliverables**: Four files in the evolution log directory. Entry added to `docs/evolution/README.md`.

**Dependencies**: Directory and `prompt.md` must exist before implementation starts (CLAUDE.md rule #1). `decisions.md` must capture decisions as they happen, not backfilled (CLAUDE.md rule #2). `outcome.md` and `process.md` after PR creation.

**Note**: This is a mandatory project requirement, not an optional documentation task. Including it as an explicit task to prevent the skip-during-wrap-up failure mode that has occurred previously.

### Task 3: Backlog review after phase completion

**What**: Review `docs/backlog.md` after Step 3 is complete. Add any items deferred from this step. Mark any items that Step 3 resolved. Adjust tiers if the implementation revealed new information. Record changes in the "Backlog changes" section of `outcome.md`. If no changes, state that explicitly.

**Deliverables**: Updated `docs/backlog.md` (if changes needed). "Backlog changes" section in `outcome.md`.

**Dependencies**: Happens after implementation, before `outcome.md` is finalized.

### Task 4: JSDoc and inline documentation in new source files

**What**: Any new modules created for Step 3 (capture handler, browser rendering integration, KV status management) should follow the documentation density established in `url-validation.js` and `responses.js`:
- Module-level block comment establishing purpose and trust boundaries
- JSDoc on exported functions with parameter/return types
- `// SECURITY:` inline comments where security-relevant behavior is non-obvious
- Comment block conventions documented at the top of modules where patterns are established (like `responses.js` lines 1-5)

**Deliverables**: Documentation within source files, written during implementation.

**Dependencies**: Integral to implementation, not a separate step. This is guidance for the implementing agent.

## Risks and Concerns

### Risk 1: Spec-implementation drift within the same step

Writing the spec first introduces a risk: the implementer discovers during Browser Rendering integration that the spec needs to change (e.g., an additional error case, a different field shape). Mitigation: treat the spec as mutable during the step. If the implementation reveals a spec problem, update the spec in the same PR. The spec is authoritative, but it is not frozen until the PR merges.

### Risk 2: Status URL field name decided ad hoc

If nobody settles the 202 response field names before implementation, the implementer will pick something and the spec will follow. That is implementation-first in disguise. The planning phase should settle at minimum: field names for the 202 body, whether the status URL is absolute or relative, and whether the status response includes any metadata beyond the `status` field.

### Risk 3: OpenAPI spec becomes a Step 8 "rewrite" instead of incremental

If the spec is not started now, Step 8 requires writing a complete spec for all endpoints from scratch. That is both harder (more surface area to cover at once) and riskier (more likely to diverge from what was actually built in Steps 3-7). Starting now with two endpoints and extending incrementally is the lower-risk path.

### Risk 4: Evolution log skipped during orchestration wrap-up

This has happened before in this project (documented in the feedback memory). The orchestration process must explicitly include evolution log creation as a gate, not an afterthought. `prompt.md` existence should be verified before the implementation agent starts.

### Risk 5: Over-specifying the capture endpoint before Browser Rendering behavior is known

There is a tension between contract-first and the fact that Cloudflare Browser Rendering may impose constraints not visible until implementation. For example: does Browser Rendering return errors that need new status codes? Can it timeout in ways that require a specific error shape? The spec should define the happy path and known error cases from MVP.md, but the implementer should have latitude to add error responses that Browser Rendering's behavior requires. The spec is the starting contract, not the final word.

## Additional Agents Needed

**api-design-minion** should weigh in on the 202 response body shape if not already part of this planning round. Specifically: the field names (`id` vs `captureId`, `statusUrl` vs `status_url` vs `_links.status`), whether the status URL is absolute or relative, and whether the 202 should include any additional metadata (e.g., the submitted URL echoed back, the timestamp of acceptance). These are API design decisions that should not be resolved by the documentation or implementation agents.

If api-design-minion is already part of this planning phase, no additional agents are needed. The current team (api-design, security, test, implementation) plus documentation guidance here is sufficient.
