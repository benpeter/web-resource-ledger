# Decisions: 0026 Secrets and Environment Documentation for Fork-Ready Onboarding

## Source-of-truth boundary between README and OPERATIONS

**Chosen**: README owns secret definitions and generation commands ("what this secret is and how to generate it"). OPERATIONS owns operational topology and surface mapping ("where secrets live across deployment surfaces and why").

**Cross-reference direction**: OPERATIONS -> README. GitHub Environment Setup tables in OPERATIONS link back to the specific README steps for generation commands. README does not link into OPERATIONS for secret setup -- it links to OPERATIONS only at the end of the Setup section for the full operational picture.

**Rejected**: Putting the "secret surfaces" concept and cross-references in README.

**The argument for README**: devx-minion argued that a fork developer encounters README first, during initial setup. The three-surfaces concept is directly relevant at that moment -- without it, a developer may not know to set secrets in two places (Worker runtime AND GitHub environments). Placing the concept in OPERATIONS means a developer might miss it entirely if they follow README without consulting OPERATIONS.

**The argument for OPERATIONS**: software-docs-minion argued that the surfaces concept answers the operational question "why did my deploy succeed but my Worker still fail?" -- a diagnosis question, not a setup question. Putting operational topology in README conflates two concerns: initial setup (README's job) and ongoing operations (OPERATIONS' job). README already ends with a reference to OPERATIONS for the full operational picture; a developer who needs surface-level context will follow that link.

**Resolution**: OPERATIONS. The "secret surfaces" section exists to answer "why did my pipeline deploy successfully but the Worker is failing?" -- that is a diagnosis frame, not a setup frame. The staging section expansion in README and the bridge note at step 9 accomplish the minimum viable version of the setup concern: they confirm that staging infrastructure must be created before CD works, and direct the developer to OPERATIONS for the full surface topology. A developer who reads step 9 and follows the OPERATIONS link will reach the Secret Surfaces section before they need it operationally.

---

## No README restructuring

**Chosen**: Leave README section structure unchanged. Expand content within existing sections (step 3 staging note, step 9 bridge paragraph).

**Rejected**: Consolidating 9 setup steps to 5 using Miller's Law grouping.

**The argument for restructuring**: ux-strategy-minion argued that 9 numbered steps create cognitive load disproportionate to the actual complexity. Steps 4-7 are all "generate a value, set a secret" -- they could be one step with a table. Steps 2-3 are both "create a Cloudflare resource" -- they could merge. A 5-step README reads faster and loses no information.

**Resolution**: Deferred. The current 9-step structure works for the existing operator who set it up. The fork-readiness improvements (staging infrastructure note, bridge to OPERATIONS) deliver more value with less churn than a restructure. Restructuring touches more lines, increases review surface, and risks introducing errors in sections that are currently correct. If a second operator reports onboarding confusion with the 9-step structure, that is the trigger to revisit.

---

## No fork setup checklist

**Chosen**: No new sequenced checklist document for fork operators.

**Rejected**: A "Fork Setup Checklist" document (separate Markdown file or README section) with numbered steps specific to the forking scenario.

**The argument for a checklist**: ux-strategy-minion argued that a fork operator faces a distinct task from the original operator: they must replace IDs in wrangler.toml, create their own infrastructure, configure GitHub environments, and verify the pipeline -- a sequence that differs enough from initial setup to warrant its own document. A checklist with checkboxes and expected outcomes would make fork-readiness testable.

**Resolution**: Deferred. A checklist requires significant README restructuring to avoid duplicating the existing setup steps. The minimum viable version -- expanding the staging section and adding the OPERATIONS bridge note -- accomplishes the fork-readiness goal without the duplication risk. Condition for revisiting: when a second operator forks and reports setup confusion that the expanded sections did not address.

---

## Anchor link fragility accepted

**Chosen**: Cross-references from OPERATIONS.md to README.md use Markdown anchor links (e.g., `README.md#4-configure-capture-api-key`). No automated check validates these links.

**Rejected**: Avoiding anchor links entirely (use section names without links), or adding a CI lint step to validate cross-document links.

**The argument against anchor links**: Heading changes silently break anchor links. GitHub renders broken anchors as plain text with no visible error. A developer who clicks a broken link lands at the top of the README with no indication that the section moved.

**The argument for a lint step**: A CI check that validates all cross-document anchor links would catch breakage at PR time rather than at fork-operator time. Tools exist (markdown-link-check, lychee) and integrate with GitHub Actions.

**Resolution**: Fragility accepted. The deduplication benefit -- generation commands live in one place, OPERATIONS references them rather than repeating them -- outweighs the staleness risk for a small-team project with infrequent heading changes. Adding a link-check CI step is a meaningful operational improvement but is out of scope for a documentation-only phase. Added to backlog under Operations with the trigger "when cross-document link rot is observed."
