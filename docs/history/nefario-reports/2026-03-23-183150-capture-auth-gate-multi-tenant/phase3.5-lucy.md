VERDICT: ADVISE
WARNINGS:
- [scope]: Share token revocation endpoint is out of scope
  SCOPE: DELETE /v1/captures/{id}/share/{tokenHashPrefix} endpoint and revocation logic
  CHANGE: Remove the revocation endpoint (handleRevokeShare), the revokeShareToken() function, and the revoked/revoked_at columns from the share_tokens migration. The issue explicitly lists "share token revocation API" as out of scope ("future enhancement"). Keep the schema migration additive -- adding revoked columns later is a trivial ALTER TABLE, not a schema-breaking change.
  WHY: The issue's Out-of-scope section explicitly states "share token revocation API (future enhancement)." Including it violates the stated scope boundary and the project's YAGNI principle. The revocation infrastructure (columns, function, endpoint, tests, docs) adds meaningful surface area that was deliberately deferred.
  TASK: 1

- [scope]: listShareTokensForCapture and label field are YAGNI
  SCOPE: listShareTokensForCapture() function in src/share-tokens.js and label column in share_tokens table
  CHANGE: Remove the listShareTokensForCapture() function and the label column from the migration. Neither is required by any success criterion in the issue. If listing is needed later, the function is trivial to add. The label column is a schema addition that can be done via ALTER TABLE when a listing/management UI actually exists.
  WHY: No endpoint in the plan uses listShareTokensForCapture. The label field exists only to support a listing view that does not exist. Both violate YAGNI -- the project's engineering philosophy says "don't build it until you need it."
  TASK: 1

- [convention]: Source code comment updates belong in Task 1, not Task 3
  SCOPE: Task 3 section 5 ("Source code comments") directing software-docs-minion to modify src/index.js
  CHANGE: Move the source code comment update responsibility from Task 3 (software-docs-minion) to Task 1 (security-minion), which already modifies src/index.js. Task 3 should only touch documentation files, not source code.
  WHY: File ownership must be exclusive per the project's decomposition principles. Task 1 already modifies src/index.js extensively. Having Task 3 also edit the same file creates a merge conflict risk and violates the "no two agents should modify the same file" rule.
  TASK: 3
