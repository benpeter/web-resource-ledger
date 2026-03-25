# API Spec Minion Review

Verdict: **ADVISE**

---

- [api-spec]: Task 1 prompt instructs the agent to count WRLAPIVersion insertions against total `headers:` occurrences (63), but 63 includes non-response uses that must not receive the header.
  SCOPE: openapi.yaml -- Task 1 prompt, Step 2 verification instruction
  CHANGE: Replace the count-verification instruction with: "After insertion, verify the count of `WRL-API-Version:` entries equals 57 (the number of response-level `headers:` blocks, excluding the `components/headers:` definition at line 53, the schema property named `headers` at line 341, and the 4 example URL strings containing `/artifacts/headers`)."
  WHY: The file contains exactly 63 `headers:` occurrences but only 57 are response-level blocks that should receive the header. If the agent uses 63 as the target count it will either insert duplicates or report a false mismatch and loop.
  TASK: Task 1

- [api-spec]: The Task 1 prompt states "OPTIONS responses are not explicitly defined in the spec" and instructs the agent not to add OPTIONS response definitions -- but one OPTIONS operation (`preflightCaptures` at `/v1/captures`) IS already defined in the spec with a `headers:` block at line 1836.
  SCOPE: openapi.yaml line 1836 -- `/v1/captures` OPTIONS 204 response headers block
  CHANGE: Replace the OPTIONS guidance with: "One OPTIONS operation (`preflightCaptures`) is already defined in the spec at `/v1/captures` with a 204 response headers block. Add `WRL-API-Version` to that block exactly as you would any other response headers block. Do NOT add new OPTIONS operation definitions -- the existing one is complete."
  WHY: The current guidance will cause the agent to either skip line 1836 (leaving one response missing the header) or be confused by the contradictory instruction. The OPTIONS response IS in the spec and its headers block is part of the 57 that need the header.
  TASK: Task 1

---

## Items verified as correct

- RFC attributions are correct: RFC 9745 (March 2025) for the Deprecation header, RFC 8594 for the Sunset header. These are different RFCs with different date formats, and the plan correctly distinguishes them.
- Deprecation header schema (`pattern: '^@\d+$'`, `example: '@1735689599'`) correctly reflects the RFC 9651 Structured Field Date wire format as required by RFC 9745.
- Sunset header schema (HTTP-date format, no pattern constraint) is correct per RFC 8594.
- The plan to define Deprecation and Sunset in `components/headers` but reference neither from any response definition at v1.0.0 is spec-correct: the spec should declare only what the API actually returns today.
- The `WRLAPIVersion` header component definition follows the existing PascalCase naming convention and uses the same `schema:` + `example:` pattern as the majority of existing header components.
- The plan to NOT add Deprecation/Sunset `$ref` references to response definitions at v1.0.0 is correct -- those headers appear only on actually-deprecated endpoints.
- The `example: 'sat'` format concern does not apply: `example: '1.0.0'` for the WRLAPIVersion schema is a valid string example in OpenAPI 3.1.0.
- Version bump from `0.8.0` to `1.0.0` in `info.version` is the correct field path.
