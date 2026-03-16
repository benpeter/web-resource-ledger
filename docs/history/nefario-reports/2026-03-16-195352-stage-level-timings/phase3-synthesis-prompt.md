MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Add stage-level timing instrumentation to `defaultRenderer()` so that per-stage durations (sessionAcquireMs, contextSetupMs, navigationMs, settleMs, consentMs, screenshotMs, contentMs) are visible in Coralogix logs and the capture API.

Success criteria:
- render metadata includes per-stage durations
- Stage timings flow into KV record and visible via GET /v1/captures/:id
- Structured log event with individual stage durations emitted to Coralogix
- All existing tests pass unchanged
- No change to capture behavior or timing (instrumentation only)

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9aXQ3r/stage-level-timings/phase2-observability-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9aXQ3r/stage-level-timings/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9aXQ3r/stage-level-timings/phase2-test-minion.md

## Key consensus across specialists:

1. observability-minion: Flat top-level fields on log events, null for skipped stages, replace consentDurationMs with consentMs, keep durationMs as total
2. api-design-minion: Nest under render.stages sub-object, null for skipped stages, new RenderStages OpenAPI component, durationMs stays as-is
3. test-minion: Keep existing stubs as-is, critical toEqual assertions on render object in capture-retrieval.test.js:137 and kv.test.js:318 will break if render shape changes, recommends sibling field to avoid breakage

KEY CONFLICT: Where to put stage timings in the API/KV record.
- observability wants flat on log events (no conflict with API shape since they agree log and API can differ)
- api-design wants nested render.stages
- test-minion warns render.stages breaks toEqual assertions -- recommends separate sibling field

RESOLUTION DIRECTION: The api-design recommendation of render.stages is clean API design. The toEqual test assertions should be updated (additive property in an existing object is a normal API evolution; tests should match the new shape). The log shape can differ from the API shape -- flat fields on logs. This satisfies all three domains.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve the flat-vs-nested conflict for API and the test breakage concern
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format with self-contained task prompts
5. This is instrumentation-only, KISS applies -- minimize the number of tasks
6. Ensure every task has a complete, self-contained prompt
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9aXQ3r/stage-level-timings/phase3-synthesis.md
