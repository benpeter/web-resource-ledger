## Domain Plan Contribution: software-docs-minion

### Recommendations

#### 1. OPERATIONS.md — Migration Runbook

Add a dedicated `## Per-Tenant API Key Migration` section. The runbook must be
self-contained (readable under pressure without cross-referencing other docs)
and must appear before any cleanup instructions that could cause data loss.

Recommended sections in order:

**Pre-merge checklist**
- Confirm `ADMIN_KEY` is NOT yet set in production (dual-mode fallback is safe
  but the old `CAPTURE_API_KEY` must remain active through the entire migration)
- Confirm staging has been tested with the new admin endpoint and at least one
  provisioned tenant key
- Confirm CI smoke tests pass with the dual-mode auth path

**Deploy** (no action required beyond normal push to main — note this explicitly
so operators don't over-intervene)

**Post-deploy: provision the admin key**
```bash
openssl rand -hex 32   # generate ADMIN_KEY
wrangler secret put ADMIN_KEY
wrangler secret put ADMIN_KEY --env staging
```
Note: `CAPTURE_API_KEY` continues working as a fallback; no traffic disruption.

**Key provisioning: create per-tenant keys via admin API**
Document the exact curl calls:
```bash
# Create a tenant key
curl -X POST https://wrl.example.com/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "tenant-name"}'

# List all keys
curl https://wrl.example.com/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY"
```
Instruct operators to record the returned key IDs — they cannot be retrieved later,
only revoked.

**Verification**
- Smoke test with a newly provisioned tenant key (not `CAPTURE_API_KEY`)
- Confirm `GET /v1/admin/keys` returns expected set of keys
- Confirm captures from a tenant key are attributed correctly in logs

**CAPTURE_API_KEY cleanup (deferred — not a blocker for go-live)**
Explicitly call out that removing `CAPTURE_API_KEY` is an intentional future
step, not required immediately. It should only happen after:
1. All callers have migrated to tenant keys
2. Logs confirm zero traffic hitting the fallback path

Cleanup command when ready:
```bash
wrangler secret delete CAPTURE_API_KEY
wrangler secret delete CAPTURE_API_KEY --env staging
```

**Rollback**
The fallback design means rollback is low-risk. If `ADMIN_KEY` must be removed
(e.g., the admin endpoint has a vulnerability), delete the secret and redeploy.
`CAPTURE_API_KEY` continues serving all traffic. Document this explicitly so
operators know they have a safe exit.

**Update to "Manual Deploy (Emergency Bypass)" section**
Add `ADMIN_KEY` to the `wrangler secret put` list:
```bash
wrangler secret put CAPTURE_API_KEY
wrangler secret put ADMIN_KEY
wrangler secret put SIGNING_KEY
wrangler secret put CORALOGIX_SEND_KEY
wrangler secret put IP_HASH_SEED
```

**Update GitHub Environment Setup tables**
Add `ADMIN_KEY` rows to both the `production` and `staging` environment secret
tables. Follow the existing link-to-README-step pattern — point to the new
README step.

**Update the Secret Surfaces reference table**
Add `ADMIN_KEY` as a new row with the same Worker-runtime surface as
`CAPTURE_API_KEY`.

---

#### 2. README.md — Setup Instruction Changes

Add a new numbered step between the current step 4 (CAPTURE_API_KEY) and step 5
(SIGNING_KEY). Call it **"Step 4a: Configure admin key (required for per-tenant
key management)"** — or renumber as step 5 and push the rest.

Renumbering is cleaner than using "4a". Recommend renumbering steps 5-9 to
6-10.

New step content:

**`ADMIN_KEY`** controls access to the key management admin API
(`/v1/admin/keys`). Required to provision, list, and revoke per-tenant API
keys. Without it, the admin endpoints return 401 and no tenant keys can be
created.

Explain the dual-mode auth model briefly: during migration `CAPTURE_API_KEY`
continues to work as a fallback. Once all tenants have dedicated keys,
`CAPTURE_API_KEY` can be removed.

Generate:
```bash
openssl rand -hex 32
```

Set production secret:
```bash
wrangler secret put ADMIN_KEY
```

For local dev, add to `.dev.vars`:
```
ADMIN_KEY=<hex string from the command above>
```

**Multi-tenant explanation in Usage section**
The current Usage section treats `WRL_API_KEY` as a singular value. Add a brief
paragraph after the rate-limiting note explaining that WRL supports per-tenant
API keys: operators issue individual keys to each tenant via the admin API,
allowing revocation without disrupting other tenants. Link to the admin API
section in `openapi.yaml` (or the new OPERATIONS.md runbook).

**Update the "current status" note**
The status note reads "single-operator deployment." Once R12 lands, this is
no longer accurate. Update to reflect multi-tenant capability.

**Update Secret Surfaces reference in OPERATIONS.md cross-reference**
README step 4 currently points OPERATIONS.md to steps 4-7. Update the
cross-reference to point to the new step range after renumbering.

