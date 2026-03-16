MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
Audit documentation for drift against recent code changes

**Outcome**: All project documentation accurately reflects the current state of the codebase after recent issues and PRs, so that developers and users aren't misled by stale instructions, outdated API references, or missing coverage for new features.

**Success criteria**:
- Each recent issue/PR is checked for documentation impact (new features, changed behavior, removed functionality)
- Every identified drift is catalogued with the specific doc file, what's wrong, and the issue/PR that caused it
- All identified documentation gaps are fixed or filed as issues
- README, API docs, and any user-facing guides match current behavior

**Scope**:
- In: All documentation in the repo (README, docs/, inline API docs, configuration references), recent closed issues and merged PRs as the change source
- Out: Evolution log history (those are historical records, not living docs), external documentation hosted outside this repo

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase2-api-spec-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase2-user-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase2-software-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase2-ux-strategy-minion.md

## Key consensus across specialists:

### api-spec-minion
Phase: planning
Recommendation: 13 discrepancies between openapi.yaml and code; 7 must-fix (missing OPTIONS, Link header on ~25 responses, CORS on error responses, missing error codes), 4 should-fix (examples, health legal required, detail strings, X-RateLimit-Limit on errors). Good news: keyId and failed capture schema already correct.
Tasks: 1 -- fix OpenAPI spec discrepancies across all categories
Risks: Link header omission is pervasive (every response definition)
Conflicts: none
Full output: phase2-api-spec-minion.md

### user-docs-minion
Phase: planning
Recommendation: 17 drift items; 1 critical (Key Rotation misinforms deployers), 8 high (missing secrets, endpoints, staging), 5 medium, 3 low. OpenAPI spec has zero prose drift (different scope than api-spec-minion: prose vs schema).
Tasks: 9 -- rewrite Key Rotation, update Public Key section, add signing-keys, add missing secrets, add staging/smoke tests to CONTRIBUTING, etc.
Risks: Key Rotation misinformation could cause deployer to avoid rotating compromised key
Conflicts: none
Full output: phase2-user-docs-minion.md

### software-docs-minion
Phase: planning
Recommendation: PRODUCT.md stays in place with status header; MVP.md stays in place with historical header (referenced by backlog and evolution); doc structure is right-sized, no new docs needed.
Tasks: 4 -- add headers to PRODUCT.md/MVP.md, update README roadmap and key rotation, document signing-keys
Risks: Moving MVP.md would break cross-references from backlog and evolution
Conflicts: Disagrees with ux-strategy-minion on archiving vs. in-place headers

### ux-strategy-minion
Phase: planning
Recommendation: Move PRODUCT.md and MVP.md to docs/evolution/0001-kickoff/ to eliminate three conflicting narratives in repo root. Key Rotation is most misleading drift. Roadmap status undersells maturity.
Tasks: 3 -- archive PRODUCT.md/MVP.md, fix Key Rotation, update roadmap
Risks: Three conflicting root-level narratives confuse newcomers
Conflicts: Disagrees with software-docs-minion -- wants to move files vs. add headers

## KEY CONFLICT TO RESOLVE
software-docs-minion says keep PRODUCT.md and MVP.md in place with historical headers (because backlog and evolution reference them by path). ux-strategy-minion says move them to docs/evolution/0001-kickoff/ (because three conflicting narratives in repo root confuse newcomers). Synthesis must resolve this with clear rationale.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase3-synthesis.md
