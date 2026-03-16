## Domain Plan Contribution: ux-strategy-minion

### Executive Summary

The documentation tells three different stories about what WRL is at three different points in its life. PRODUCT.md describes a multi-tenant platform with billing, scheduling, and RBAC. MVP.md describes a pre-implementation spec with annotations about what has been resolved. The README describes the current single-operator reality. A new user arriving at the README gets a competent onboarding experience -- but the moment they browse the repo root and find PRODUCT.md or MVP.md, they encounter contradictions that erode trust in the documentation as a whole. Meanwhile, the README itself has drifted: it warns about features that have already shipped (key versioning) and marks Act 1 as "in progress" when it is complete.

The core strategic question is: **what is the minimum documentation set that serves the actual users of this project, and what should be archived or removed?**

---

### Information Architecture Analysis

#### Current document map and user journeys

**Journey 1: "I want to understand what WRL does and try it"**

Entry point: README.md -- this works well. The one-liner, "What you get" section, and Usage examples form a clean progressive disclosure path. A user can understand the value prop in under 30 seconds and see a working API flow in under 2 minutes. The JTBD ("When I need proof of what a web page looked like at a specific time, I want to capture and cryptographically sign it, so I can share verifiable evidence with anyone") is served clearly.

**Friction points in this journey:**
- The roadmap says Act 1 is "in progress" -- this is stale. All 10 items are done. A user reading this concludes the project is less mature than it actually is. This is a reverse satisfaction signal: the documentation undersells the product.
- The Key Rotation section contains a warning box saying key versioning is "not yet implemented" and links to the backlog. But R2 (key versioning) shipped in phase 0017. The code has `keyId`, archived key lookup, and `/.well-known/signing-keys`. This is actively misleading -- a user who rotates keys based on this warning would expect breakage that won't occur.
- The Public Key Endpoint section documents `/.well-known/signing-key` (singular) but the code routes to `/.well-known/signing-keys` (plural) and also has a single-key endpoint. This needs verification and alignment.

**Journey 2: "I want to set it up on my own infrastructure"**

The Setup section is solid. 6 steps, clear prerequisites, copy-pasteable commands. Progressive disclosure is applied correctly (signing key marked as optional). The `.dev.vars` pattern is explained without over-explaining.

**Friction points:**
- No mention of the staging environment (R9, shipped). A deployer following the README has no awareness that `wrangler.toml` has an `env.staging` configuration. This is a missing signpost for the operational user.
- No mention of CORS configuration. R3 shipped a configurable origin allowlist, but the README doesn't tell deployers how to configure it. A user deploying for browser-based use will hit CORS failures with no guidance.

**Journey 3: "I want to contribute"**

README links to CONTRIBUTING.md. CONTRIBUTING.md links to SECURITY.md, CODE_OF_CONDUCT.md, docs/evolution/, docs/backlog.md. This path is complete and has no dead ends. The contributor quick start is genuinely quick -- `git clone && nvm use && npm install && npm test` with no accounts needed.

**Friction points:**
- CONTRIBUTING.md references `CODE_OF_CONDUCT.md` -- this file exists but uses a different email (`ben@benpeter.com`) than CONTENT-POLICY.md (`bp@ben-peter.com`). This is a minor inconsistency but creates doubt about which contact is correct.
- No guidance on how the `openapi.yaml` relates to implementation. CONTRIBUTING.md says "run `npm run lint:api`" but doesn't explain the spec-first workflow or that the OpenAPI spec is the source of truth (MVP.md states this but CONTRIBUTING.md doesn't).

**Journey 4: "I want to understand the project's history and direction"**

docs/evolution/README.md is excellent -- a clean chronological index with one-line descriptions. docs/backlog.md is thorough, well-governed, and clearly structured with tier definitions. These two documents together give a complete picture of where the project has been and where it's going.

**No friction points in this journey.** This is the strongest part of the documentation architecture.

#### The PRODUCT.md and MVP.md problem

**PRODUCT.md** describes a product vision that includes: scheduled captures, webhooks, MCP triggers, watch lists, change detection, multi-tenancy, RBAC, social signup, billing, quotas, notifications, and autoscaling. It has open questions about bundle format (resolved: WACZ), signing approach (resolved: Ed25519), and retention policies. It references "trigger methods" including four that don't exist. None of this reflects the current product.

