# Code Review: url-validation.js

Reviewer: code-review-minion
Files reviewed:
- `src/url-validation.js` (~428 lines)
- `test/url-validation.test.js` (~472 lines)

---

## Summary

The implementation is solid. The security logic is correct, the DNS injection pattern enables testability, and the fail-closed default for unrecognised IP formats is the right call. The TOCTOU limitation is honestly documented. No blocking issues.

Three advisories below — two correctness edge cases and one test gap. One nit.

---

VERDICT: APPROVE

FINDINGS:

- [ADVISE] src/url-validation.js:118 -- `parseIPv4` constructs `'http://' + hostname` without sanitizing `hostname` first. If `hostname` contains `@` (e.g. `user@127.0.0.1`), the URL constructor parses `user` as the username and `127.0.0.1` as the host, causing `parsed.hostname` to return `127.0.0.1` — which then passes the dotted-decimal regex and returns the private IP rather than null. In `validateUrl` this path is only reached after the WHATWG parser has already stripped credentials, so the attack surface is limited. But `parseIPv4` is exported and callable directly with untrusted input; a caller passing `user@127.0.0.1` gets back `'127.0.0.1'` instead of `null`, which is misleading. Consider wrapping the constructor call with a pre-check: reject any hostname containing `@` before constructing the URL.
  AGENT: security-minion / implementation-minion
  FIX: Add `if (hostname.includes('@')) return null;` at the top of `parseIPv4` before the `try` block (line 117).

- [ADVISE] src/url-validation.js:183-198 -- The dotted-decimal IPv4 suffix detection in `parseIPv6ToBigInt` only checks `rightGroups` (the part after `::`). A non-abbreviated address like `0:0:0:0:0:ffff:127.0.0.1` (fully expanded, no `::`) takes the else branch at line 200 (`full.split(':')`) and goes directly to `parseInt(g, 16)` on the trailing `127.0.0.1` group. `parseInt('127.0.0.1', 16)` returns `295` (truncates at `.`), producing a silently wrong BigInt. In practice the WHATWG URL constructor normalizes `[0:0:0:0:0:ffff:127.0.0.1]` to `[::ffff:127.0.0.1]` before this function is called, so the non-abbreviated path is unlikely to be reached in production. But the function is an internal helper that could receive non-normalized input; the dotted-decimal suffix handling should also be applied to the non-`::` path.
  AGENT: security-minion / implementation-minion
  FIX: After splitting `full` at line 200, check the last group for dotted-decimal form and convert it with `ipv4DottedToTwoGroups` before the BigInt loop — mirroring the logic already present for the `::` path.

- [ADVISE] test/url-validation.test.js -- No test exercises `parseIPv4` with a credential-bearing hostname (e.g. `parseIPv4('user@127.0.0.1')`). The current behaviour (returns `'127.0.0.1'`) is undocumented and arguably wrong. Given that `parseIPv4` is exported, adding a test for this case would lock down the intended contract regardless of which fix is chosen.
  AGENT: test-minion
  FIX: Add a test in the `parseIPv4` describe block: `expect(parseIPv4('user@127.0.0.1')).toBeNull()` and `expect(parseIPv4('user@example.com')).toBeNull()`.

- [NIT] src/url-validation.js:371-381 -- `v4results` and `v6results` are declared as `let` and then immediately overwritten after the `Promise.all`. The intermediate `let v4error = null; let v6error = null;` pattern followed by mutation inside catch handlers is more verbose than necessary. This is cosmetic only — the logic is correct.
  AGENT: implementation-minion
  FIX: Destructure directly: `const [v4results, v6results] = await Promise.all([...])` where each promise resolves to an array (possibly empty), and track error state via a local flag or `null` sentinel in the resolved value. Only do this if you're already touching this area.
