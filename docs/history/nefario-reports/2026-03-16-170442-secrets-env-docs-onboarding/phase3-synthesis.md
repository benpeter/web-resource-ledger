## Delegation Plan

**Team name**: secrets-env-docs-onboarding
**Description**: Fix secrets and environment setup documentation so a developer forking WRL can get both staging and production CD pipelines running from README.md and OPERATIONS.md alone.

### Conflict Resolutions

**Where does "secret surfaces" live -- README or OPERATIONS?**

software-docs-minion argues OPERATIONS.md: "it's operational knowledge -- answers 'I set the secret but my deploy still fails, why?'" devx-minion argues README.md: "README already owns the secret lifecycle; it should own the mental model too."

**Resolution: OPERATIONS.md wins.** Reasoning:

1. The "three surfaces" concept answers an operational question, not a setup question. A developer doing first-time setup follows README steps sequentially and does not need the conceptual model yet. A developer debugging a failed pipeline needs it -- and they are in OPERATIONS.md at that point.
2. Placing it in OPERATIONS.md keeps README focused on sequential bootstrapping (what devx-minion themselves framed as the README's role: "one-time setup"). Adding a conceptual digression between secret steps and the Deploy step breaks the "do step N, then step N+1" flow.
3. OPERATIONS.md already owns the GitHub environment secret tables -- the surfaces explanation contextualizes those tables directly.
4. README gets a one-line forward reference: "For how secrets map across Worker runtime, GitHub CI, and local dev, see OPERATIONS.md."

This aligns with the ownership boundary all three specialists converge on: README owns "what and how" (generation, first-time setup), OPERATIONS owns "where and why" (surfaces, topology, CD pipeline behavior).

### Task 1: Expand README.md staging section with infrastructure prerequisites
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are updating README.md for the web-resource-ledger project to close a
    critical documentation gap: the staging section does not tell forking
    developers to create staging infrastructure before deploying.

    ## Context

    README.md steps 2-3 document production infrastructure creation (KV
    namespace, R2 bucket). The staging section (starting at line 249) tells
    developers to deploy with `wrangler deploy --env staging` and set secrets,
    but never tells them to CREATE the staging KV namespace and R2 bucket
    first. A fork developer following only the README will hit a binding
    error on their first staging deploy.

    The `wrangler.toml` staging KV ID (line 62) is hardcoded to the original
    author's namespace (`ed564f8e...`). The staging section has a comment
    "Replace with output of: wrangler kv namespace create KV --env staging"
    in wrangler.toml, but the README never tells the developer to do this.
    Production has this problem too -- the KV ID on line 14 is hardcoded --
    but production step 2 at least says "Update wrangler.toml with the
    returned id and preview_id." Add the same clarity for staging.

    ## What to do

    In the README.md Staging section (line 249), BEFORE the existing deploy
    command, add infrastructure creation steps:

    1. A brief note that staging requires its own KV namespace and R2 bucket
       (mirroring production steps 2-3)
    2. The wrangler command: `wrangler kv namespace create KV --env staging`
       with instruction to update `wrangler.toml` `[env.staging.kv_namespaces]`
       `id` field with the returned ID
    3. The wrangler command: `wrangler r2 bucket create wrl-captures-staging`
    4. Keep the existing deploy command and secrets instructions after these
       new steps

    Also add to README step 2 a clarification for fork developers:
    "If you forked this repo, replace the existing `id` and `preview_id`
    values in `wrangler.toml` with the IDs returned by these commands."

    ## What NOT to do

    - Do not restructure the 9-step setup flow (out of scope)
    - Do not modify wrangler.toml
    - Do not add a fork setup checklist (the ux-strategy specialist
      recommended this but it would restructure the README significantly --
      defer to a future phase)
    - Do not duplicate content that already exists in the production setup
      steps -- reference them if helpful

    ## Files to modify

    - `/Users/ben/github/benpeter/web-resource-ledger/README.md`

    ## Deliverables

    Updated README.md with staging infrastructure prerequisites in the
    Staging section, and a fork-developer note in step 2.

- **Deliverables**: Updated README.md staging section with KV/R2 creation commands, updated step 2 with fork note
- **Success criteria**: A developer reading only the staging section knows they must create a KV namespace and R2 bucket, and update wrangler.toml with the staging KV ID

### Task 2: Add Coralogix send key sourcing and bootstrap/steady-state bridge to README.md
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1 (same file -- sequential to avoid conflicts)
- **Approval gate**: no
- **Prompt**: |
    You are making two small additions to README.md for the web-resource-ledger
    project.

    ## Addition 1: Coralogix send key sourcing (step 7)

    README step 7 (line 212-222) tells developers to run `wrangler secret put
    CORALOGIX_SEND_KEY` but does not say where to find this key. All other
    secrets have generation commands; this is the only one sourced from an
    external service.

    Add one sentence after "CORALOGIX_SEND_KEY is the API key for structured
    log ingestion to Coralogix" (line 214):

    "Find your send key in the Coralogix dashboard under Settings > Send Your
    Data > API Keys."

    Also clarify that the Worker runs without this key (logs go to console
    only) so it is effectively optional for a fork developer who does not
    use Coralogix. The GitHub environment secret can be omitted if Coralogix
    is not used.

    ## Addition 2: Bootstrap-to-steady-state bridge

    After step 9 (Deploy, line 241), add a brief "What happens next" note:

    "Steps 1-8 are one-time setup. After initial deployment, the CD pipeline
    handles staging and production deploys automatically. See OPERATIONS.md
    for the deploy flow, environment configuration, and rollback procedures."

    Also add a forward reference to the secret surfaces concept:

    "For how secrets map across Worker runtime, GitHub CI, and local
    development, see OPERATIONS.md."

    This bridges README (bootstrapping) to OPERATIONS.md (steady-state
    operations) and tells the developer they are done with setup.

    ## What NOT to do

    - Do not restructure existing steps or change their numbering
    - Do not add the "secret surfaces" explanation here -- it goes in
      OPERATIONS.md (a different task handles that)
    - Do not duplicate OPERATIONS.md content

    ## Files to modify

    - `/Users/ben/github/benpeter/web-resource-ledger/README.md`

    ## Deliverables

    Updated README.md with Coralogix sourcing guidance in step 7 and a
    bridge note after step 9.

- **Deliverables**: Updated README.md step 7 with Coralogix sourcing, bridge note after step 9
- **Success criteria**: Step 7 tells developers where to find the Coralogix send key; after step 9, developers know setup is complete and where to go for operations

### Task 3: Add secret surfaces section and Cloudflare token permissions to OPERATIONS.md
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This establishes the "secret surfaces" concept and Cloudflare permissions that multiple success criteria reference. The structure and content must be correct before cross-references are added in Task 4. Hard to reverse (downstream tasks depend on anchor names and section structure) with 1 dependent task.
- **Prompt**: |
    You are adding two new sections to OPERATIONS.md for the web-resource-ledger
    project: a "Secret Surfaces" explanation and Cloudflare API token permissions.

    ## Context

    WRL has three distinct places where secrets exist, but this is never
    explained in the documentation. The three surfaces are:

    1. **Cloudflare Worker secrets** -- set via `wrangler secret put`, used by
       the Worker at runtime. These persist across deploys. The CD pipeline
       does NOT set or rotate these; they are a one-time bootstrap step.
    2. **GitHub environment secrets** -- set in repo Settings > Environments,
       used by CD workflows for deploy authentication (`CLOUDFLARE_API_TOKEN`)
       and smoke test credentials (`WRL_STAGING_CAPTURE_API_KEY`, etc.).
    3. **`.dev.vars`** -- local development file, never deployed, gitignored.

    The most dangerous implicit assumption: operators expect the CD pipeline
    to manage Worker secrets (that is how most CI/CD systems work). WRL's
    pipeline deploys code only. Worker secrets must be pre-set and persist
    independently.

    OPERATIONS.md also says `CLOUDFLARE_API_TOKEN` needs "Workers deploy
    permission" but does not list the 5 specific Cloudflare permissions
    required. Developers waste time guessing in the Cloudflare dashboard.

    ## What to do

    ### Part A: Secret Surfaces section

    Add a new section titled "Secret Surfaces" (or "Where Secrets Live")
    BEFORE the "GitHub Environment Setup" section (currently at line 108).
    This section should contain:

    1. A brief intro (1-2 sentences) explaining WRL uses three secret
       surfaces for different purposes
    2. A table with these columns: Surface | Set via | Used by | Persists
       across deploys?
       - Row 1: Worker runtime | `wrangler secret put` | Worker code at
         execution time | Yes -- one-time setup, survives all deploys
       - Row 2: GitHub environment | Repo Settings > Environments | CD
         workflows (deploy auth, smoke tests) | Yes -- until manually changed
       - Row 3: Local dev (`.dev.vars`) | Manual file edit | `wrangler dev` |
         N/A -- never deployed
    3. A prominent callout/note: "The CD pipeline deploys code only. Worker
       runtime secrets (CAPTURE_API_KEY, SIGNING_KEY, etc.) must be set once
       via `wrangler secret put` and persist across all subsequent deploys.
       You do not need to re-set secrets after each deploy."
    4. A cross-reference to README for secret generation: "See README steps
       4-7 for secret generation commands and initial setup."

    Keep the section compact -- aim for 15-20 lines total. Use a table, not
    prose paragraphs.

    ### Part B: Cloudflare API Token Permissions

    After the Secret Surfaces section (and still before the GitHub
    Environment Setup tables), add a subsection titled "Cloudflare API Token
    Permissions" listing the 5 required permissions using EXACT Cloudflare
    dashboard labels:

    ```
    Required permissions when creating the Cloudflare API token:
    - Account > Workers Scripts > Edit
    - Account > Workers KV Storage > Edit
    - Account > Workers R2 Storage > Edit
    - Account > Account Settings > Read
    - User > User Details > Read
    ```

    Add a note: "Scope the token to the specific account that owns the WRL
    Workers. Do not use the broad 'Edit Cloudflare Workers' template -- it
    grants more access than needed."

    Add a note about environments: "Each GitHub environment (production and
    staging) needs its own `CLOUDFLARE_API_TOKEN`. Create separate tokens
    if you want independent revocation."

    ## What NOT to do

    - Do not modify the GitHub environment secret TABLES yet (Task 4 handles
      cross-references within them)
    - Do not introduce new URL placeholders -- keep descriptions generic
      ("the deployed Worker" not a URL)
    - Do not duplicate secret generation commands from README
    - Do not change any existing content in OPERATIONS.md -- only add new
      sections

    ## Files to modify

    - `/Users/ben/github/benpeter/web-resource-ledger/OPERATIONS.md`

    ## Deliverables

    Updated OPERATIONS.md with:
    1. "Secret Surfaces" section with table and CD-deploys-code-only callout
    2. "Cloudflare API Token Permissions" subsection with 5 explicit permissions

