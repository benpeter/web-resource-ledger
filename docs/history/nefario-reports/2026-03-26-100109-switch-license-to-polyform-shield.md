---
title: "Switch License to PolyForm Shield 1.0.0"
timestamp: 2026-03-26T10:01:09
branch: nefario/switch-license-to-polyform-shield
slug: switch-license-to-polyform-shield
status: complete
task-count: 6
gate-count: 0
skills-used: despicable-prompter
---

# Nefario Execution Report: Switch License to PolyForm Shield 1.0.0

## Original Prompt

Switch license from Apache 2.0 to PolyForm Shield 1.0.0. WRL is relicensed under PolyForm Shield 1.0.0, so the source remains fully public but competitors cannot use the code to offer a competing web capture service. No time-based conversion — the protection is permanent.

## Team

### Phase 2 Specialists (2)
- **product-marketing-minion**: Messaging reframe — "source-available" terminology, before/after copy for all user-facing surfaces, structured data updates
- **devx-minion**: Contributor experience — inbound=outbound clause, package.json SPDX convention, CLA analysis

### Phase 3.5 Reviewers (5)
- **security-minion** (APPROVE): No security surface change
- **test-minion** (APPROVE): No test impact; confirmed openapi.yaml `identifier` removal doesn't affect existing tests
- **ux-strategy-minion** (APPROVE): Messaging strategy coherent, CLA omission correct
- **lucy** (APPROVE): Full traceability, no drift, evolution log structure correct
- **margo** (APPROVE): Proportional scope, no over-engineering

### Phase 5 Code Reviewers (3)
- **code-review-minion** (APPROVE): Zero stale references, JSON-LD valid, terminology consistent across all 20 files
- **lucy** (APPROVE): Convention adherence confirmed, process.md owed post-PR
- **margo** (APPROVE): Flagged stale package-lock.json license field (fixed)

## Execution Summary

6 tasks executed in 2 batches (Tasks 1-5 parallel, Task 6 sequential):

1. **Task 1** (devx-minion): LICENSE file replaced with PolyForm Shield 1.0.0 text. package.json x2 updated to `"SEE LICENSE IN LICENSE"`. openapi.yaml license block updated with name + URL, SPDX identifier removed. 4 files.

2. **Task 2** (devx-minion): CONTRIBUTING.md updated with License section (inbound=outbound clause) and footer reference. 1 file.

3. **Task 3** (product-marketing-minion): README.md badge and license section updated. packages/verify/README.md license reference updated. 2 files.

4. **Task 4** (product-marketing-minion): 7 landing page HTML files updated (footer tagline, FAQ, structured data, meta descriptions). llms.txt updated. 8 files.

5. **Task 5** (product-marketing-minion): compare.njk column renamed "Open Source" → "Source" with all data-label attributes. Security pages and legal-evidence updated. 4 files.

6. **Task 6** (software-docs-minion): Evolution log phase 0092 created (prompt.md, decisions.md, outcome.md). Index updated. 4 files.

**Post-execution fix**: packages/verify/package-lock.json license field synced (flagged by margo).

## Key Design Decisions

### License choice: PolyForm Shield 1.0.0
Chosen over FSL 1.1 (converts to open source after 2 years), BSL 1.1 (requires custom Additional Use Grant), SSPL (declining adoption), CC BY-NC (not for software). PolyForm Shield is the narrowest restriction — only prevents competing web capture services. Permanent protection. Plain-English text.

### Terminology: "source-available"
Chosen over "open source" (inaccurate for non-OSI) and "community license" (vague). Industry precedent: Elastic, HashiCorp, Sentry.

### package.json: `"SEE LICENSE IN LICENSE"`
PolyForm Shield has no SPDX identifier. `"SEE LICENSE IN LICENSE"` is the npm convention for non-SPDX licenses. Avoids scanner false positives.

### Comparison table: renamed column to "Source"
Keeping WRL in an "Open Source" column with a PolyForm Shield badge contradicts the messaging fix everywhere else. "Source" is neutral and accurate for all tools. User caught this inconsistency during plan review.

### CLA: not added
Inbound=outbound via CONTRIBUTING.md statement. CLA friction disproportionate to project scale (zero external contributors).

## Verification

Verification: code review passed (3 APPROVE). Tests skipped (text-only changes). (Phase 8: 0 doc items identified.)

Post-review fix: packages/verify/package-lock.json license field synced.

Grep verification: zero "Apache 2.0" or "open source" references describing WRL remain in any active project file.

## Files Changed

| File | Action |
|------|--------|
| LICENSE | Replaced (PolyForm Shield 1.0.0) |
| package.json | Modified (license field) |
| packages/verify/package.json | Modified (license field) |
| packages/verify/package-lock.json | Modified (license field) |
| openapi.yaml | Modified (license block) |
| CONTRIBUTING.md | Modified (License section added, footer updated) |
| README.md | Modified (badge, license section) |
| packages/verify/README.md | Modified (license reference) |
| landing/public/index.html | Modified (footer, FAQ, structured data) |
| landing/public/security.html | Modified (meta, heading, body) |
| landing/public/404.html | Modified (footer) |
| landing/public/privacy.html | Modified (footer) |
| landing/public/terms.html | Modified (footer) |
| landing/public/refund-policy.html | Modified (footer) |
| landing/public/content-policy.html | Modified (footer) |
| landing/public/llms.txt | Modified (license reference) |
| site/content/compare.njk | Modified (column rename, WRL badge) |
| site/content/security/index.md | Modified (terminology) |
| site/content/security/whitepaper.md | Modified (terminology) |
| site/content/legal-evidence.md | Modified (terminology) |
| docs/evolution/0092-license-switch/prompt.md | Created |
| docs/evolution/0092-license-switch/decisions.md | Created |
| docs/evolution/0092-license-switch/outcome.md | Created |
| docs/evolution/README.md | Modified (index entry) |

<details>
<summary>Session Resources</summary>

### Skills Invoked
- `/despicable-prompter` — generated the nefario task briefing from conversation context
- `/nefario` — orchestration

### Compaction
0 compaction events.

### Working Files
See companion directory: `docs/history/nefario-reports/2026-03-26-100109-switch-license-to-polyform-shield/`

</details>
