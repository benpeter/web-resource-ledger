# Margo Review -- Verification Endpoint

## Verdict: ADVISE

The plan is well-scoped and proportional to the problem. Four tasks for one
endpoint with a security-critical core is reasonable. No new dependencies are
introduced. The approval gate on Task 1 is correctly placed. The complexity
budget is modest: one new source file, modifications to two existing files, two
test files. No scope creep detected -- this delivers what the issue asks for.

Three concerns, none blocking:

---

### 1. [YAGNI]: `skip` status adds unused optionality
  SCOPE: Response schema -- `checks[].status` enum includes `pass | fail | skip`
  CHANGE: Use `pass | fail` only. Drop `skip` from the enum. No check in the
  current plan ever produces `skip`. If a future check needs it, add it then.
  WHY: The `skip` value is justified by "forward-compatibility" for checks that
  don't yet exist. That is textbook YAGNI. The schema can be extended later
  without breaking consumers (adding a new enum value is backward-compatible).
  Carrying an unused state through the implementation and tests adds cognitive
  load for zero current value.
  TASK: 1, 3

### 2. [Scope deviation]: Cache-Control departs from issue spec without flagging the tradeoff
  SCOPE: Cache-Control header strategy in Task 2
  CHANGE: The issue specifies `Cache-Control: public, immutable, max-age=31536000`.
  The plan changes this to `max-age=86400, stale-while-revalidate=604800` for
  verified responses and `no-store` for failed ones. The security reasoning
  (key-rotation concern) is sound, but the issue's technical note explicitly
  argues immutable caching is safe because "the capture ID is content-addressed."
  Document this as a deliberate deviation in the evolution log's `decisions.md`
  with the rationale, so the decision is traceable.
  WHY: Undocumented departures from acceptance criteria create confusion when
  reviewing whether the issue is "done." The deviation is justified; it just
  needs to be visible.
  TASK: 2

### 3. [Complexity]: `capture` metadata in verification response duplicates retrieval endpoint
  SCOPE: Response body -- `capture: { id, url, createdAt, completedAt }` in
  Task 2's verify response
  CHANGE: Consider whether the `capture` field is needed. The caller already
  knows the capture ID (they put it in the URL), and can fetch full metadata
  from `GET /v1/captures/{id}`. Including it in the verification response
  duplicates data that is authoritatively available elsewhere. At minimum,
  trim to just `capture.id` -- the other fields add payload without serving
  the verification use case.
  WHY: Duplicated data across endpoints creates maintenance surface -- if
  the retrieval response shape changes, the verify response must track it.
  The issue's response shape spec shows `"capture": { ... }` but does not
  mandate specific sub-fields. Leaner is better unless a consumer need is
  identified.
  TASK: 2
