# user-docs-minion Review -- Phase 3.5

**Verdict: ADVISE**

---

## Advisory 1: OPERATIONS.md runbook is missing the staging-first sequence

**SCOPE**: Task 5, OPERATIONS.md "Multi-Tenant Key Migration", Phase 2

**CHANGE**: The Phase 2 curl examples must explicitly show staging first, then production. The synthesis prompt says "staging first, then production" parenthetically, but the final runbook structure omits a concrete staging verification step between the two `wrangler secret put` calls.

Without a stated staging gate, operators who are working quickly may skip straight to production. The runbook must make the sequence explicit:

```
# Staging first
wrangler secret put ADMIN_KEY --env staging
# Create a test key on staging and verify it works
curl -X POST https://<STAGING_URL>/v1/admin/keys ...
curl -X POST https://<STAGING_URL>/v1/captures -H "Authorization: Bearer $NEW_KEY" ...
# Only then proceed to production
wrangler secret put ADMIN_KEY
```

**WHY**: The OPERATIONS.md currently models the "deploy code only" flow that the CD pipeline handles -- secrets are the operator's manual responsibility. For a security-critical credential like ADMIN_KEY, the document should make staging validation a named step, not an implied footnote.

**TASK**: In the Phase 2 section of the migration runbook, split the `wrangler secret put ADMIN_KEY` instructions into two named sub-steps: "2a. Set ADMIN_KEY on staging and verify" and "2b. Set ADMIN_KEY on production". Include a staging verification curl command between them.

---

## Advisory 2: README step 4 update must address the 60-second revocation window for end-users

**SCOPE**: Task 5, README.md "Configure capture API key" section

**CHANGE**: The plan specifies updating step 4 to note that `CAPTURE_API_KEY` becomes a legacy fallback. That is correct. However, the README also surfaces WRL to end-users who will use tenant keys provisioned via the admin API. Those users need one sentence in the Usage section noting that revoking a key they are actively using may not take effect for up to 60 seconds. This is user-observable behavior -- a revoked key may still accept requests briefly.

**WHY**: The 60-second eventual consistency window is documented in the OpenAPI spec (good) and the migration runbook (good). But end-users reading only the README will see usage examples for tenant keys without any mention of revocation latency. If a key is compromised and the operator revokes it, they need to know not to assume immediate invalidation. This is a safety-relevant user expectation gap.

**TASK**: In the README Usage section, where tenant key usage is described (or in the admin API reference text), add one sentence: "Revoked keys may remain valid for up to 60 seconds due to Cloudflare's distributed edge cache. Treat revocation as near-immediate, not instant."

---

## Advisory 3: Migration runbook needs a "verify legacy auth is still active" check at the start of Phase 1

**SCOPE**: Task 5, OPERATIONS.md Phase 1

**CHANGE**: Phase 1 currently says "verify: existing curl commands still work." This is correct but passive. The runbook should include a concrete verification command so the operator can confirm the legacy path is live before proceeding to Phase 2. Without this, the operator has no checkpoint against which to judge whether the dual-mode fallback is actually working after deploy.

**WHY**: The dual-mode fallback is the key safety mechanism for the migration. If it silently breaks (e.g., misconfigured KV binding causes 503 rather than fallback), the operator needs to catch this before adding ADMIN_KEY and creating tenant keys. A concrete curl command with expected output makes this a real gate, not an aspirational step.

**TASK**: In Phase 1, add a verification command:

```bash
# Confirm legacy auth still works after deploy
curl -X POST https://<YOUR_URL>/v1/captures \
  -H "Authorization: Bearer $CAPTURE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' \
  | jq .id
# Expected: capture ID (cap_...), not 401 or 503
```

The "If something goes wrong" path already covers recovery; this just makes the success condition concrete.

---

These three advisories are non-blocking individually, but collectively they represent the gap between a runbook that documents a process and one that actually guides an operator through a security-sensitive migration without incident. The code plan is sound. The documentation plan is close -- these are refinements to existing content the prompt already specifies.
