MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task

Build a tested URL validation module (`src/url-validation.js`) that blocks known SSRF bypass vectors for a Cloudflare Worker. Source: GitHub issue #2.

Full task description:
- URL scheme allowlist (http/https only)
- Reject embedded credentials and bare 0.0.0.0
- DNS pre-resolution with private IP blocking (IPv4 + IPv6)
- DNS pinning (resolve once, pass to Browser Rendering)
- Redirect chain re-validation at each hop (max 5)
- URL normalization and 2048-char limit
- Unit test suite covering all bypass vectors

Acceptance criteria: hex/octal/decimal IP blocking, IPv6-mapped IPv4, IPv6 ULA, DNS-to-loopback redirect, redirect to private IP, embedded credentials, double-encoded paths. All tests pass in Miniflare pool.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase2-edge-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase2-software-docs-minion.md

## Key consensus across specialists:

## Summary: security-minion
Phase: planning
Recommendation: Use scheme allowlist (http/https only), validate in specific pipeline order (parse->scheme->credentials->hostname/IP->DNS->IP classification), implement per-hop validation function for redirects, accept TOCTOU gap for MVP with defense-in-depth layers. Block additional ranges: 100.64.0.0/10 (CGNAT), 0.0.0.0/8, 198.18.0.0/15, 240.0.0.0/4, etc.
Tasks: 4 -- IP address parsing/classification; URL parsing/normalization/scheme validation; DNS resolution and full pipeline; comprehensive test suite
Risks: TOCTOU DNS rebinding gap (HIGH); URL parser differential Node vs Chromium (MEDIUM); incomplete IPv4 parsing (HIGH)
Conflicts: Proposes throw-on-failure API (conflicts with ux-strategy-minion's result-object recommendation)
Full output: phase2-security-minion.md

## Summary: test-minion
Phase: planning
Recommendation: Use dependency injection for DNS resolver (options object with resolve4/resolve6), parameterized tests (it.each) for IP obfuscation vectors grouped by attack category, unit tests with injected stubs as primary approach, fetchMock for integration tests.
Tasks: 6 -- Define testable API; IP obfuscation tests; DNS resolution tests; redirect chain tests; integration tests; document untestable vectors
Risks: URL constructor behavior differences in workerd vs Node.js; false security from passing unit tests alone
Conflicts: none
Full output: phase2-test-minion.md

## Summary: edge-minion
Phase: planning
Recommendation: dns.promises.resolve4/resolve6 work with nodejs_compat (use them directly), Browser Rendering cannot accept pre-resolved IPs (accept TOCTOU gap), fetch with redirect:'manual' works for per-hop validation, CPU/subrequest limits not a concern.
Tasks: 4 -- DNS resolution with private IP blocking; URL scheme/structure validation; redirect chain follower; document TOCTOU limitation
Risks: DNS rebinding TOCTOU with Browser Rendering; IPv6 complexity; Workers cannot fetch by raw IP
Conflicts: none
Full output: phase2-edge-minion.md

## Summary: ux-strategy-minion
Phase: planning
Recommendation: Return result object (not throw) with ok discriminant, dual-purpose error messages that flow into problemResponse(), single entry point validateUrl(), include normalized URL and resolved IP in success result, 400 for malformed / 422 for policy violations.
Tasks: 2 -- Define and document API contract; validate integration seam with capture handler
Risks: Error messages must not leak resolved IPs (HIGH); callers ignoring result object (LOW)
Conflicts: Disagrees with security-minion on throw vs result object
Full output: phase2-ux-strategy-minion.md

## Summary: software-docs-minion
Phase: planning
Recommendation: Document the threat not the implementation; JSDoc naming attack vectors; tests as primary security catalog; module-level threat model comment (5-10 lines); no standalone security doc yet (YAGNI); evolution log captures why-not decisions.
Tasks: 4 -- Module-level threat model comment; JSDoc on exports; structure test file as catalog; evolution log entries
Risks: Documentation/code divergence; evolution log entry being skipped
Conflicts: none
Full output: phase2-software-docs-minion.md

## Key Conflict to Resolve

security-minion proposes `validateUrl()` throws on failure. ux-strategy-minion argues for a result object with `ok` discriminant. Both make strong cases:
- security-minion: throw prevents callers from accidentally ignoring errors
- ux-strategy-minion: result object is structurally safer -- you MUST handle the result to get the IP you need; throw requires remembering try/catch

The ux-strategy argument is stronger: the resolved IP is only available on success, creating a structural dependency that prevents misuse. The existing codebase uses return-values-not-throws (problemResponse returns, doesn't throw). Go with result object.

## External Skills Context
No external skills detected.

## Codebase Context
- Cloudflare Worker, plain JavaScript, ESM modules
- Existing: src/index.js (router), src/responses.js (RFC 9457 helpers)
- Tests: vitest with @cloudflare/vitest-pool-workers (Miniflare pool)
- wrangler.toml: nodejs_compat flag, Browser Rendering binding
- YAGNI/KISS philosophy per CLAUDE.md

## Instructions
1. Review all specialist contributions
2. Resolve the throw-vs-result conflict in favor of result object (per reasoning above)
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. No external skills to incorporate
7. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase3-synthesis.md`

## Key Constraints for the Plan
- This is a standalone module (src/url-validation.js) with its own test file
- No integration with capture endpoint (that's Step 3)
- DNS resolver injection for testability (options object with resolve4/resolve6)
- dns.promises.resolve4/resolve6 confirmed available via nodejs_compat
- Browser Rendering cannot accept pre-resolved IPs -- document TOCTOU limitation
- Redirect chain validation: export per-hop validation function, not a redirect follower (that's Step 3's job)
- Evolution log required per CLAUDE.md (docs/evolution/0003-url-validation/)
- The module should be ONE file with clear internal structure, not split across multiple files
- Tests in ONE file (test/url-validation.test.js)
