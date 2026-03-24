# Security Review Verdict: extend-health-build-metadata

**Verdict: ADVISE**

---

## Warning 1: Information Disclosure — commit SHA on unauthenticated endpoint

**SCOPE**: `handleHealth()` / `GET /health` (Task 1)

**CHANGE**: Exposing the full 40-character commit SHA on a public, unauthenticated endpoint.

**WHY**: For an open-source repository this is genuinely low risk, and the synthesis doc acknowledges this. However, there is a residual concern worth surfacing: the full commit SHA narrows the attacker's exploit targeting window. In a closed-source or partially-closed-source deployment, knowing the exact commit enables diff-based vulnerability discovery — an attacker can compare the deployed SHA against public patch sets to infer whether specific CVEs are patched. This project is open-source today, but the health endpoint design will persist if the codebase ever goes private or forks into a commercial product. The synthesis dismisses this with "open-source repo, information surface argument is moot" — that is correct for the current state, but the design choice is baked in permanently.

**TASK**: No code change required. Document the deliberate decision in the OpenAPI spec description or a code comment: "Full SHA is intentional for open-source deployments. Revisit if this endpoint is retained in a closed-source fork." This ensures future maintainers understand the reasoning rather than inheriting it silently.

---

## Warning 2: `--define` value injection via `jq -r .version package.json`

**SCOPE**: "Resolve build metadata" step in both deploy workflows (Task 2)

**CHANGE**: `BUILD_VERSION` is populated by `jq -r .version package.json` — a value read from the repository's `package.json` at build time.

**WHY**: The value flows directly into a `--define` flag which performs a compile-time text substitution into the Worker bundle. The substitution is unquoted at the JS level — it becomes a string literal only because of the `"'...' "` quoting wrapper. If `package.json` were tampered with (e.g., via a supply chain attack that modifies `version` to contain a single-quote or shell metacharacter like `'; DROP TABLE`), the `--define` quoting could break in unexpected ways. The synthesis doc notes "the values contain no special characters requiring additional escaping" — that is true for well-formed semver, but the assertion is not enforced anywhere. A CI step that validates the format before injection would close this.

**TASK**: Add a format validation step in the "Resolve build metadata" run block before the values are used. A one-liner `echo "$version" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]'` (matching the OpenAPI pattern) and `echo "$sha" | grep -qE '^[0-9a-f]{40}$'` would fail the build loudly if either value is malformed, rather than injecting garbage into the bundle silently.

---

## Non-issues confirmed

- **Credential leakage**: No secrets, API keys, or internal infrastructure details (KV bindings, D1 IDs, R2 bucket names) are exposed. The four build fields are all appropriate for a public health endpoint.
- **Cache-Control: no-store**: Correctly prevents CDN caching of deployment state, which could otherwise return a stale build identity.
- **Auth on /health**: The endpoint is intentionally unauthenticated and that is appropriate for its purpose (operational reachability check). No auth gap here.
- **`GITHUB_SHA` in smoke test env**: This is a public value (the commit SHA of the pushed branch). Passing it as an env var to the smoke job does not expose any secret.
- **YAML injection via `--define` flags**: The use of `>-` multi-line scalar in YAML reduces injection risk. The values have no whitespace or special characters in their normal forms.
- **Pinned action digests**: Both `actions/checkout` and `cloudflare/wrangler-action` are already pinned to full SHA digests. No regression here.
