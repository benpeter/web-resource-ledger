## Domain Plan Contribution: ux-strategy-minion

### Summary

I walked the full fork-to-green-pipelines journey as a new operator would
experience it across README.md, OPERATIONS.md, CONTRIBUTING.md, the GitHub
Actions workflows, and wrangler.toml. The documentation is individually
competent but structurally fragmented: the operator must hold too many
concepts in working memory simultaneously, cross-reference between files
without guidance on sequencing, and resolve several implicit assumptions
that only become visible when something fails. Below is the full cognitive
load analysis and my recommendations.

---

### Recommendations

#### 1. The "Three Surfaces" Mental Model Is Missing -- This Is the Core Problem

A new operator encounters secrets in three places (Cloudflare Worker
runtime, GitHub Actions environments, .dev.vars) but the documentation
never explains this architecture explicitly. The operator must reverse-
engineer the relationship:

- README steps 4-7 teach `wrangler secret put` (Worker runtime) and
  `.dev.vars` (local dev) -- but never name these as distinct surfaces.
- OPERATIONS.md introduces a third surface (GitHub environment secrets)
  with different naming conventions (`WRL_PROD_CAPTURE_API_KEY` vs
  `CAPTURE_API_KEY`) but never explains why the names differ or how the
  pipeline maps one to the other.
- The mapping from `WRL_PROD_CAPTURE_API_KEY` (GitHub) to `CAPTURE_API_KEY`
  (Worker) is invisible -- it happens inside `wrangler secret put` steps in
  the deploy workflow, except the deploy workflow doesn't run `wrangler
  secret put` at all. The pipeline only deploys code. Worker secrets
  persist independently.

This last point is the single highest-severity cognitive load issue. A
reasonable operator would assume the CD pipeline manages secrets -- that's
how most CI/CD systems work. The fact that Worker secrets persist across
deploys and must be set manually via `wrangler secret put` as a one-time
setup step is a non-obvious, high-consequence assumption. When this
assumption breaks, the failure mode is "pipeline deploys fine but the
Worker 500s" -- which looks like a code bug, not a configuration problem.

**Recommendation**: Create a single "Secret Surfaces" explanation (diagram
or table) showing the three surfaces, which secrets live where, when each
surface is used, and how values flow between them. Place it once in
OPERATIONS.md (the operational authority) and cross-reference from README.
Make the "Worker secrets persist independently of deploys" fact prominent --
call it out explicitly as a warning or note, not buried in prose.

#### 2. No Sequenced Onboarding Path Exists

The current docs present information organized by topic (README = product +
setup, OPERATIONS = deploy + environments, CONTRIBUTING = dev workflow).
But the operator's job-to-be-done is sequential: "I just forked this; get
me to green pipelines." No document provides this sequence.

The operator must mentally reconstruct the order:

1. Create Cloudflare infrastructure (KV, R2, Browser Rendering)
2. Generate all secrets locally
3. Set Worker secrets via wrangler (for both staging AND production)
4. Configure GitHub environments with correct names
5. Push to main -- staging pipeline should go green
6. Trigger production deploy

Steps 1-3 are scattered across README steps 2-7. Step 4 is in OPERATIONS.
Steps 5-6 are implied but not stated. The gap between "I finished README
step 9" and "my pipelines are green" is entirely undocumented.

**Recommendation**: Add a "Fork Setup Checklist" -- a numbered,
dependency-ordered list that references the detailed sections rather than
duplicating them. Something like "1. Complete README Setup steps 1-9, 2.
Create staging infrastructure (see Staging section), 3. Configure GitHub
environments (see OPERATIONS.md), 4. Push to main and verify staging
pipeline, 5. Trigger production deploy." This costs 10 lines and eliminates
the sequencing guesswork.

#### 3. README Step 2 Has a Wrangler.toml Gap for Forks

README step 2 says:

> ```bash
> wrangler kv namespace create wrl-kv
> ```
> Update `wrangler.toml` with the returned `id` and `preview_id`.

But `wrangler.toml` is committed with the original operator's KV namespace
IDs (`b5cd6168...`, `ed564f8e...`). A fork operator must replace these IDs,
but the instructions don't say "replace the existing IDs" -- they say
"update with the returned id." For someone who has never edited
wrangler.toml, "update" is ambiguous. Do I add a new binding? Replace the
existing one? Which line?

Worse: the staging KV namespace is in `wrangler.toml` with a comment
"Replace with output of: wrangler kv namespace create KV --env staging" --
this comment exists only for staging, not production. The asymmetry implies
the production ID is correct as-is (it isn't, for a fork).

**Recommendation**: Make the fork scenario explicit. Either (a) use
placeholder IDs in wrangler.toml with comments like
`# YOUR_KV_NAMESPACE_ID`, or (b) add a clear note in README step 2: "If
you forked this repo, replace the existing `id` value on line N." For
staging, the existing comment is good -- add the same pattern to production.

