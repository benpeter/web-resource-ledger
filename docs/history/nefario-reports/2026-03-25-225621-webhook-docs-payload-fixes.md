---
task: "Webhook docs & payload fixes (#212)"
date: 2026-03-25
slug: webhook-docs-payload-fixes
source-issue: 212
mode: execution
task-count: 3
gate-count: 3
---

## Summary

Fixed webhook documentation-vs-code discrepancies and added missing payload data.
The `capture.complete` webhook payload now includes artifact URLs (screenshot, html,
headers). The ping endpoint response now echoes signature fields so callers can test
verification logic end-to-end. Nine documentation corrections align the webhook guide
with actual API behavior. OpenAPI spec updated to match all changes.

## Original Prompt

Fix webhook docs-vs-code discrepancies and add missing payload data (GitHub issue #212).

Outcome: Webhook documentation accurately reflects the actual API behavior, the
`capture.complete` payload includes artifact URLs so consumers can act on webhooks
without a follow-up API call, and the ping endpoint response includes signature
headers so callers can verify their verification logic end-to-end.

## Key Design Decisions

### Flat Signature Echo (over Nested Object)
Ping response adds `signatureHeader`, `timestampHeader`, `sentPayload` as flat
fields at the response root. Matches existing response shape. api-design-minion
proposed; ux-strategy-minion preferred nesting; synthesis chose flat (KISS).

### Always-Present Artifact URLs
All three artifact URLs included in every `capture.complete` payload regardless
of what was stored. 404 for missing artifacts is simpler than conditional field
presence for consumers.

### sentPayload as Raw String
Echoed as the exact JSON string sent to the endpoint, not a parsed object.
Consumers need the exact bytes for HMAC signature verification.

## Phases

### Phase 1: Meta-Plan
Identified 4 specialists: api-design-minion (response shape), user-docs-minion
(documentation corrections), ux-strategy-minion (debugging experience),
test-minion (test structure).

### Phase 2: Specialist Planning
All 4 specialists contributed. Key consensus: flat signature fields, always-present
artifacts, document quarantined fully. Conflict: flat vs nested signature echo.

### Phase 3: Synthesis
Resolved flat-vs-nested in favor of flat. Produced 3-task execution plan with
3 approval gates.

### Phase 3.5: Architecture Review
7 reviewers (5 mandatory + 2 discretionary). All APPROVE or ADVISE. user-docs-minion
and ux-strategy-minion ADVISE notes incorporated (troubleshooting entry, signature
debugging docs). No BLOCKs.

### Phase 4: Execution
Task 1+2 (combined): Code changes to webhook-dispatch.js and webhooks.js.
Task 3: Documentation corrections to webhooks.md. Lucy caught incorrect diffUrl
pattern at Task 3 gate — fixed before commit.

### Phase 5-8: Verification
Code review: no critical findings (2 non-blocking ADVISE accepted as-is).
Tests: all 1524 pass (60 files, 2 pre-existing skips).
Documentation: Phase 8a assessment identified 4 OpenAPI spec items (2 MUST, 2 SHOULD).
Phase 8b: OpenAPI spec updated directly by orchestrator — all items resolved.

## Agent Contributions

### Planning (Phase 2)
- **api-design-minion**: Flat signature echo fields, always-present artifact URLs,
  sentPayload as raw string
- **user-docs-minion**: 10-finding discrepancy map, quarantined documentation strategy,
  retry label correction
- **ux-strategy-minion**: Debugging workflow design, nested signature proposal (rejected)
- **test-minion**: 5 test case designs matching existing patterns

### Review (Phase 3.5)
- **security-minion**: APPROVE — no new attack surface
- **test-minion**: APPROVE — adequate coverage
- **ux-strategy-minion**: ADVISE — signature debugging prominence
- **lucy**: APPROVE — plan aligns with intent
- **margo**: APPROVE — no over-engineering
- **user-docs-minion**: ADVISE — troubleshooting entry addition
- **gru**: APPROVE — no technology decisions

## Execution

| Task | Agent | Files | Outcome |
|------|-------|-------|---------|
| 1+2: Code changes | sonnet | src/webhook-dispatch.js, src/webhooks.js | Artifacts + signature echo |
| 3: Docs corrections | sonnet | site/content/webhooks.md | 9 fixes applied |
| 8b: OpenAPI updates | orchestrator | openapi.yaml | PingResponse schema + examples |

## Decisions

1. **Flat signature echo** — Chosen: flat fields. Over: nested object (ux-strategy-minion). Why: matches existing response shape, KISS.
2. **Always-present artifacts** — Chosen: always include 3 URLs. Over: conditional presence. Why: 404 simpler than optional fields.
3. **sentPayload raw string** — Chosen: raw JSON string. Over: parsed object. Why: exact bytes needed for HMAC verification.
4. **Document quarantined** — Chosen: full section. Over: remove from VALID_EVENTS. Why: code path exists and works.
5. **Retry label** — Chosen: "fixed schedule of increasing delays". Over: "exponential backoff". Why: [60,300,900] is not exponential.
6. **Ping event ID** — Chosen: set to `evt_000...000`. Over: leave as null. Why: sentinel value is self-documenting.

## Verification

Verification: all checks passed.
- Code review: 2 non-blocking findings accepted as-is
- Tests: 1524 passed, 0 failed (60 files)
- OpenAPI lint: valid (12 pre-existing warnings)
- Documentation: 4 OpenAPI items identified and resolved

## Test Plan

- [x] All existing webhook tests pass
- [x] New test: capture.complete payload includes artifacts URLs
- [x] New test: artifacts use VERIFICATION_BASE_URL when set
- [x] New test: capture.failed excludes artifacts
- [x] New test: capture.quarantined excludes artifacts
- [x] New test: ping response includes signatureHeader, timestampHeader, sentPayload

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — orchestration workflow

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-25-225621-webhook-docs-payload-fixes/`

Files: prompt.md, phase1-metaplan-prompt.md, phase1-metaplan.md,
phase2-{api-design,user-docs,ux-strategy,test}-minion{-prompt,}.md,
phase3-synthesis{-prompt,}.md, phase3.5-{security,test,ux-strategy,lucy,margo,user-docs,gru}.md,
phase8-checklist.md

</details>

Resolves #212
