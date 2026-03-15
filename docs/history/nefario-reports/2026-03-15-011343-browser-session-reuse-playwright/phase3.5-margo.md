# Margo Review: Browser Session Reuse with Playwright Migration

## Verdict: ADVISE

The plan is well-scoped and proportional to the problem. Three tasks, four files,
one approval gate. The core change (Task 1) is genuinely necessary -- the
Puppeteer-to-Playwright migration and session reuse are tightly coupled and
belong together. The plan correctly refused renderer extraction, pre-warming,
Durable Object coordination, and cron triggers. Good discipline.

Three items warrant attention before execution:

---

### 1. Task 3 backlog updates are overscoped (scope creep -- low severity)

**What**: Task 3 modifies five backlog items and adds a new "Scaling Beyond
Session Reuse" section with four ordered scaling options. The original request
says "Add scaling options beyond session reuse to docs/backlog.md" -- a new
section is warranted. But updating five existing items (TOCTOU x2, queue
migration, container migration, per-tenant rate limiting) is context-update work
that could be handled in two lines of guidance rather than the 80-line prompt
currently specified.

**Why it is accidental complexity**: The prescriptive before/after diffs in the
Task 3 prompt are brittle -- if the backlog text has drifted even slightly from
what the prompt assumes, the agent will either fail to find the match or produce
a bad edit. And the precision of the diffs implies these exact words matter,
when in reality they are context annotations.

**Simpler alternative**: Trim Task 3 to: (a) mark the two TOCTOU items DONE,
(b) add the scaling path section, (c) add a single instruction: "update any
existing backlog items whose context changed due to session reuse (queue
migration, container migration, per-tenant rate limiting) with a brief note."
Let the docs agent find the items and write the context naturally. Less prompt
surface, same outcome, more resilient to drift.

**Severity**: Non-blocking. The current approach will work; it is just more
fragile than necessary.

---

### 2. getOrCreateSession retry/wait logic adds cognitive complexity

**What**: The session acquisition helper in Task 1 (step 4) has a
multi-branch flow: list sessions, filter free, pick random, try connect,
on failure fall through, check limits, check `allowedBrowserAcquisitions`,
conditionally wait (capped at 3s), retry once from step 1. This is roughly
cyclomatic complexity 6-8 depending on implementation.

**Why it matters**: This function is the new critical path. It runs on every
capture. The retry-with-wait branch (step 4c) is the most complex part -- it
reads a platform-specific field (`timeUntilNextAllowedBrowserAcquisition`),
caps it, waits, then retries. This is reasonable given the domain (session
contention), but the cognitive load is real.

**Recommendation**: Not a block. The complexity is essential -- session
contention is the problem being solved. But flag this function for the
approval gate: verify the implementation is readable, the retry is bounded
(max 1 retry is correct), and the total worst-case time (connect attempt +
3s wait + retry) fits within the ctx.waitUntil budget alongside the 25s
navigation timeout. The plan's 3s cap appears safe (25s nav + 3s session + 2s
margin = 30s), but the approval gate should confirm this arithmetic.

---

### 3. Rate limit 10x jump should be flagged for operational awareness

**What**: `GLOBAL_CAPTURE_LIMITER` goes from 20/min to 200/min. The plan
correctly identifies this as essential for the throughput target.

**Why it matters**: This is a configuration change, not an infrastructure
change -- the plan's reasoning is sound. But 10x capacity means 10x potential
for abuse if rate limiting at other layers (per-IP at 10/min) is insufficient.
The plan mentions per-tenant rate limiting as a backlog item with updated
context, which is the right approach.

**Recommendation**: Not a block. Just ensure the per-IP `CAPTURE_RATE_LIMITER`
(10/min) is understood to be the real abuse throttle now. The global limit
becomes a system capacity ceiling rather than a safety valve. This is fine
but should be understood at the approval gate.

---

### What the plan gets right

- **No renderer extraction**: Correct YAGNI call. The DI pattern already
  provides testability. A separate module adds a boundary without value.
- **No pre-warming, no cron, no Durable Objects**: These are documented as
  future options in the backlog, not built now. Textbook YAGNI.
- **Single approval gate on Task 1**: Right call. Task 1 is the high-risk
  change; Tasks 2 and 3 are low-risk and can run in parallel after.
- **KEEP_ALIVE_MS as a constant, not an env var**: KISS.
- **browserContext.route() over page.route()**: Security benefit (popup
  first-request coverage) with no additional complexity.
- **Service worker blocking**: One-line addition, real security benefit.
- **Three tasks, four files**: Proportional scope for what is being delivered.

---

### Complexity Budget Tally

| Item | Cost | Column |
|------|------|--------|
| Dependency swap (Puppeteer -> Playwright) | 1 | Managed |
| Session acquisition helper (new function) | 3 | Managed (abstraction layer) |
| Rate limit config change | 0 | Config |
| Backlog documentation | 0 | Docs |
| **Total** | **4** | |

Proportional. The session acquisition helper is the only new abstraction, and
it is justified by the actual requirement (session reuse).
