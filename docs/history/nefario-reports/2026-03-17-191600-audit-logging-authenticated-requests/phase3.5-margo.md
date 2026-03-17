# Margo -- Complexity Review

## Verdict: ADVISE

The plan is well-scoped and proportional to the problem. The core decision -- enriching existing log() calls rather than building a separate audit subsystem or extraction module -- is exactly right. No new files, no new abstractions, no new dependencies. This is KISS/YAGNI done correctly.

Three non-blocking concerns follow.

---

### Finding 1: Task 1 prompt contains a wandering decision monologue about cip plumbing

**What is complex:** The Task 1 prompt dedicates ~20 lines to deliberating aloud about how to get `cip` into admin handlers (pass as 5th arg? attach to request? compute independently?), arriving at "compute in each handler" only after exploring and discarding two alternatives inline. The executing agent receives conflicting instructions before the final answer.

**Why it appears accidental:** The deliberation is synthesis-phase reasoning that leaked into the execution prompt. The executing agent does not need to see rejected approaches -- it needs one clear instruction.

**Simpler alternative:** Replace the multi-paragraph deliberation in Task 1's prompt section 2 with a single directive: "Import `computeCip` from `'./ip-hash.js'` in `src/admin.js`. At the top of each admin handler (`handleAdminCreateKey`, `handleAdminListKeys`, `handleAdminRevokeKey`), add `const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'; const cip = await computeCip(env, clientIp);`. This matches the existing pattern in `handleCreateCapture` and `handleListCaptures`." Delete the exploratory paragraphs.

**Severity:** Low. The executing agent will likely figure it out, but the ambiguity invites wasted cycles.

---

### Finding 2: Task 2 prompt specifies line numbers that will be stale after Task 1 completes

**What is complex:** Task 2 references specific line numbers (e.g., "line ~233", "line ~220", "line ~345") in `src/index.js` and `src/admin.js`. Task 1 modifies both files, shifting line numbers.

**Why it appears accidental:** Line number references are fragile across sequential tasks that modify the same files. The executing agent will search for wrong line numbers and either waste time or make incorrect edits.

**Simpler alternative:** Reference event names and function names instead of line numbers. For example: "In `handleCreateCapture`, find the log call with event `capture.queued` and add..." The event names are stable identifiers that survive line shifts. This applies throughout Task 2's prompt.

**Severity:** Low. A competent agent will search by event name anyway. But the stale line numbers add noise and could mislead.

---

### Finding 3: Task 4 audit-log-schema.md scope is generous for a pre-GA project

**What is complex:** Task 4 specifies a comprehensive operator reference document with: full event taxonomy table (25+ events), field dictionary, severity mapping, 6 example Coralogix queries, and an operator journey section. This is a substantial documentation artifact for a single-operator project.

**Why it appears accidental:** The original request asks for audit trail queryability -- not a reference manual. The project has one operator (Ben) who wrote the codebase. A complete event taxonomy with field dictionary and operator journey narrative is more documentation than the current user base needs.

**Simpler alternative:** A single-page reference with: (1) the audit envelope fields and their types, (2) 3 key Coralogix query examples (tenant activity, auth failures, admin operations), (3) a note on severity meanings. Skip the exhaustive event taxonomy (the operator can grep the source), the field dictionary (the audit envelope section covers it), and the operator journey narrative. If the project onboards more operators, expand then.

**Severity:** Low. Over-documentation is low-harm compared to over-engineering. The cost is writing time, not runtime complexity. But the project philosophy says "more code, less blah, blah" -- documentation inflation is the blah, blah of docs.

---

### What the plan gets right

- **No new modules, no new abstractions.** Enriching existing log() calls is the minimum viable approach. The rejected alternatives (audit subsystem, audit.js builder module) would have added accidental complexity for zero functional gain.
- **No new dependencies.** Zero additions to the dependency tree.
- **Complexity budget:** 0 new services, 0 new technologies, 0 new abstraction layers, 0 new dependencies. Total budget spend: effectively zero. This is proportional.
- **Honest scoping:** The "What NOT to do" sections in each task prompt are well-drawn guardrails against scope creep. Explicitly deferring `action`/`resource` fields, `audit: true` markers, and `auditFields()` helpers is correct YAGNI application.
- **Task decomposition is clean:** 4 tasks with clear boundaries and minimal coupling. The dependency chain (1 -> 2 -> 3,4) is the natural order.
- **The list.* rename to capture.list* is the right call** at this project stage. Pre-GA is exactly when to fix naming inconsistencies.
