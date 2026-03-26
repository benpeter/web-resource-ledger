## Security Review: LLM Developer Reference (INTERNALS.md)

**Verdict: APPROVE**

### Assessment

This plan produces a static markdown document. The attack surface is near-zero. Specific checks:

**Secret values**: The plan explicitly prohibits including secret values in four separate places (Task 2 prompt lines, "What NOT to do", cross-cutting coverage, and verification step 6). The secrets section documents only the *names* of secrets (`CAPTURE_API_KEY`, `SIGNING_KEY`, etc.). These names are already present in `wrangler.toml` in the repo -- no new exposure.

**[vars] values**: Including `[vars]` values is correct and safe -- these are non-sensitive configuration that ships in the Worker bundle by design (not secrets).

**Enumeration risk**: Documenting the full route table (including admin routes) is appropriate for an internal developer reference. The routes are already in `src/index.js`. The document does not change what exists; it documents what already exists. The `.claude/rules/` placement keeps it out of any public-facing location.

**KV/R2 key patterns**: Documenting key formats is safe. The patterns are schema, not credentials.

**D1 schema enumeration**: Acceptable. This is internal dev reference material, not public documentation. No access controls are weakened.

**Staging differences section**: Correctly scoped -- resource names and env overrides only, no keys or passwords.

### One Note (not blocking)

The Task 2 validation step suggests running `wrangler d1 execute ... --command "SELECT sql FROM sqlite_master WHERE type='table'"` to verify schema. This is fine -- it surfaces only DDL that is already being documented. No concern.

The document should never be committed to a public repo. It references internal route paths and admin surface details. Confirm `docs/INTERNALS.md` is not excluded from `.gitignore` in a way that would prevent tracking, but also confirm the repo itself is private or access-controlled. This is out of scope for the plan itself -- existing repo access controls apply.
