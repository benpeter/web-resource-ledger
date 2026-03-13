## Verdict: ADVISE

The plan is well-scoped for a security-critical module. Three tasks, two files of
production code, zero external dependencies, no framework overhead. The scope is
proportional to the threat model. The following items are non-blocking but worth
addressing before or during execution.

---

### Advisory 1

- [complexity]: Custom IPv4 parser duplicates work the WHATWG URL constructor already does
  SCOPE: `parseIPv4(hostname)` function in `src/url-validation.js`
  CHANGE: Before writing a bespoke WHATWG IPv4 parser, verify whether `new URL('http://' + hostname).hostname` already normalizes hex/octal/decimal/shorthand IPv4 to dotted decimal. If it does (and it should -- the URL constructor follows the WHATWG spec, which defines the IPv4 parser), `parseIPv4` reduces to: parse via URL constructor, check if the resulting hostname matches `/^\d+\.\d+\.\d+\.\d+$/`, return it or null. The custom parser becomes ~5 lines instead of a hand-rolled WHATWG algorithm. If the URL constructor does NOT normalize a specific variant (verify with `new URL('http://0x7f000001').hostname`), document which variants need manual handling and implement only those.
  WHY: A hand-rolled IPv4 parser with hex/octal/decimal/mixed/shorthand support is the single highest-complexity component in this plan (~40-60 lines of bit manipulation and base conversion). If the URL constructor already does this normalization, the custom parser is accidental complexity solving a problem that is already solved by step 2 of the validation pipeline. The risk of a bug in a hand-rolled parser is also non-trivial -- and a bug here IS a security bypass. Leveraging the URL constructor's own parser eliminates that risk surface.
  TASK: 1

### Advisory 2

- [YAGNI]: Exporting `BLOCKED_RANGES` as a public API adds surface area without a current consumer
  SCOPE: `BLOCKED_RANGES` export in `src/url-validation.js`
  CHANGE: Keep `BLOCKED_RANGES` as a module-internal constant. Export only `validateUrl`, `isPrivateIP`, and `parseIPv4`. If a future audit or tooling need arises, exporting is a one-word change. The test suite can validate blocklist completeness through `isPrivateIP` -- testing the constant directly is testing implementation details rather than behavior.
  WHY: Every export is an API contract. Once tests import `BLOCKED_RANGES` directly, the data structure (array of `[prefix, maskBits]` tuples) becomes locked. If the implementation changes to a different representation (e.g., a lookup tree, a bitmask, a function chain), the tests break even though the behavior is identical. There is no external consumer today. "Auditability" is served equally well by reading the source or by the `isPrivateIP` tests that cover every range.
  TASK: 1, 2

### Advisory 3

- [test-proportionality]: Test catalog is thorough but has structural overlap that inflates test count without adding coverage
  SCOPE: `test/url-validation.test.js`, specifically the "DNS resolution" and "private IP blocklist completeness" describe blocks
  CHANGE: The "private IP blocklist completeness" block tests `isPrivateIP` directly with 14+ edge IPs. The "DNS resolution" block tests `validateUrl` with resolvers returning private IPs from many of the same ranges (loopback, RFC 1918 x3, link-local, CGNAT, ULA). This is double-testing the blocklist -- once through `isPrivateIP` and once through `validateUrl` with injected resolvers. Consider: test `isPrivateIP` exhaustively for blocklist completeness (the 14-range parameterized block), then test `validateUrl`'s DNS path with just 2-3 representative private IPs (one IPv4, one IPv6, one mixed-results case) plus the error-handling cases (both fail, one fails, empty arrays). The DNS path integration is what matters -- not re-verifying every range through the full pipeline.
  WHY: ~20 tests that all exercise the same `isPrivateIP` code path through different entry points adds maintenance cost (every blocklist change requires updating tests in two places) without catching additional bugs. The DNS error-handling tests (both fail, partial fail, empty arrays) are the high-value tests in that block -- they test code paths that the `isPrivateIP` block cannot reach.
  TASK: 2

### Advisory 4

- [scope-creep]: Redirect chain validation is listed in the issue requirements but the plan explicitly defers it -- verify this is intentional
  SCOPE: Plan scope vs. original issue requirements
  CHANGE: No change needed if the deferral to Step 3 is deliberate and documented. The original issue says "Redirect chain re-validation at each hop (max 5 hops)" and lists "DNS-to-loopback redirect blocked" and "Redirect to private IP after initial validation blocked" as acceptance criteria. The plan correctly scopes this module as single-URL validation and defers redirect orchestration. Just ensure the PR description and evolution log explicitly state which acceptance criteria from the issue are deferred to Step 3, so the issue does not appear partially delivered without explanation.
  WHY: Risk of confusion at PR review if acceptance criteria from the issue are missing without explanation. This is a documentation concern, not a scope concern -- the decision to defer is sound (YAGNI for this module, separation of concerns).
  TASK: 3