**MVP.md** is in a hybrid state. It was the pre-implementation spec and has been partially annotated with "(Resolved: R1 shipped)" notes. But it still describes the project as though it uses Puppeteer (the Playwright migration happened in phase 0014), references `warcio.js` (which was the original plan), and contains implementation steps that are all complete. The "What's Out" table is useful historical context but contradicts the backlog (which has a more current and nuanced version of the same decisions).

**The cognitive load problem:** These two documents are the textbook case of "irrelevant information diminishes relevant information" (Nielsen heuristic #8). A new user scanning the repo root sees PRODUCT.md and MVP.md alongside README.md and reasonably expects them to reflect current state. They don't. The resulting confusion is worse than having no documents at all, because the user now has to reconcile three conflicting narratives and figure out which one is true.

**The Kano analysis:** PRODUCT.md and MVP.md served a must-be function during planning (they defined what to build). That function is complete. They now serve a potential excitement function (transparency into the design process), but only if properly framed as historical artifacts. In their current location and state, they function as reverse features -- they actively harm the user's experience of the documentation.

---

### Recommendations

#### R1. Archive PRODUCT.md and MVP.md into docs/evolution/

Move both files out of the repo root into `docs/evolution/0001-kickoff/` (where they originated). They are historical artifacts, not living documents. Their presence in the root creates false equivalence with README.md. The evolution log is the correct home for design-phase documents.

**Rationale:** The repo root is the project's "above the fold" -- it should contain only documents that reflect current state and serve active user needs. PRODUCT.md and MVP.md fail both tests. The backlog has absorbed and superseded their roadmap function. The README has absorbed and superseded their "what is this" function.

#### R2. Fix stale content in README.md

Three specific items:

1. **Roadmap section:** Change Act 1 from "(in progress)" to "(complete)" or similar. All 10 items shipped.

2. **Key Rotation section:** Remove the warning box about key versioning not being implemented. Replace with accurate documentation of the current behavior: keys are versioned with `keyId`, old keys are archived, and historical captures remain verifiable after rotation. The `/.well-known/signing-keys` endpoint exposes the key archive.

3. **Public Key Endpoint section:** Verify whether the current endpoint is `/.well-known/signing-key` (singular, as documented) or `/.well-known/signing-keys` (plural, as seen in code routes). Update the documentation to match the actual route(s). If both exist, document both.

#### R3. Add operational guidance for shipped features missing from README

Two features shipped without README coverage:

1. **Staging environment:** Add a brief mention in the Setup or Development section explaining that `wrangler.toml` includes a staging configuration and how to deploy to it (`wrangler deploy --env staging` or equivalent).

2. **CORS configuration:** Add a brief note about the configurable origin allowlist for browser-based clients. This is essential for any deployer who will have a web UI or browser extension calling the API.

#### R4. Reconcile contact information

CODE_OF_CONDUCT.md uses `ben@benpeter.com`. CONTENT-POLICY.md uses `bp@ben-peter.com`. Pick one and use it everywhere. This is a trust signal -- inconsistent contact information makes both look unreliable.

#### R5. Define the minimum documentation set for single-operator deployment

The current minimum viable documentation set for a single-operator deployment is:

| Document | Purpose | Status |
|----------|---------|--------|
| README.md | Entry point, usage, setup, reference | Exists, needs updates (R2, R3) |
| CONTRIBUTING.md | Contributor onboarding | Exists, minor improvements |
| SECURITY.md | Vulnerability reporting | Exists, accurate |
| TERMS.md | Legal terms | Exists, accurate |
| CONTENT-POLICY.md | Content moderation | Exists, accurate |
| CODE_OF_CONDUCT.md | Community standards | Exists, contact info mismatch |
| openapi.yaml | API reference | Exists, needs drift check (separate task) |
| docs/backlog.md | Living roadmap | Exists, accurate |
| docs/evolution/README.md | Build history index | Exists, accurate |
| LICENSE | License text | Exists, accurate |

Everything else is either operational (wrangler.toml, .dev.vars) or historical (PRODUCT.md, MVP.md -- should be archived per R1). This is already close to minimal. The project does not need additional documentation -- it needs the existing documentation to be accurate.

---

### Proposed Tasks

#### Task 1: Archive pre-implementation documents
**Deliverable:** Move `PRODUCT.md` to `docs/evolution/0001-kickoff/product-vision.md` and `docs/MVP.md` to `docs/evolution/0001-kickoff/mvp-spec.md`. Add a one-line note at the top of each: "This document is a historical artifact from the project planning phase. For current state, see the [README](../../README.md) and [backlog](../backlog.md)." Update any internal links that reference these files at their old locations.
**Dependencies:** None. Can be done independently.
**Priority:** High -- this is the single highest-impact change for reducing cognitive load on new users.

#### Task 2: Fix README drift
**Deliverable:** Update the three stale sections identified in R2 (roadmap status, key rotation warning, public key endpoint path). Each is a surgical edit, not a rewrite.
**Dependencies:** Requires verifying the actual `/.well-known/signing-key` vs `/.well-known/signing-keys` route in the code. The code shows `signing-keys` (plural) in `src/index.js` line 27.
**Priority:** High -- the key rotation section is actively misleading.

#### Task 3: Add missing operational guidance
**Deliverable:** Add staging environment and CORS configuration notes to README.md. Brief -- 2-4 lines each. These are "must-be" features for deployers (Kano) that are currently absent.
**Dependencies:** Requires checking the actual CORS configuration mechanism (environment variable, wrangler.toml setting, etc.).
**Priority:** Medium -- affects deployers, not readers.

#### Task 4: Reconcile contact information
**Deliverable:** Standardize email address across CODE_OF_CONDUCT.md and CONTENT-POLICY.md.
**Dependencies:** Need confirmation from the project owner on which email is canonical.
**Priority:** Low -- cosmetic but erodes trust if noticed.

---

### Risks and Concerns

1. **Archiving PRODUCT.md may break external links.** If anyone has linked to `PRODUCT.md` at the repo root (unlikely given the project's age, but possible from blog posts or the despicable-agents documentation), moving it will 404. Mitigation: check for references in the despicable-agents repo and any published content before moving. A redirect isn't possible in a Git repo, but a stub file pointing to the new location would work if needed.

2. **The README Key Rotation section rewrite could introduce inaccuracies** if the key versioning behavior isn't precisely understood. The code review shows `keyId`, `archiveSigningKey`, `getArchivedSigningKey`, and `listArchivedSigningKeys` -- but the exact user-facing behavior (what happens when you rotate, what the user needs to do) should be verified against the phase 0017 evolution log before rewriting documentation.

3. **PRODUCT.md serves a "showcase" function** for the despicable-agents framework. The CLAUDE.md says the project is "a real product AND a showcase of how despicable-agents can build software from scratch." Removing PRODUCT.md from the root might reduce the showcase value. Mitigation: the evolution log serves this function more effectively, and archiving the document into the evolution log preserves it -- it just stops misleading new users about the current product state.

4. **MVP.md has partial annotations** ("Resolved: R1 shipped") that suggest someone was maintaining it as a living document. If that practice is still active, archiving it needs coordination. Based on the backlog (which has absorbed the roadmap function) and the README (which has absorbed the onboarding function), it appears MVP.md's maintenance has already stopped in practice.

---

### Additional Agents Needed

- **api-design-minion** should verify the `openapi.yaml` against the actual implementation for drift. The README references openapi.yaml as the detailed reference, so if the spec is stale, the README's pointer creates a secondary trust problem. Specific concerns: does the spec document the `GET /v1/captures` list endpoint, the `/.well-known/signing-keys` endpoint, and the CORS/HSTS/rate-limit headers that shipped in recent PRs?

- **software-docs-minion** (if available) should review the CONTRIBUTING.md for accuracy against current dev tooling. The document mentions `@cloudflare/vitest-pool-workers` and `fetchMock` patterns -- these should be verified against actual test code to ensure the guidance matches reality. This is outside UX strategy scope but affects the contributor journey quality.
