## Security Review: docs-drift-audit Delegation Plan

ADVISE

---

- [security]: Task 2 prompt references internal KV key paths by citing `src/kv.js:251-263` as a verification cross-reference; the executing agent may interpret this as license to document the KV key format (`signing-key:<keyId>`) in the public README.
  SCOPE: README.md Key Rotation section / Task 2 prompt
  CHANGE: Add an explicit "What NOT to do" item to Task 2: "Do NOT document internal KV key names, prefixes, or storage layout." The `keyId` fingerprint algorithm is public-facing (it appears in API responses and the WACZ bundle) and is correct to document. The KV key format (`signing-key:<keyId>`) is an internal storage detail that has no place in operator-facing docs and narrows the cost of any future KV enumeration or SSRF pivot.
  WHY: Documenting internal KV key structure in a public README provides an attacker who reaches the KV namespace (via misconfigured Cloudflare binding or future SSRF) with a ready-made enumeration prefix. The concern is low-severity at MVP scale but costs nothing to prevent.
  TASK: 2

---

All other tasks reviewed:

- Task 1 (OpenAPI spec): The 13 discrepancies are behavioral facts already visible in code and HTTP responses. No internal secrets, KV paths, or SSRF surface is exposed by fixing them. CORS header documentation is safe -- the allowed-origins configuration is already documented as a `wrangler.toml` environment variable. No concern.

- Task 3 (README secrets table): Documents `IP_HASH_SEED`, `CORALOGIX_SEND_KEY`, and `CORS_ORIGINS`. These are operator-supplied values; documenting that they exist and how to set them is correct. The prompt does not instruct exposing default or example values. The HSTS preload note is accurate and not an attack surface disclosure. No concern.

- Task 4 (CONTRIBUTING.md): `.dev.vars` list mirrors Task 3 disclosures. `CORALOGIX_SEND_KEY` is marked optional for local dev, which is accurate. Smoke test env vars (`SMOKE_URL`, `SMOKE_API_KEY`) are CI-scoped values; documenting their names is safe. No concern.

- Task 5 (status headers on PRODUCT.md / MVP.md): Pure framing text with links to existing files. No security-relevant content. The status headers direct users to README and backlog, neither of which expose internal details. No concern.

- PRODUCT.md / MVP.md disposition: The files are not moved, so no existing cross-references break. No concern.