- **Deliverables**: New "Secret Surfaces" section and "Cloudflare API Token Permissions" subsection in OPERATIONS.md
- **Success criteria**: The three secret surfaces are explained in a compact table; the CD-deploys-code-only principle is prominently stated; the 5 Cloudflare permissions are listed with exact dashboard labels

### Task 4: Replace OPERATIONS.md secret descriptions with README cross-references
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3 (references the new sections), Task 2 (README anchors must exist)
- **Approval gate**: no
- **Prompt**: |
    You are updating the GitHub Environment Setup tables in OPERATIONS.md to
    eliminate content duplication with README.md and add cross-references.

    ## Context

    The OPERATIONS.md GitHub environment tables (starting around line 108,
    now shifted down due to new sections added in an earlier task) have inline
    descriptions for secrets that duplicate README.md content. The project
    requires zero content duplication between these two files.

    README.md owns "what secrets are and how to generate them" (steps 4-7).
    OPERATIONS.md owns "where secrets go for CI/CD" (GitHub environment
    tables) and "how secret surfaces relate" (new Secret Surfaces section).

    ## What to do

    1. In BOTH the production and staging environment secret tables, update
       the `CLOUDFLARE_API_TOKEN` description from "Cloudflare API token with
       Workers deploy permission" to "Cloudflare API token -- see
       [permissions above](#cloudflare-api-token-permissions)"

    2. For secrets that have generation instructions in README, replace the
       inline description with a cross-reference. Examples:
       - `WRL_PROD_CAPTURE_API_KEY`: change "Bearer token for the capture API"
         to "Capture API bearer token (see [README step 4](README.md#4-configure-capture-api-key))"
       - `WRL_PROD_SIGNING_KEY`: change "Ed25519 private key (PKCS8 DER,
         base64)" to "Ed25519 signing key (see [README step 5](README.md#5-configure-signing-key))"
       - `WRL_PROD_CORALOGIX_SEND_KEY`: change to "Coralogix log ingestion
         key (see [README step 7](README.md#7-configure-coralogix-log-ingestion-required-for-production-observability))"
       - `WRL_PROD_IP_HASH_SEED`: change to "IP hash seed (see [README step 6](README.md#6-configure-ip-hash-seed-recommended))"
       - Apply the same pattern to the staging equivalents

    3. Keep the GitHub-specific secret NAME column unchanged -- the
       `WRL_PROD_*` / `WRL_STAGING_*` naming is OPERATIONS.md's unique
       contribution.

    4. After EACH environment's secrets table, add a one-liner:
       "See README steps 4-7 for generation commands. Worker secrets must
       be set separately via `wrangler secret put` -- the CD pipeline deploys
       code only."

    5. After the staging protection rules note, add a brief note explaining
       the environment-to-wrangler mapping: "The `production` GitHub
       environment maps to the top-level wrangler.toml config (`wrangler
       deploy`). The `staging` environment maps to `[env.staging]` (`wrangler
       deploy --env staging`)."

    ## What NOT to do

    - Do not modify the Secret Surfaces or Cloudflare Permissions sections
      (added by Task 3)
    - Do not change the structure of the tables (columns, ordering)
    - Do not add new secrets to the tables
    - Do not duplicate README content -- reference it

    ## Files to modify

    - `/Users/ben/github/benpeter/web-resource-ledger/OPERATIONS.md`

    ## Deliverables

    Updated OPERATIONS.md environment tables with cross-references to README
    instead of duplicated descriptions, plus environment-to-wrangler mapping
    note.

- **Deliverables**: Updated OPERATIONS.md environment tables with README cross-references, environment-to-wrangler mapping note
- **Success criteria**: No secret description in OPERATIONS.md duplicates README content; every secret references the correct README step; environment-to-wrangler mapping is explicit

### Task 5: Create evolution log phase 0025
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Tasks 1, 2, 3, 4 (outcome.md documents what was produced)
- **Approval gate**: no
- **Prompt**: |
    You are creating the evolution log entry for phase 0025 of the
    web-resource-ledger project. This phase fixes secrets and environment
    setup documentation for fork-ready onboarding.

    ## Context

    This phase was triggered by gaps exposed during the CD pipeline fix
    session on 2026-03-16 (phase 0024). During that session, the team
    discovered that a forking developer could not get pipelines running
    because:
    - Staging infrastructure creation was undocumented
    - Cloudflare API token permissions were vague
    - The three "secret surfaces" (Worker runtime, GitHub CI, local dev)
      were never explained
    - The CD pipeline's code-only-deploy behavior was not documented as
      a general principle

    ## What to do

    Create the directory `docs/evolution/0025-secrets-env-docs-onboarding/`
    with three files:

    ### prompt.md

    Capture the task briefing. The task was:

    "Fix secrets and environment setup documentation for fork-ready
    onboarding. A developer forking WRL can get both staging and production
    CD pipelines running by following README.md and OPERATIONS.md alone."

    Reference the 2026-03-16 pipeline fix session as the triggering event.
    Include the success criteria from the original task.

    ### decisions.md

    Document these key decisions:

    1. **Source-of-truth boundary**: README owns secret definitions and
       generation ("what and how"); OPERATIONS owns operational topology
       and surface mapping ("where and why"). Cross-references flow
       OPERATIONS -> README. This was debated: devx-minion argued the
       "secret surfaces" concept belongs in README (closer to the developer
       during setup); software-docs-minion argued OPERATIONS (operational
       diagnosis, not setup). Resolution: OPERATIONS.md, because the
       concept answers "why did my deploy fail?" not "how do I set up?"

    2. **No README restructuring**: ux-strategy-minion recommended
       consolidating 9 steps to 5 (Miller's Law). Deferred: the current
       structure works for the existing operator, and the fork-readiness
       improvements deliver more value with less churn.

    3. **No fork setup checklist**: ux-strategy-minion recommended a
       sequenced checklist. Deferred: would require significant README
       restructuring. The staging section expansion and bridge note
       accomplish the minimum viable version.

    4. **Anchor link fragility accepted**: Cross-references from
       OPERATIONS.md to README.md sections break silently when headings
       change. No automated check exists. Accepted as a known tradeoff --
       the deduplication benefit outweighs the staleness risk for a
       small-team project.

    ### outcome.md

    Read the current state of README.md and OPERATIONS.md after all edits
    are complete. Document:

    1. What changed in each file (section-level summary, not line-by-line)
    2. What was deferred (README restructuring, fork checklist,
       CONTRIBUTING.md alignment, wrangler.toml comment for production KV ID)
    3. Backlog changes: add "[consider] Fork setup onboarding checklist"
       to the Operations parking lot in docs/backlog.md with condition
       "When a second operator forks and reports confusion"
    4. Any surprises or deviations from the plan

    ### Update the index

    Add a row to `docs/evolution/README.md`:

    | [0025-secrets-env-docs-onboarding](0025-secrets-env-docs-onboarding/) | Secrets and environment documentation for fork-ready onboarding |

    ### Update the backlog

    In `docs/backlog.md`, add to the Operations parking lot:

    | [consider] Fork setup onboarding checklist | When a second operator forks and reports setup confusion | ux-strategy-minion, secrets-env-docs phase |

    ## What NOT to do

    - Do not modify README.md or OPERATIONS.md (those are handled by other tasks)
    - Do not create process.md yet (that is written after the PR, per CLAUDE.md)
    - Do not backfill decisions that were not actually made

    ## Files to create/modify

    - Create: `docs/evolution/0025-secrets-env-docs-onboarding/prompt.md`
    - Create: `docs/evolution/0025-secrets-env-docs-onboarding/decisions.md`
    - Create: `docs/evolution/0025-secrets-env-docs-onboarding/outcome.md`
    - Modify: `docs/evolution/README.md` (add index row)
    - Modify: `docs/backlog.md` (add parking lot item)

    ## Deliverables

    Complete evolution log directory with prompt.md, decisions.md, and
    outcome.md. Updated evolution index. Updated backlog with deferred item.

- **Deliverables**: Evolution log directory (prompt.md, decisions.md, outcome.md), updated evolution index, updated backlog
- **Success criteria**: Phase 0025 is indexed; decisions capture the source-of-truth boundary debate and deferred items; outcome references the pipeline fix session as context; backlog has the deferred fork checklist item

### Cross-Cutting Coverage

- **Testing**: NOT INCLUDED. This task produces only documentation (Markdown files). No executable code, configuration, or infrastructure changes. Nothing to test.
- **Security**: NOT INCLUDED as a dedicated task. The documentation does not contain secrets or sensitive values. The Secret Surfaces section explicitly teaches operators to keep secrets out of version control, reinforcing existing security guidance. security-minion reviews the plan at Phase 3.5 to verify no sensitive values leak into documentation.
- **Usability -- Strategy**: COVERED. ux-strategy-minion contributed to planning. Key recommendations incorporated: three-surfaces mental model (Task 3), staging infrastructure gap closure (Task 1), Cloudflare permission specificity (Task 3), bootstrap-to-steady-state bridge (Task 2). Deferred recommendations documented in evolution log (Task 5): README restructuring, fork checklist.
- **Usability -- Design**: NOT INCLUDED. No user-facing interfaces are produced. All changes are Markdown documentation.
- **Documentation**: COVERED. software-docs-minion is the executing agent for all tasks. This IS the documentation task.
- **Observability**: NOT INCLUDED. No runtime components are produced or modified.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - user-docs-minion -- the documentation changes in Tasks 1-4 directly affect what end users (forking developers) need to learn; early review catches unclear instructions before they ship
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion

### Risks and Mitigations

1. **Anchor link fragility** (all specialists flagged this). Cross-references from OPERATIONS.md to README.md headings (e.g., `README.md#4-configure-capture-api-key`) break silently when headings change. Mitigation: accepted as a known tradeoff. Documented in evolution log decisions.md. For a small-team project, the deduplication benefit outweighs the staleness risk.

2. **CONTRIBUTING.md drift** (software-docs-minion). CONTRIBUTING.md has a `.dev.vars` template that partially duplicates README steps 4-7. This task does not touch CONTRIBUTING.md (out of scope). Mitigation: note the overlap in outcome.md as a future cleanup candidate.

3. **wrangler.toml production KV ID has no fork comment** (ux-strategy-minion). The staging KV ID has a "Replace with..." comment but the production KV ID does not. README step 2 says "Update wrangler.toml" but does not say "replace the existing ID." Mitigation: Task 1 adds a fork-developer note to step 2. A wrangler.toml comment is out of scope (no code changes) but noted for future cleanup.

4. **Coralogix optionality is ambiguous** (devx-minion). OPERATIONS.md lists `WRL_PROD_CORALOGIX_SEND_KEY` as a required GitHub secret, but the Worker runs fine without it. Mitigation: Task 2 clarifies that the Worker runs without the key. Task 4's cross-reference note should make this visible in OPERATIONS.md too.

5. **README length creep** (devx-minion). README is 360 lines; this adds ~30 lines. Mitigation: acceptable -- the content is essential for the fork-to-green-pipeline path. The deferred README restructuring (consolidating 9 steps to 5) would address length if it becomes a problem.

### Execution Order

```
Batch 1 (parallel):
  Task 1: README staging infrastructure  (README.md)
  Task 3: Secret surfaces + CF permissions (OPERATIONS.md)

Batch 2 (sequential after Batch 1):
  Task 2: Coralogix sourcing + bridge note (README.md, after Task 1)
  *** APPROVAL GATE: Task 3 (secret surfaces structure) ***

Batch 3 (after gate approval):
  Task 4: OPERATIONS.md cross-references  (OPERATIONS.md, after Tasks 2+3)

Batch 4 (after all content tasks):
  Task 5: Evolution log                   (new files + index/backlog updates)
```

Note: Tasks 1 and 3 can run in parallel because they modify different files.
Task 2 must follow Task 1 (same file). Task 4 must follow Tasks 2 and 3
(references anchors created in both). Task 5 is last because outcome.md
documents what was produced.

### Verification Steps

After all tasks complete:

1. Verify README.md staging section includes KV namespace and R2 bucket creation commands
2. Verify README.md step 2 has fork-developer note about replacing IDs
3. Verify README.md step 7 has Coralogix sourcing path (Settings > Send Your Data > API Keys)
4. Verify README.md has bootstrap-to-steady-state bridge note after step 9
5. Verify OPERATIONS.md has "Secret Surfaces" section with 3-row table
6. Verify OPERATIONS.md states "CD pipeline deploys code only" prominently
7. Verify OPERATIONS.md lists 5 Cloudflare API token permissions with exact dashboard labels
8. Verify OPERATIONS.md environment tables reference README steps (not duplicated descriptions)
9. Verify OPERATIONS.md has environment-to-wrangler mapping note
10. Verify no content is duplicated between README.md and OPERATIONS.md
11. Verify evolution log phase 0025 exists with prompt.md, decisions.md, outcome.md
12. Verify evolution index has phase 0025 row
13. Verify backlog has fork setup checklist parking lot item