#### 4. The Staging Section Is Fatally Incomplete

The README Staging section (lines 249-269) says staging "auto-deploys on
merge to main" and tells you to set secrets. It does NOT tell you to:

- Create the staging KV namespace (`wrangler kv namespace create KV --env staging`)
- Create the staging R2 bucket (`wrangler r2 bucket create wrl-captures-staging`)
- Update wrangler.toml with the staging KV ID
- Enable Browser Rendering for the staging worker

A new operator following only the README would create production
infrastructure (steps 2-3) but not staging infrastructure, then merge to
main and watch the staging pipeline fail with binding errors.

**Recommendation**: Either expand the Staging section to list these
prerequisites explicitly, or restructure the setup flow to cover both
environments. Given the "no duplication" principle, a compact "Staging
requires the same infrastructure as production" note with the 3 specific
commands would work.

#### 5. Cloudflare API Token Permissions Are Invisible

OPERATIONS.md says `CLOUDFLARE_API_TOKEN` needs "Workers deploy
permission." This is radically underspecified. Cloudflare's token creation
UI presents dozens of permission options. The operator needs to know the
exact 5 permissions:

- Workers Scripts: Edit
- Workers KV Storage: Edit
- Workers R2 Storage: Edit
- Account Settings: Read
- User Memberships: Read (noted in the task)

Getting this wrong produces a deploy failure with a cryptic Cloudflare API
error, and the operator has no way to know which permission is missing
without trial-and-error or searching Cloudflare community forums.

**Recommendation**: List all 5 permissions explicitly in OPERATIONS.md.
Include the exact names as they appear in Cloudflare's UI. This is a
recognition-over-recall issue (Nielsen heuristic #6) -- the operator should
be able to check boxes from a list, not recall or guess what's needed.

#### 6. Coralogix Key Sourcing Is Undocumented

README step 7 says `CORALOGIX_SEND_KEY` is needed but doesn't say where to
get it in Coralogix's UI. Coralogix has multiple key types (Send Your Data
keys, API keys, alerts keys). The operator needs to know: Settings > Send
Your Data > API Keys, and to select the "Logs" key specifically.

**Recommendation**: Add one sentence: "In Coralogix, navigate to Settings >
Send Your Data > API Keys and copy the key labeled for log ingestion." This
saves a 15-minute search through Coralogix documentation.

#### 7. The 9-Step README Setup Is the Wrong Granularity

The 9 steps mix three different activities:

- **Infrastructure provisioning** (steps 2, 3): creating KV and R2
- **Secret generation and injection** (steps 4, 5, 6, 7): four separate
  steps that are structurally identical (generate, wrangler secret put, add
  to .dev.vars)
- **Configuration** (step 8): editing wrangler.toml
- **Deployment** (step 9): wrangler deploy

