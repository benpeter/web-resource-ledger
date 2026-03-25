# Meta-Plan: Merge Timestamp Checks into Single Time Verification Row

## Planning Consultations

#### Consultation 1: Time verification label hierarchy and wording
- **Agent**: ux-strategy-minion
- **Planning question**: The issue proposes merging two timestamp rows (standard RFC3161 + qualified eIDAS) into a single "Time verification" row showing the strongest tier. The target audience is lawyers, compliance officers, and archivists. Review the proposed label hierarchy and wording from the issue. Are the four state labels clear and trust-building for this audience? Should the "none" state say "No independent timestamp was obtained" (current) or something else? Is "Time verification" the right umbrella label, or does the legal audience expect different terminology?
- **Context to provide**: The issue's proposed display table, current CLI labels (`Timestamp imprint`, `Qualified timestamp`), current web labels (`Independent time verification`, `Qualified timestamp (eIDAS)`), and the check descriptions from `CHECK_DESCS` in verify-page.js.
- **Why this agent**: This is fundamentally a cognitive load and trust question for a specialized audience. UX strategy can evaluate whether the proposed merge reduces confusion without hiding information the audience needs.

#### Consultation 2: Merge pre-processing logic approach
- **Agent**: frontend-minion
- **Planning question**: The merge needs to happen in two places: `format.js` (CLI, Node.js) and `verify-page.js` (browser, vanilla JS inside a template literal). Both have `CHECK_LABELS` objects and rendering functions. What's the cleanest approach to implement the merge? Options: (a) a pre-processing function that transforms the `checks` array before rendering (replacing `timestamp`/`qualifiedTimestamp` entries with a single `timeVerification` entry), applied in both files independently; (b) modifying only the label mapping and rendering logic without changing the checks array. The pre-processing approach (a) seems cleaner because it keeps the rendering path unchanged. Confirm or suggest an alternative. Also: should `CHECK_ORDER` / `CHECK_LABELS` still list the old keys for any backward-compat reason (JSON output)?
- **Context to provide**: `format.js` (full file, 298 lines), relevant sections of `verify-page.js` (CHECK_LABELS, CHECK_DESCS, renderChecks, buildResult), and the test file. Note that `formatJson()` also uses `checkLabel()` -- the JSON output format may need to preserve backward compatibility.
- **Why this agent**: Implementation detail decisions about how to structure the merge logic across two rendering paths (CLI + web), and awareness of the JSON output contract.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The existing test file has factories (`makeSkipResult`) that specifically test the timestamp skip case. The merge changes what check names exist and how they display. Test-minion should advise on what test scenarios cover the four states (qualified only, standard only, both, none) and whether JSON output tests need updating for backward compatibility.
- **Security**: Exclude. This is a presentation-layer label change with no auth, input handling, or attack surface changes.
- **Usability -- Strategy**: ALWAYS include -- covered in Consultation 1 above.
- **Usability -- Design**: Exclude from planning. The change is label text and merge logic, not visual design or interaction patterns. The existing check-row layout is unchanged.
- **Documentation**: Include software-docs-minion for planning. The JSON output format (`formatJson`) includes check `name` and `label` fields. If the check name changes from `timestamp`/`qualifiedTimestamp` to `timeVerification`, this is a breaking change to the JSON API contract. software-docs-minion should advise on whether this needs API versioning or a deprecation note, and whether the verify page's CLI command section needs updating.
- **Observability**: Exclude. No runtime services, logging, or metrics changes.

### Notable Exclusions

- **api-design-minion**: The JSON output format change (check name rename) is adjacent to API design, but the scope is small enough that frontend-minion + software-docs-minion cover it. Would escalate if backward compatibility proves complex.
- **accessibility-minion**: The verify page already has `aria-hidden`, `sr-only` spans, and semantic HTML for checks. The merge doesn't change the interaction pattern or introduce new UI elements -- just changes label text and reduces rows.
- **security-minion**: Pure presentation-layer change with no new inputs, endpoints, or trust boundaries.

### Anticipated Approval Gates

None. This task has low blast radius (3 files, presentation-only), is easy to reverse (label/logic changes, no schema migration), and the issue already specifies the exact solution approach. No gate is warranted.

### Rationale

This is a focused presentation-layer task with a well-defined solution in the issue. The key planning questions are:

1. **Label wording** (ux-strategy-minion): Getting the labels right for a legal/compliance audience is the highest-risk aspect -- wrong wording could undermine the trust the feature is meant to build.
2. **Implementation approach** (frontend-minion): Two rendering paths need the same merge logic. The approach needs to handle four timestamp states correctly and preserve JSON output compatibility.
3. **Test coverage** (test-minion): The merge changes check names and introduces new state combinations that need test coverage.
4. **API contract** (software-docs-minion): The JSON output is a machine-readable contract. Renaming check fields is potentially breaking.

### Scope

**In scope:**
- Merge `timestamp` and `qualifiedTimestamp` check rows into a single `timeVerification` row in CLI output (`format.js`)
- Same merge in web verify page (`verify-page.js`)
- Update test assertions (`format.test.js`)
- Determine JSON output handling (backward compat vs. clean break)

**Out of scope:**
- Verification logic changes (the underlying checks still run independently)
- Data model changes
- New verification tiers
- Changes to the metadata block (TSA/QTSA details below the check table)

### External Skill Integration

No external skills detected relevant to this task. The ops-runbook skill in `.skills/` is infrastructure-focused and not applicable to this presentation-layer change.
