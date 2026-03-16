# Domain Plan Contribution: software-docs-minion

## Recommendations

### 1. PRODUCT.md: Keep in place, add status header

PRODUCT.md is a vision document -- it describes where the product could go, not where it is. This is valuable context for contributors and the project owner. It should **not** be moved to the evolution log (it predates the evolution log and is referenced by the kickoff phase). It should **not** be updated to reflect current implementation, because that would conflate "what we built" with "what we imagined."

**Recommended change:** Add a brief status block at the top that frames the document correctly:

```
> **This is the original product vision document.** It describes the full scope
> of what WRL could become. For what has actually been built, see the
> [README](../README.md). For current priorities, see
> [docs/backlog.md](backlog.md). For how each feature was implemented,
> see [docs/evolution/](evolution/).
```

No content changes to the body. The document is already honest about what's aspirational vs. decided -- the framing header just makes that explicit for newcomers.

### 2. docs/MVP.md: Archive as historical artifact

MVP.md has served its purpose. It was the implementation plan for phases 0001-0011. It is now 100% implemented (or items were explicitly dropped/deferred). Two of its statements are already annotated as resolved inline ("Capture ID loss" paragraph, "List/search captures" in the What's Out table).

However, MVP.md is still referenced by `docs/backlog.md` (5 parking lot items cite "MVP.md" as their source) and by `docs/evolution/0001-kickoff/`. Deleting it would break those references. Moving it would break relative links in the evolution log.

**Recommended change:**
1. Add a status header at the top, similar to PRODUCT.md:
   ```
   > **This document is a historical artifact.** It was the implementation plan
   > for WRL's initial build (phases 0001-0011, March 2024). All items are now
   > implemented, deferred to [docs/backlog.md](backlog.md), or explicitly
   > dropped. The document is preserved for traceability -- the evolution log
   > phases reference it.
   ```
2. Do NOT move or rename the file. It lives at `docs/MVP.md` and that path is referenced by backlog.md and evolution log entries. Moving it creates broken links and link-rot in historical records.
3. Remove the two inline "Resolved" annotations -- they are patch-style corrections that are now redundant given the status header. (Optional, low priority.)

### 3. openapi.yaml: Specific drift items to fix

The OpenAPI spec is largely accurate and well-maintained. It was updated through phase 0019. However, I found these specific drift items:

**a. Info description mentions "headless Chromium" (line 5)**
The project migrated from Puppeteer to Playwright in phase 0014. The API description says "via headless Chromium" which is technically still correct (Playwright drives Chromium), but if the intent is accuracy, "Chromium" is fine. No action needed unless the team wants to mention Playwright specifically. This is a cosmetic call.

**b. CORS preflight (OPTIONS) is not documented**
The actual router handles `OPTIONS /v1/captures` for CORS preflight (lines 55-67 of index.js). The OpenAPI spec documents the CORS headers on the POST response but does not have a separate `options` operation on `/v1/captures`. OpenAPI 3.1 does not require documenting preflight (it's a browser concern, not an API contract concern), but noting its absence for completeness.

**Recommendation:** Do NOT add OPTIONS to the OpenAPI spec. Preflight is a browser transport concern, not an API contract. Document it in the README or CONTRIBUTING.md if developers need to configure CORS origins.

**c. The `verify` endpoint path in the OpenAPI spec says `/v1/verify/{captureId}` but the README step 4 shows the same path**
These are consistent -- no drift here.

**d. No `Link` header documented in OpenAPI spec**
All responses now include a `Link` header pointing to the Terms of Service (added in phase 0018). This header is not documented in the OpenAPI spec's response headers. Since it appears on every response, it should be added as a common header in `components/headers` and referenced from all paths.

### 4. README.md: Three specific drift items

**a. Roadmap section says Act 1 is "in progress" (line 204)**
Act 1 is complete. All items in Act 1 of the backlog are marked DONE. The README should say Act 1 is complete and Act 2 is next.

**b. Key Rotation section says key versioning is "not yet implemented" (lines 218-227)**
Key versioning WAS implemented in phase 0017 (Issue #32). The entire Key Rotation section is stale:
- The warning about old captures showing "Verification Failed" is no longer accurate
- The statement "key versioning and old-key verification are not yet implemented" is false
- The reference to "Signing and Legal Admissibility" in backlog.md is outdated -- backlog.md doesn't use that heading

The Key Rotation section should be rewritten to reflect the implemented key versioning: archived keys in `/.well-known/signing-keys`, keyId fingerprints in WACZ bundles, automatic historical key lookup during verification.

**c. Public Key Endpoint section (lines 229-230) is incomplete**
It documents `/.well-known/signing-key` but does not mention `/.well-known/signing-keys` (the key archive endpoint added in phase 0017). The key archive is a significant feature for third-party verifiers.

**d. Technology stack note: "Puppeteer API" reference in MVP.md**
MVP.md line 97 says "Managed Chrome, Puppeteer API" in the technology stack table. The project now uses Playwright. Since MVP.md is being marked as historical, this is acceptable without correction (the artifact reflects what was planned at the time). No change needed.

### 5. Documentation structure going forward

The current structure is sound for the project's stage:

| Document | Role | Status |
|----------|------|--------|
| `README.md` | Front door, quick start, setup | **Living** -- update with each feature |
| `PRODUCT.md` | Product vision | **Frozen** -- historical with status header |
| `docs/MVP.md` | Implementation plan for initial build | **Frozen** -- historical with status header |
| `docs/backlog.md` | Living roadmap | **Living** -- update every phase |
| `docs/evolution/` | Phase-by-phase build record | **Append-only** -- new phases added |
| `openapi.yaml` | API contract source of truth | **Living** -- update with API changes |
| `CONTRIBUTING.md` | Contributor guide | **Living** -- update when workflow changes |

This structure does NOT need:
- A separate "Architecture" document -- the codebase is a single Worker with ~600 lines of routing code. Architecture is visible in `src/index.js`. An architecture doc would duplicate what the code already says.
- ADRs in a `docs/adr/` directory -- the evolution log's `decisions.md` files serve the same purpose and are richer (they include the full decision context per phase). Introducing a parallel ADR system would create duplication.
- A separate API reference document -- `openapi.yaml` is the source of truth and can generate human-readable docs via Swagger UI or ReDoc if needed.

### 6. CONTRIBUTING.md: Minor gap

CONTRIBUTING.md references `npm run lint:api` for OpenAPI validation but does not mention the staging environment (added in phase 0018) or the deploy workflow. This is a minor gap -- contributors can figure it out from the GitHub Actions workflows -- but it's worth mentioning in a "Deployment" subsection if the contributor guide is being touched anyway.

## Proposed Tasks

### Task 1: Add status headers to PRODUCT.md and docs/MVP.md
**Deliverable:** Both files get a blockquote status header at the top, framing them as historical/vision documents and pointing to current-state docs.
**Dependencies:** None.
**Effort:** XS (5 minutes).

### Task 2: Fix README.md stale content
**Deliverable:** Three updates to README.md:
1. Roadmap section: Act 1 marked complete, Act 2 marked as next.
2. Key Rotation section: Rewritten to reflect implemented key versioning (keyId, archived keys, `/.well-known/signing-keys`). Remove the "not yet implemented" warning.
3. Public Key Endpoint section: Add `/.well-known/signing-keys` documentation.
**Dependencies:** None.
**Effort:** S (15-20 minutes).

### Task 3: Add Link header to openapi.yaml
**Deliverable:** Add a `Link` header component to `components/headers` and reference it from all path responses, documenting the Terms of Service link header.
**Dependencies:** None.
**Effort:** XS (10 minutes).

### Task 4 (optional): Update CONTRIBUTING.md with staging environment mention
**Deliverable:** Brief mention of `env.staging` and `deploy-staging.yml` in CONTRIBUTING.md.
**Dependencies:** None.
**Effort:** XS (5 minutes).

## Risks and Concerns

1. **MVP.md references in backlog.md**: Five parking lot items in `docs/backlog.md` cite "MVP.md" as their source. If MVP.md were moved or renamed, these references would break. The proposed approach (status header, no move) avoids this risk entirely.

2. **Key Rotation section rewrite could mislead about rotation consequences**: The current README correctly warns that rotation has consequences. The rewrite must preserve the "rotation invalidates old captures" warning while noting that key versioning now mitigates this -- old captures signed before key versioning (pre-phase-0017) are the exception, not the rule. Getting this nuance right matters for operator trust.

3. **openapi.yaml version number**: The spec is at version 0.3.0. If the Link header addition and any other spec changes are made, the version should bump to 0.4.0 to signal the spec has changed. Consumers who cache the spec need a version signal.

4. **Over-documentation risk**: This is a single-developer project with a clean codebase. The biggest risk is adding documentation that nobody reads and nobody maintains. Every proposed change above is a correction of existing docs, not new docs. Resist the temptation to add more documents -- the current structure is right-sized.

## Additional Agents Needed

None. The proposed tasks are straightforward documentation corrections that do not require API design input, security review, or infrastructure changes. A single implementation agent can execute all four tasks.
