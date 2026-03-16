# Margo Review: RFC 3161 Timestamp Integration

## Verdict: ADVISE

The plan is well-scoped and proportional to the problem. The 6-task
decomposition maps cleanly to the actual work -- no phantom tasks, no
scope inflation. Zero new dependencies. The hand-rolled DER codec follows
the established project pattern (warc.js, cdxj.js, signing.js) and is
the right call. Three non-blocking concerns below.

---

### Finding 1: Task 4 (index.js) may be a zero-change task

**What**: The plan's own prompt for Task 4 says "verify that the response
flows correctly" and "this flows through automatically -- no change needed
to the basic response assembly." The task then asks the agent to read
`handleVerifyCapture()` and confirm that `result.capture` (which now
contains `timestamp`) already passes through to the response. If nothing
needs changing, this is a read-and-confirm task, not a code task.

**Why it matters**: Delegating a task whose expected outcome is "no code
change" wastes a full agent invocation. If it turns out that one or two
lines do need changing, those lines are trivial enough to fold into Task 3
(which modifies `verify.js` and already understands the new data shape).

**Simpler alternative**: Merge Task 4 into Task 3. Add a bullet to Task 3:
"After modifying verify.js, read `handleVerifyCapture()` in index.js and
confirm the new `capture.timestamp` field flows through to the JSON response.
If any change is needed in index.js (e.g., explicit field mapping), make it."
This reduces total tasks from 6 to 5 and eliminates a sequential dependency.

**Severity**: Low. If you keep 6 tasks it is not harmful -- just slightly
wasteful.

---

### Finding 2: Fully serial execution chain is overly conservative

**What**: Tasks 3-4-5 are strictly sequential (each blocked by the
previous). But Task 5 (verify-page.js, frontend) depends only on the
*API response shape* defined in Task 3 -- not on the literal code output
of Task 4. Task 5's prompt describes the JSON contract it needs
(`checks` array with timestamp entry, `signing.timestamp` object). Given
that contract is specified in the prompt, Task 5 could run in parallel
with Task 4.

**Why it matters**: Serial chains increase wall-clock time and create
unnecessary coupling.

**Simpler alternative**: Task 5 blocked by Task 3 only (not Task 4). The
JSON contract is fully specified in the prompt already.

**Severity**: Low. If tasks are fast, the serial overhead is tolerable.

---

### Finding 3: `skip` tolerance in the verified predicate needs careful scoping

**What**: Task 3 changes the `verified` predicate from
`checks.every(c => c.status === 'pass')` to
`checks.every(c => c.status === 'pass' || c.status === 'skip')`.

The plan correctly identifies the risk (existing `skip` on `artifactHashes`
when `digestRaw` is missing -- line 77 of verify.js). The plan argues this
is safe because those skip cases "always co-occur with other failing checks."
This is currently true: when `digestRaw` is missing, `bundleHash` and
`signature` both fail. But the predicate change is a permanent relaxation.
Any future check that uses `skip` will automatically be tolerated.

**Why it matters**: This is essential complexity for the feature, not
accidental. But the plan should make the constraint explicit so the
implementing agent cannot accidentally broaden the hole.

**Recommendation**: The prompt for Task 3 already has an "IMPORTANT"
paragraph about this. Good. I would add one line to make the invariant
testable: "Add a code comment at the predicate documenting the invariant:
`skip` is only valid for the `timestamp` check; any new skip usage must
be reviewed for the same co-failure property." This costs one comment line
and prevents silent regression.

**Severity**: Low. The plan already flagged this risk. The comment is a
small hardening.

---

### What the plan gets right

- **Zero new dependencies**. Hand-rolled DER codec for a purpose-built
  use case is exactly the pattern this codebase follows. An ASN.1 library
  would be YAGNI and a supply-chain risk.
- **Single file (`src/rfc3161.js`)**. No abstraction layers, no DER utils
  directory, no codec framework. One module, two exports.
- **Graceful degradation over failure**. TSA unavailable = capture proceeds
  without timestamp. No retry logic, no circuit breakers, no fallback TSA
  list. This is correct YAGNI application.
- **Deferred certificate chain validation**. CMS signature verification
  in Cloudflare Workers would require an X.509 library -- massive
  complexity for marginal capture-time value. Deferring is the right call.
- **No new UI patterns**. Task 5 reuses existing CSS classes. No new
  visual states, no amber badges, no trust tiers.
- **Schema evolution over migration**. Version detection (0.1.0 vs 0.2.0)
  with dual-format support is the simplest backward-compatible path.
- **Scope matches the request exactly**. The original request asked for
  TSA integration, signatures array, verification update, and verification
  page update. The plan delivers exactly that with no adjacent features.

### Complexity budget tally

| Addition | Type | Cost |
|----------|------|------|
| `src/rfc3161.js` (new module) | Code | 0 (no dep, no service, follows existing pattern) |
| `signatures` array in digestDoc | Schema evolution | 1 (version detection adds code path in verify.js) |
| 4th verification check | Feature | 1 (new check logic + skip tolerance change) |
| TSA_URL env var | Configuration | 0 (plain string, no secret management) |
| `timestampStatus` log field | Observability | 0 (single field in existing log event) |
| **Total** | | **2** |

This is proportional. A feature that adds third-party temporal proof to
every capture for a complexity cost of 2 is a good trade.