The repetition in steps 4-7 inflates perceived complexity. Each step
follows the same generate-set-local pattern, but treating them as 4
separate steps makes the setup feel twice as long as it is.

**Recommendation**: Group the steps by activity type:

1. Install dependencies
2. Create infrastructure (KV + R2)
3. Generate and set secrets (one section covering all 4 secrets, with a
   table showing name, generation command, required/optional status, and
   notes)
4. Configure environment variables (CORS, etc.)
5. Deploy

This reduces 9 steps to 5, which falls within the 5-7 range that feels
manageable (Miller's Law). The secret table eliminates the repetitive
generate/set/local pattern by showing it once as a structure.

However -- this restructuring is a significant change that may not be worth
the churn if the current structure is working for the existing operator.
The fork-readiness improvements (surfaces explanation, staging completeness,
permissions list) are higher priority.

#### 8. OPERATIONS.md Has an Ownership Ambiguity

Both README and OPERATIONS mention secrets, but it's unclear which file
owns what. README owns the "how to generate" instructions. OPERATIONS owns
the "where to configure in GitHub" tables. But the boundary isn't stated,
so a reader of OPERATIONS who needs to generate a key has to know to look
in the README -- there's no cross-reference.

**Recommendation**: Add explicit cross-references. OPERATIONS.md secret
tables should say "See README Setup steps 4-7 for generation commands."
README secret steps should say "For GitHub Actions CI/CD configuration, see
OPERATIONS.md." One sentence each, zero duplication.

#### 9. GitHub Secret Naming Convention Is Unexplained

OPERATIONS.md lists `WRL_PROD_CAPTURE_API_KEY` and
`WRL_STAGING_CAPTURE_API_KEY`. The Worker expects `CAPTURE_API_KEY`. The
operator has to trust that the pipeline handles the mapping -- but the
pipeline doesn't run `wrangler secret put`, so what maps these? The answer
is: nothing. The GitHub secrets are used for smoke tests
(`SMOKE_API_KEY`), not for setting Worker secrets. But this isn't explained.

A reasonable operator might think "I set `WRL_PROD_CAPTURE_API_KEY` in
GitHub and the pipeline puts it into the Worker as `CAPTURE_API_KEY`." This
is wrong. The pipeline only deploys code. Worker secrets must already exist
from a previous `wrangler secret put` invocation.

**Recommendation**: This is a critical implicit assumption. OPERATIONS.md
should include a note: "GitHub environment secrets are used by the pipeline
for smoke tests and deploy authentication. Worker runtime secrets
(CAPTURE_API_KEY, SIGNING_KEY, etc.) must be set separately via `wrangler
secret put` and persist across deploys. The CD pipeline deploys code only."

---

### Proposed Tasks

#### Task 1: Write "Secret Surfaces" Explanation in OPERATIONS.md

**What to do**: Add a section (ideally with a simple ASCII table or list)
explaining the three secret surfaces: Worker runtime (set via `wrangler
secret put`, persists across deploys), GitHub environment secrets (used by
CI/CD for deploy tokens and smoke test credentials), and `.dev.vars` (local
dev only). Show which secrets live where. Make the "Worker secrets persist
independently of deploys" fact a prominent callout.

**Deliverables**: New section in OPERATIONS.md titled "Secret Surfaces" or
"Where Secrets Live". Cross-reference from README setup section.

**Dependencies**: None. This is foundational -- other tasks reference it.

#### Task 2: Add Fork Setup Checklist

**What to do**: Add a short numbered checklist (either in README or
OPERATIONS.md) that gives the end-to-end sequence from fork to green
pipelines. Reference existing sections rather than duplicating content.
Cover: prerequisites, infrastructure for both environments, secret
generation, GitHub environment configuration, first push, verification.

**Deliverables**: 10-15 line checklist section.

**Dependencies**: Task 1 (so the checklist can reference the surfaces
explanation).

#### Task 3: List Cloudflare API Token Permissions Explicitly

**What to do**: Replace "Workers deploy permission" in OPERATIONS.md with
the exact 5 permission names as they appear in Cloudflare's token creation
UI. Add a brief note about scope (account-level vs zone-level if
applicable).

**Deliverables**: Updated OPERATIONS.md secret description for
CLOUDFLARE_API_TOKEN.

**Dependencies**: None.

#### Task 4: Complete the Staging Infrastructure Documentation

**What to do**: Add staging KV namespace creation, staging R2 bucket
creation, and wrangler.toml KV ID update to the README staging section.
Either inline the commands or reference the production setup steps with
staging-specific flags.

**Deliverables**: Expanded README staging section.

**Dependencies**: None.

#### Task 5: Add Coralogix Key Sourcing Guidance

**What to do**: Add one sentence to README step 7 explaining where to find
the send key in Coralogix's UI (Settings > Send Your Data > API Keys).

**Deliverables**: One-sentence addition to README step 7.

**Dependencies**: None.

#### Task 6: Add Cross-References Between README and OPERATIONS.md

**What to do**: OPERATIONS.md secret tables should reference README for
generation commands. README secret steps should reference OPERATIONS.md for
CI/CD configuration. Ensure the "Worker secrets persist across deploys"
fact is stated in both places (once as source of truth, once as
cross-reference).

**Deliverables**: Cross-reference sentences in both files.

**Dependencies**: Task 1 (surfaces explanation is the thing being
cross-referenced).

#### Task 7: Add Note About CD Pipeline Scope

**What to do**: In OPERATIONS.md, near the deploy section or the GitHub
Environment Setup section, add a clear note: the CD pipeline deploys code
only; Worker runtime secrets must be set via `wrangler secret put` as a
one-time step and persist across deploys. This could be part of the
"Secret Surfaces" section (Task 1) but deserves a callout.

**Deliverables**: Note/callout in OPERATIONS.md.

**Dependencies**: Task 1 (may be combined).

---

### Risks and Concerns

**Risk 1: Restructuring README Steps Could Break Existing Mental Models.**
If the current operator (Ben) has the 9-step structure memorized, changing
it to 5 steps means re-learning. The fork-readiness improvements (surfaces
explanation, staging completeness, permissions list) deliver more value
with less disruption. I'd recommend deferring the step restructuring to a
future pass and focusing on additive improvements.

**Risk 2: Over-Documentation Creates Its Own Cognitive Load.** Adding a
surfaces explanation, a fork checklist, expanded staging docs, and
cross-references risks making the docs feel bloated. Every addition should
be evaluated against Krug's "get rid of half the words, then get rid of
half of what's left." The surfaces explanation should be a compact table,
not a prose essay. The fork checklist should be a numbered list with
one-line items, not paragraphs.

**Risk 3: The "No Duplication" Constraint Requires Surgical Precision.**
The success criteria specify "no content duplication between README.md and
OPERATIONS.md." This is the right principle but hard to execute perfectly.
The temptation will be to explain things in both places "just to be safe."
The rule should be: README owns "how to generate and what each secret
does." OPERATIONS owns "where to put them for CI/CD and how the pipeline
uses them." The surfaces explanation in OPERATIONS owns the "how do these
three worlds relate" question.

**Risk 4: Wrangler.toml Contains Hardcoded IDs That Will Confuse Forks.**
The production KV namespace ID is hardcoded with no comment indicating it
needs replacement. This will cause silent failures (the fork operator's
Worker writes to the original operator's KV namespace, or more likely gets
a permissions error). This should be flagged with a comment in
wrangler.toml itself, not just in the README.

---

### Additional Agents Needed

None. The current team is sufficient for this documentation task. The work
is primarily prose editing and information architecture -- no code changes,
no design artifacts, no infrastructure modifications. A technical writer
would be ideal but the engineering specialists can handle the content
accurately; the UX strategy guidance above should keep the structure
user-centered.