---

#### 3. CONTRIBUTING.md — `.dev.vars` Template

Add `ADMIN_KEY` to the `.dev.vars` template in the "Full Local Development"
section. Place it in the `# Required` block alongside `CAPTURE_API_KEY`:

```ini
# Required
SIGNING_KEY=<your Ed25519 private key>
CAPTURE_API_KEY=<a secret API key you choose>
ADMIN_KEY=<any random string, used to authenticate admin API calls>
IP_HASH_SEED=<any random string, used for privacy-safe IP hashing>
```

Add a brief inline comment explaining what `ADMIN_KEY` gates, so contributors
know what they lose if they omit it: "omit if you don't need to test key
management endpoints."

Also update the staging secrets block to include `ADMIN_KEY`:
```bash
wrangler secret put ADMIN_KEY --env staging
```

---

#### 4. Additional Documentation Gaps

**`openapi.yaml`** — The admin endpoints (`POST/GET/DELETE /v1/admin/keys`)
need full OpenAPI spec entries. This is not strictly a docs-minion
responsibility (implementation must come first), but the spec must be updated
in the same PR as the implementation. The spec is the source of truth for the
API surface. Whoever implements R12 must include these entries. Enforce via the
existing `npm run lint:api` CI gate.

**Roadmap status in README**
The Roadmap section lists "per-tenant keys" under Act 2 ("Evidence-Grade") as
future work. Once R12 merges, move it to complete (same pattern as Act 1's
"(complete)" annotation).

**Evolution log** — per CLAUDE.md project rules, a `docs/evolution/` entry is
required. This is outside the docs-minion's scope to author, but it should be
flagged as a mandatory deliverable for the implementing agent.

---

### Proposed Tasks

In priority order:

1. **OPERATIONS.md: add `## Per-Tenant API Key Migration` runbook** — full
   section as described above, including pre-merge checklist, post-deploy key
   provisioning, verification steps, deferred cleanup instructions, and rollback
   notes.

2. **OPERATIONS.md: update supporting sections** — add `ADMIN_KEY` to the
   Manual Deploy secret list, GitHub environment tables (both production and
   staging), and Secret Surfaces reference table.

3. **README.md: add ADMIN_KEY setup step** — renumber steps 5-9 to 6-10, insert
   new step 5 for `ADMIN_KEY`, explain dual-mode auth and migration path.

4. **README.md: update Usage section and status note** — brief multi-tenant
   paragraph, update "single-operator deployment" status.

5. **CONTRIBUTING.md: update `.dev.vars` template and staging secrets list** —
   add `ADMIN_KEY` with explanatory comment.

6. **openapi.yaml: add admin key endpoints** — flag for implementing agent;
   confirm lint gate covers this before PR merge.

7. **README.md: update Roadmap** — mark per-tenant keys complete in Act 2.

---

### Risks and Concerns

**Risk: cleanup instructions cause premature `CAPTURE_API_KEY` deletion**
The runbook must make it unambiguous that `CAPTURE_API_KEY` removal is a
separate, deferred operation — not part of the initial migration. Premature
deletion breaks all existing callers. Mitigate by putting cleanup in a
clearly labeled "Phase 2 — after full migration" subsection with an explicit
warning.

**Risk: ADMIN_KEY omission from `.dev.vars` produces confusing 401s**
Contributors who skip `ADMIN_KEY` will get unexplained 401s on admin endpoints.
The template comment should say "omit if you don't need to test key management
endpoints" so they know this is expected behavior, not a misconfiguration.

**Risk: README renumbering breaks OPERATIONS.md cross-references**
OPERATIONS.md currently links to README steps by anchor (e.g., `README.md#4-configure-capture-api-key`). Renumbering changes these anchors. All
cross-references in OPERATIONS.md must be updated atomically in the same PR.
Flag this as a checklist item.

**Risk: openapi.yaml not updated in the same PR**
The existing `npm run lint:api` gate catches spec drift only if the spec is
touched. If the admin endpoints ship without openapi.yaml entries, the gate
won't catch it. The PR checklist should explicitly require openapi.yaml changes.
Consider adding a comment to the PR template or flagging in the evolution log.

**Risk: status note staleness**
"Single-operator deployment" in README will become inaccurate immediately on
merge. Low urgency but creates misleading impressions for new readers. Update
in the same PR as the feature.

---

### Additional Agents Needed

No additional agents are needed for documentation execution. However:

- **Implementing agent** (nefario/backend minion) must be reminded that
  `openapi.yaml` is a required deliverable alongside implementation code — it
  is not optional documentation. The `npm run lint:api` CI gate enforces
  syntactic validity but not completeness.

- **Evolution log author** — per CLAUDE.md, a `docs/evolution/` entry is
  mandatory for every significant phase. The implementing agent's wrap-up must
  include this. If nefario orchestrates R12, confirm its wrap-up sequence
  includes evolution log creation.
