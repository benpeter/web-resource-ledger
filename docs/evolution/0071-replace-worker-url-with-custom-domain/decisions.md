# Decisions: Replace Worker URL with Custom Domain

## 1. Remove legacy openapi.yaml server entry vs. replace it

**Chosen**: Remove the `wrl.benpeter.workers.dev` server entry entirely.
**Over**: Replacing the URL in the legacy entry to point to the same domain as the primary.
**Why**: The primary entry already uses `api.webresourceledger.com`. Keeping a second entry with the same URL (or the old URL) serves no purpose and creates confusion for spec consumers. The task goal is "replace all functional references" — a stale entry is a functional reference.

## 2. Single-task execution vs. multi-task split

**Chosen**: One agent, one task, all 12 files in a single pass.
**Over**: Splitting into code/config, tests, and docs tasks.
**Why**: All changes are the same mechanical replacement. Splitting would add coordination overhead with zero benefit. Tests can only validate after all files are updated together.

## 3. No specialist planning consultation

**Chosen**: 0 specialists, direct synthesis.
**Over**: Consulting security-minion, api-design-minion, etc.
**Why**: Task is fully specified with explicit file list, known target URL, and mechanical success criterion. No architectural decisions, no API contract changes, no security implications. Same worker, same TLS, same auth. Lucy approved this assessment.
