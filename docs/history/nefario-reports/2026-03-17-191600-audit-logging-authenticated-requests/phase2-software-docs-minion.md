## Domain Plan Contribution: software-docs-minion

### Recommendations

#### 1. Audit log schema reference: `docs/audit-log-schema.md`

The audit log schema is an operational contract. Operators querying Coralogix need a single, authoritative reference for event names, fields, severity levels, and example queries. This document should live at `docs/audit-log-schema.md` -- not inline in `src/log.js`, not in OPERATIONS.md, and not as a JSDoc comment.

**Why `docs/` and not inline in code:**
- The audience is operators writing Coralogix queries, not developers reading `log.js`. Operators may not have the repo checked out.
- The schema reference needs to cover events from multiple source files (`index.js`, `admin.js`, `capture.js`). No single source file is the natural home.
- `src/log.js` already has an INVARIANT comment about what goes into `data`. The schema reference is about what `data` contains, not how `log()` works. Different concerns.

**Why not OPERATIONS.md:**
- OPERATIONS.md covers deployment, rollback, secrets, and environment setup. Adding a 50+ line event taxonomy makes it harder to scan for deploy procedures. Separate concern, separate file.
- OPERATIONS.md should link to the schema reference for discoverability.

**Proposed structure for `docs/audit-log-schema.md`:**

1. **Purpose** -- one paragraph: what this document covers, who it's for (operators investigating tenant activity via Coralogix).
2. **Event taxonomy table** -- every event name, severity, subsystem, mandatory fields, description. One row per event. This is the core reference. The table should include both pre-existing events (from phase 0015) and the new audit events added in this phase, so operators have a single comprehensive source.
3. **Field dictionary** -- each field that appears in audit events (tenantId, keyName, keyHashPrefix, authMethod, cip, captureId, responseStatus, etc.) with type, description, and which events include it. This prevents the "what does `cip` mean?" question.
4. **Example Coralogix queries** -- 4-6 queries covering the stated success criteria:
   - "All actions by tenant X in time range"
   - "Key provisioning and revocation events for tenant Y"
   - "Auth failures for a specific keyHashPrefix"
   - "All capture activity in the last 24 hours"
   - "Rate limit hits by tenant"
5. **Severity mapping** -- brief table mapping Coralogix severity numbers (3, 4, 5, 6) to meaning in WRL context, since the numbers are not self-explanatory.

This document should NOT attempt to document the `log()` helper's internals, Coralogix's ingestion format, or how to set up Coralogix access. Those are separate concerns.

#### 2. Evolution log entry: `docs/evolution/0039-audit-logging/`

Required by project rules (CLAUDE.md "Evolution Log" section). This is non-negotiable. The next sequential number is 0039.

Standard structure:
- `prompt.md` -- the task briefing (write before implementation starts)
- `decisions.md` -- key decisions: audit schema shape, event naming convention, which fields are mandatory vs. optional, whether to add a new subsystem or reuse existing ones
- `outcome.md` -- what was produced, what changed, test results, backlog changes

The `decisions.md` for this phase should specifically capture:
- Schema design decisions (which fields are mandatory on every audit event, naming conventions)
- Whether existing events were modified or only new events were added
- Any fields that were considered and rejected (with rationale, per the "Do not log target URLs" precedent in phase 0015)

#### 3. Backlog update

`docs/backlog.md` currently lists `#43 R13: Audit logging [S]` as the next Act 2 item. After this phase:
- Mark R13 as DONE
- Update the "Operations" done list at the bottom
- Review any parking lot items gated on R13

#### 4. OPERATIONS.md cross-reference

Add a one-line entry under the "Monitoring" section of OPERATIONS.md:

```
**Audit log schema:** See [docs/audit-log-schema.md](docs/audit-log-schema.md) for event names, fields, and Coralogix queries.
```

This is the minimum viable pointer. Operators looking at OPERATIONS.md for monitoring will find the link.

#### 5. Evolution log index update

Add the new phase to `docs/evolution/README.md`:

```
| [0039-audit-logging](0039-audit-logging/) | Audit logging for authenticated requests -- full tenant activity trail |
```

#### 6. No README changes needed

The README's roadmap already mentions "audit logging" as in-progress under Act 2. After this phase, the roadmap line can be updated to reflect completion, but no structural README changes are needed. The audit log is an internal operational concern, not a user-facing feature that needs setup instructions.

#### 7. No OpenAPI changes needed

The task is explicitly internal logging. No API response formats change. No new endpoints. The OpenAPI spec should not be touched.

### Proposed Tasks

1. **Create evolution log directory and `prompt.md`** -- `docs/evolution/0039-audit-logging/prompt.md` with the task briefing. Do this first, before implementation begins.

2. **Write `docs/audit-log-schema.md`** -- after the audit schema is finalized (depends on observability-minion's schema design and the approval gate). This document codifies the schema as an operator reference. Estimated: 80-120 lines of Markdown.

3. **Write `docs/evolution/0039-audit-logging/decisions.md`** -- capture schema design decisions as they're made during the planning and synthesis phases. This is done incrementally during planning, not as a post-hoc backfill.

4. **Add cross-reference to OPERATIONS.md** -- one-line addition under Monitoring section.

5. **Write `docs/evolution/0039-audit-logging/outcome.md`** -- after implementation is complete. Summarize what changed, test results, backlog updates.

6. **Update `docs/evolution/README.md`** -- add the 0039 entry.

7. **Update `docs/backlog.md`** -- mark R13 DONE, update done list, review parking lot.

### Risks and Concerns

1. **Schema documentation must happen after schema design, but ship with the same PR.** The audit log schema reference is useless if it documents a schema that changes in the next PR. It must be written after the schema is finalized (post-approval-gate) but included in the same PR as the implementation. This is a sequencing dependency, not a risk per se, but the implementation plan must account for it.

2. **Existing event taxonomy from phase 0015 is undocumented.** The phase 0015 outcome.md contains a "Log event taxonomy" table, but it's buried in the evolution log -- not in an operator-facing reference document. The new `docs/audit-log-schema.md` should include ALL events (not just the new audit events) to serve as the single source of truth. This means the document scope is slightly larger than "just audit events" but avoids the problem of having the event taxonomy split across evolution log entries and a standalone doc.

3. **Evolution log completeness is a project requirement.** The CLAUDE.md rules are explicit: "Before starting a phase: create the directory and write prompt.md." If the implementation starts before the evolution log directory is created, that's a process violation. The orchestration must enforce this sequencing.

4. **The `process.md` requirement.** CLAUDE.md requires a `process.md` in the evolution log directory "after every nefario orchestration that produces a PR." This is a post-PR artifact that the orchestration session must produce before ending.

### Additional Agents Needed

None beyond what the metaplan already includes. The documentation tasks are straightforward and don't require additional specialist input. The schema design (observability-minion) and security review (security-minion) are the critical upstream dependencies for the docs work.
