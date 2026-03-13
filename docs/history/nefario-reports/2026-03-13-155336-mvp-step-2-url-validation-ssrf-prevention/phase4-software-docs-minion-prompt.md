# Task 3: Create Evolution Log Entries

Create the evolution log entries for the URL validation phase in
`docs/evolution/0003-url-validation/`. This is a CLAUDE.md requirement
and is non-negotiable.

## Files to create

### 1. `docs/evolution/0003-url-validation/prompt.md`

The task that initiated this phase. This must reflect the ACTUAL scope
of this phase, not the full issue scope.

**[ADVISORY: ux-strategy + lucy + margo]** The following items are
requirements from Issue #2 but were intentionally deferred to Step 3
(redirect orchestration). Mark them clearly as deferred:
- DNS pinning: resolve once, pass resolved IP to Browser Rendering
- Redirect chain re-validation at each hop (max 5)
- "DNS-to-loopback redirect blocked" acceptance criterion
- "Redirect to private IP after initial validation blocked" acceptance criterion

Write:

```
# Phase 0003: URL Validation & SSRF Prevention

Build a tested URL validation module (`src/url-validation.js`) that blocks
known SSRF bypass vectors for the Cloudflare Worker. This module validates
a single URL per call; it will be invoked per-hop by the redirect
orchestrator built in Step 3.

Source: GitHub issue #2

## Requirements (this phase)

- URL scheme allowlist (http/https only)
- Reject embedded credentials
- IPv4 encoding variant detection (hex, octal, decimal, shorthand)
- IPv6 private range blocking (ULA, link-local, multicast, IPv4-mapped)
- DNS pre-resolution with private IP blocking (IPv4 + IPv6)
- Double-encoding detection (path and query string)
- URL normalization via WHATWG URL constructor and 2048-char limit
- Result object API: {ok, url, ip} or {ok, status, detail}
- Unit test suite covering all bypass vectors (security catalog)

## Deferred to Step 3

- Redirect chain re-validation at each hop (max 5)
- DNS pinning: pass resolved IP to Browser Rendering to prevent rebinding
- Acceptance criteria: "DNS-to-loopback redirect blocked"
- Acceptance criteria: "Redirect to private IP after initial validation blocked"

These require redirect orchestration and Browser Rendering integration,
which are out of scope for this single-URL validation module.

## Acceptance criteria (this phase)

Hex/octal/decimal IP blocking, IPv6-mapped IPv4 (dotted-decimal and
hex-group forms), IPv6 ULA, DNS-to-loopback (single hop), embedded
credentials, double-encoded paths and query strings. All tests pass
in Miniflare pool.
```

### 2. `docs/evolution/0003-url-validation/decisions.md`

Key decisions made during this phase. Document each with the decision,
alternatives considered, and rationale. Read the actual implementation
(`src/url-validation.js`) and test suite (`test/url-validation.test.js`)
to verify what was actually built. Include:

**Decision 1: Result object vs throw for validation failures**
- Chosen: Result object with `ok` discriminant
- Rejected: Throwing `ValidationError`
- Rationale: (1) Resolved IP only available on success -- structurally
  prevents misuse. (2) Existing codebase pattern: `problemResponse()`
  returns, doesn't throw. (3) Caller integration is 3 lines with zero
  decisions. (4) `ok` matches Fetch API convention.

**Decision 2: Single-URL validation, not redirect chain follower**
- Chosen: Export a per-hop `validateUrl()` function
- Rejected: Module that follows redirects with `fetch({redirect:'manual'})`
- Rationale: (1) Separation of concerns: validation module validates,
  doesn't make HTTP requests. (2) Browser Rendering follows its own
  redirects -- our fetch chain != the browser's chain, creating false
  confidence. (3) YAGNI: redirect orchestration is Step 3's problem.

**Decision 3: Accept TOCTOU gap with Browser Rendering DNS**
- Chosen: Document as known limitation, rely on defense-in-depth
- Rejected: Double-resolution, TTL heuristics, DNS-over-HTTPS pinning
- Rationale: (1) Browser Rendering cannot accept pre-resolved IPs. (2)
  The Chromium sandbox runs in Cloudflare's network-isolated infrastructure.
  (3) YAGNI for MVP.

**Decision 4: Extended IP blocklist beyond issue requirements**
- Chosen: Block 14 IPv4 ranges and 8 IPv6 ranges including CGNAT, TEST-NETs,
  benchmarking, documentation ranges
- Rejected: Minimal list from the issue only
- Rationale: Defense-in-depth. Costs nothing to block non-routable ranges.

**Decision 5: DNS resolver injection via options object**
- Chosen: `{ resolve4, resolve6 }` options with `node:dns` defaults
- Rejected: (a) Mock frameworks, (b) DNS-over-HTTPS via fetch
- Rationale: Injection is simplest testability pattern -- no mock framework needed.

**Decision 6: Delegate IPv4 parsing to URL constructor**
- Chosen: Use `new URL('http://' + hostname).hostname` for normalization
- Rejected: Hand-rolled WHATWG IPv4 parser
- Rationale: The URL constructor already normalizes hex/octal/decimal/shorthand
  IPv4 to dotted decimal per the WHATWG spec. A 5-line delegation replaces a
  40-60 line hand-rolled parser and eliminates the biggest bug surface area.
  (This was a margo advisory that proved correct.)

**Decision 7: Returned IP preference (IPv4 over IPv6)**
- Chosen: Return first IPv4 from resolve4 if available, else first IPv6
- Rejected: Return arbitrary first IP, or return all IPs
- Rationale: Informational only (TOCTOU gap means Browser Rendering may use
  different address family). IPv4 preferred for readability and because most
  Browser Rendering connections use IPv4.

**Decision 8: BLOCKED_RANGES kept module-internal**
- Chosen: Not exported; tests validate via `isPrivateIP` behavior
- Rejected: Exported as public API for direct testing/audit
- Rationale: No current consumer. Exporting locks data structure as API
  contract. Behavior-based testing is more resilient to representation changes.

### 3. `docs/evolution/0003-url-validation/outcome.md`

Review the actual implementation and test suite, then summarize:
- What was built (module exports, test count, line counts from the files)
- What the validation pipeline looks like in practice
- The bug found during testing (parseIPv6ToBigInt dotted-decimal handling)
- Known limitations (TOCTOU gap, untestable vectors documented in tests)
- What comes next (Step 3 wires this into capture endpoint)
- Deferred acceptance criteria (redirect chain vectors)

### 4. Update `docs/evolution/README.md`

Add a row to the index table:

```
| [0003-url-validation](0003-url-validation/) | URL validation module and SSRF prevention (Issue #2) |
```

## What NOT to do

- Do NOT write the `process.md` file. The orchestrator writes that after PR.
- Do NOT create any files outside `docs/evolution/0003-url-validation/` and the README.md update.
- Do NOT modify any source or test files.

## Codebase context

- Evolution log pattern: see `docs/evolution/0001-kickoff/` and
  `docs/evolution/0002-scaffold/` for examples
- CLAUDE.md requires: prompt.md, decisions.md, outcome.md (process.md handled separately)
- Next sequence number: 0003

When you finish your task, mark task #3 completed with TaskUpdate and
send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
