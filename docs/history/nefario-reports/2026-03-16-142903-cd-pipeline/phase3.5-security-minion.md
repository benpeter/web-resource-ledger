# Security Minion -- Phase 3.5 Review

## Verdict: ADVISE

The synthesis is sound and addresses the most important security requirements from Phase 2. My Phase 2 recommendations are largely carried forward correctly. Three items need attention before execution.

---

## What the synthesis got right

- Environment-scoped secrets mandatory (production environment gate)
- Separate Cloudflare API token per environment (same secret name, scoped per environment)
- SHA-pinned actions carried forward from staging
- `permissions: contents: read, deployments: write` at workflow level
- `SMOKE_SKIP_CAPTURE: "1"` to avoid real R2 writes in production smoke
- Secrets-not-rolled-back caveat documented in OPERATIONS.md
- Tag triggers dropped -- eliminates the non-main commit and tag-mutation risks I flagged in Phase 2

---

## Issues requiring attention

### 1. Secret naming inconsistency -- MEDIUM

The synthesis specifies these secret names in the workflow:

```yaml
CAPTURE_API_KEY: ${{ secrets.WRL_PROD_CAPTURE_API_KEY }}
SIGNING_KEY: ${{ secrets.WRL_PROD_SIGNING_KEY }}
CORALOGIX_SEND_KEY: ${{ secrets.WRL_PROD_CORALOGIX_SEND_KEY }}
IP_HASH_SEED: ${{ secrets.WRL_PROD_IP_HASH_SEED }}
```

My Phase 2 recommendation used `WRL_CAPTURE_API_KEY`, `WRL_SIGNING_KEY`, etc. (no `_PROD_` infix), matching the existing naming in `~/.secrets`. The synthesis adds `_PROD_` infixes.

The `_PROD_` naming is acceptable and arguably clearer. However, the OPERATIONS.md must use these exact names consistently, and Ben will need to create GitHub secrets with the `_PROD_` names. The iac-minion prompt must not silently change these names. The prompt as written already specifies `WRL_PROD_*` -- the issue is only that the OPERATIONS.md environment setup section must match exactly. Confirm the iac-minion uses `WRL_PROD_*` throughout with no divergence.

No action required in the synthesis itself, but flag to iac-minion: use `WRL_PROD_*` names exactly as specified and never fall back to `WRL_*` (which exist locally but not in the GitHub `production` environment yet).

### 2. `staging-smoke` job accessing staging secrets -- LOW

The synthesis specifies:

```yaml
environment: staging  # to access staging secrets
```

on the `staging-smoke` job. This is correct. However, it means the production workflow run will have two environment deployments recorded: one for `staging` (the smoke check) and one for `production` (the deploy + smoke). GitHub's deployment API logs both. This is not a security concern -- it is the correct mechanism -- but it is worth confirming the iac-minion sets `environment: staging` on the staging-smoke job so secret access is properly gated. Without it, staging secrets would have to be promoted to repository-level secrets, which breaks environment isolation.

Ensure the iac-minion prompt is followed exactly on this point. The synthesis already specifies it; just make sure it is not dropped during implementation.

### 3. `workflow_dispatch` ref input requires input validation -- LOW

The synthesis adds a `workflow_dispatch` input:

```yaml
ref:
  description: 'Git ref to deploy (tag, branch, or SHA). Defaults to triggering ref. Used for rollbacks.'
  required: false
  type: string
```

This input flows into `actions/checkout` as the `ref:` parameter. The risk is low (only users with workflow dispatch permission can trigger this -- i.e., write access to the repo), but the iac-minion should use `github.event.inputs.ref || github.sha` as the checkout ref rather than passing unsanitized input directly. This is already the standard pattern for wrangler-action-based dispatch workflows.

Acceptable as a low risk for a single-operator project. Document in OPERATIONS.md that the ref field accepts a SHA, branch name, or tag -- not arbitrary shell expressions.

---

## Items from Phase 2 not carried forward -- disposition

- **Wait timer (5-minute)**: Explicitly excluded ("do not add a wait timer"). Acceptable -- the approval gate itself is the security control. The wait timer was advisory.
- **Record pre-deployment version ID**: Not included. Acceptable for MVP -- the manual rollback via `wrangler rollback` is documented. Add to backlog as `[consider]`.
- **vibe-coded-badge.yml PAT scope concern**: Out of scope for this task. Remains an open finding -- should be its own backlog item.
- **Commit-on-main verification**: Not needed because tag triggers were dropped. The push trigger is already constrained to `main` branch by `push: branches: [main]`.

---

## No blockers

The plan is implementable as written. The three items above are advisory. The core security architecture -- environment-scoped secrets, approval gate, separate tokens, SHA-pinned actions, minimal permissions -- is correct.
