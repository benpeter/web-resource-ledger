# Margo -- Complexity Review

## Verdict: ADVISE

The plan is well-scoped to the original request. Task count (4) is proportional to the work. The dependency choices are justified. Several non-blocking concerns below.

---

### What is good

1. **Scope discipline is strong.** The prompt asks for a CLI verification tool with CMS chain validation. The plan delivers exactly that. No adjacent features, no admin UI, no publishing workflow. Explicit "What NOT to do" sections in every task prompt prevent drift.

2. **Dependency count is minimal and justified.** Four runtime dependencies: `fflate` (ZIP), `pkijs` + `asn1js` + `pvutils` (CMS crypto). No argument parser, no color library, no HTTP client, no test framework. The `pkijs` dependency is essential -- hand-rolling CMS/PKCS#7 verification would be thousands of lines of security-critical code. Pinned versions are correct.

3. **No framework bloat.** `node:test` over vitest, raw `process.argv` over commander, ANSI escapes over chalk, native `fetch()` over axios. This follows Helix Manifesto to the letter.

4. **Vendoring over sharing is the right call.** The CLI vendors verification modules from the Worker rather than creating a shared library. This avoids coupling their release cycles and keeps the CLI self-contained. The semantic drift risk is acknowledged and appropriately mitigated (version comments, rare verification changes).

5. **YAGNI enforced on several fronts:** no `--verbose`, no `--quiet`, no stdin piping, no batch mode, no CRL/OCSP (offline requirement), no monorepo workspace. All deferred with clear rationale.

---

### Non-blocking concerns

**1. Directory-based trust store is a minor YAGNI signal**

Task 1 Step 6 says: "Design the trust store as a directory-based system: read all .pem files from `certs/trusted-roots/` at startup. This makes it trivial to add roots for other TSAs without code changes."

Today there is exactly one TSA (DigiCert) and one root cert. A directory scanner with `readdirSync` + `filter` + `map` is ~5 lines, so the cost is trivial. But the *justification* -- "makes it trivial to add roots for other TSAs" -- is YAGNI reasoning. The `--trust-root` CLI flag already provides the escape hatch for additional roots.

**Recommendation:** Keep the directory structure (costs nothing), but load the single known file by name rather than scanning. When a second root is actually needed, add the scanner. This removes one moving part from the trust path (no ambiguity about which certs are in the directory).

**2. `key-resolver.js` has more resolution paths than currently needed**

The key resolver implements three trust levels (origin, pinned, embedded), two well-known endpoints with fallback, and keyId matching. This is proportional to the *existing API surface* (these endpoints already exist on the Worker), so it is not speculative. However, the `/.well-known/signing-keys` (plural) endpoint with keyId rotation lookup is only needed when key rotation has actually happened. If the Worker currently has exactly one key and no rotation history, the signing-keys endpoint may never return multiple entries.

**Recommendation:** No change needed -- implementing against existing API contracts is not YAGNI. Just noting that if `/.well-known/signing-keys` does not exist yet on the Worker, building a client for it in the CLI is premature.

**3. `format.js` as a separate module from `cli.js`**

The plan creates `cli.js` (orchestration) and `format.js` (output formatting) as separate modules. For a CLI this size, the formatting logic could live directly in `cli.js`. Two modules means two files to navigate when understanding the output path.

**Recommendation:** Acceptable as-is. The separation is along a natural seam (data vs. presentation), and `format.js` is independently testable. This is a judgment call, not a flag.

**4. `verifiedAt` timestamp in JSON output**

The JSON output includes `"verifiedAt": "2026-03-16T15:00:00.000Z"` -- when verification ran. This makes the JSON output non-deterministic (different on every run). The verdict sentence explicitly avoids local clock time for deterministic output, but the JSON includes it.

**Recommendation:** Consider whether `verifiedAt` serves a real use case. If it does (audit trail), keep it. If it is speculative, drop it. The timestamp of when `jq` was invoked is not usually valuable.

**5. Test fixture strategy carries a maintenance cost**

Task 4 commits a real WACZ binary fixture and a real DER timestamp response. These are tied to a specific capture and a specific TSA certificate chain. When the TSA leaf cert expires (they rotate every few years), the fixture becomes a test that validates against an expired chain -- which may or may not still pass depending on how the validation handles "valid at signing time" vs. "valid now."

**Recommendation:** The plan already handles this correctly (Task 2 specifies "valid at timestamp time, not valid now" for cert validity). Just ensure the fixture README documents the expected cert expiry date so future maintainers know when to expect breakage.

---

### Complexity budget tally

| Item | Type | Cost |
|------|------|------|
| pkijs + asn1js + pvutils | Dependencies (3) | 3 |
| fflate | Dependency (1) | 1 |
| cms-verify.js | New module (essential) | 0 (essential complexity) |
| Vendored verification modules (5 files) | Code copy | 0 (essential complexity) |
| CLI (cli.js, format.js, key-resolver.js) | New modules (3) | 0 (essential complexity) |

**Total accidental complexity budget spend: 4** (all from dependencies).

This is proportional. Four dependencies for a cryptographic verification CLI is lean.

---

### Summary

The plan is well-disciplined. It builds exactly what was asked, uses minimal dependencies, avoids frameworks, and explicitly scopes out features that are not needed yet. The non-blocking concerns above are minor -- mostly noting where YAGNI reasoning could be tightened, not where it is violated. Proceed with execution.
