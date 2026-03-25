## UX Strategy Review -- API Versioning & Stability Commitment

**Verdict: ADVISE**

---

### Overall Assessment

The plan is coherent for the integrator journey. The versioning scheme (URL-stable major versions, `WRL-API-Version` header for current version) matches how API consumers already reason about stability. The deprecation lifecycle is complete end-to-end: machine-readable signals (RFC 9745/8594 headers), human-readable record (CHANGELOG.md), and contractual commitment (DEPRECATION-POLICY.md).

One gap in the integrator journey: discoverability of the deprecation policy itself.

---

### Issue

- [usability]: The deprecation policy document is not programmatically discoverable from the API, leaving integrators without a path from "I see a Deprecation header" to "I can find the governing policy" without visiting the repo.
  SCOPE: `DEPRECATION-POLICY.md`, `openapi.yaml` (`info` block or `externalDocs`)
  CHANGE: In Task 3, ensure the `openapi.yaml` `info` block references the deprecation policy -- either via `x-deprecation-policy` extension field pointing to the published policy URL, or via `externalDocs`. This gives spec-driven tooling (Redoc, Swagger UI, generated SDKs) a stable link to the policy. Alternatively, add a note in the `Deprecation` and `Sunset` header component descriptions in openapi.yaml pointing to `DEPRECATION-POLICY.md`. Either approach closes the discoverability loop without adding runtime overhead.
  WHY: The plan explicitly rejected a global `Link: rel="deprecation-policy"` response header (reasonable -- it adds noise to every response). But that decision means there is currently no programmatic path from the headers to the policy. An integrator who receives a `Deprecation: @timestamp` header on a future endpoint has RFC 9745 semantics and a `Link: rel="deprecation"` pointing to a migration guide -- but no machine-readable pointer to the governing SLA (the 6-month minimum, the emergency clause). This creates a support cost when integrators ask "how much notice will I get?" The openapi.yaml spec is already the canonical machine-readable contract, so embedding the policy reference there is low-effort and consistent with the plan's existing approach.
  TASK: Task 3 (CHANGELOG.md and DEPRECATION-POLICY.md) -- also touches Task 1 if the `info` block or header component descriptions in openapi.yaml need updating.

---

### Items Reviewed and Approved

- **Versioning scheme cognitive load**: URL-based major versioning (`/v2/`) is the right pattern. Integrators' mental model for breaking changes maps directly to URL changes. No cognitive overhead introduced.
- **PR template length**: Four checklist items is correct. The synthesis note "a long template gets ignored" is accurate -- this is well-calibrated.
- **CI changelog warning (not failure)**: Correct call. A hard failure would create friction on legitimate non-API PRs; a warning surfaces the obligation without blocking. Heuristic: error prevention over error handling.
- **DEPRECATIONS as static code module**: Correct architecture from an integrator transparency perspective. Changes go through code review and version history, which is exactly where integrators expect API contract changes to be traceable.
- **Six-month minimum + emergency clause**: The policy is internally consistent and clear. "Six months" is a concrete number integrators can plan around. The emergency clause is appropriately scoped (security only) and doesn't undermine the primary commitment.
- **Deprecation header absent from non-deprecated responses**: Correct. The spec should declare only what the API actually returns. Pre-emptively documenting future deprecation headers on all responses would misrepresent current behavior.
- **Header absent in test environment (no fallback)**: Correct. A `'dev'` fallback would make tests assert against a misleading value. Absence is honest; `src/version.js` export covers the test assertion use case cleanly.
