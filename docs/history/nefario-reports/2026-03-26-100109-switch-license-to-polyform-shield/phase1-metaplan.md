# Meta-Plan: Switch License from Apache 2.0 to PolyForm Shield 1.0.0

## Planning Consultations

### Consultation 1: License language accuracy and positioning

- **Agent**: product-marketing-minion
- **Planning question**: The license switch changes WRL's positioning from "open source under Apache 2.0" to source-available under PolyForm Shield 1.0.0. How should user-facing copy (landing page FAQ, footer tagline, README badge, llms.txt) describe the new license without misleading users? What is the correct terminology -- "source-available", "open source" (no longer accurate), or something else? How do we frame this positively for the self-hosting audience without overpromising freedoms the license does not grant?
- **Context to provide**: Current messaging references in `landing/public/index.html` (FAQ answer: "open source under the Apache 2.0 license", footer: "Open source under Apache 2.0", structured data: "Self-hostable (Apache 2.0)"), `landing/public/llms.txt` ("Self-hostable under Apache 2.0"), `README.md` badge and license section. PolyForm Shield allows use for any purpose except competing with WRL's web capture service.
- **Why this agent**: License framing is a messaging and positioning decision. product-marketing-minion knows how to present restrictive-but-transparent licenses without alienating the developer audience.

### Consultation 2: License implications for contributions and contributor experience

- **Agent**: devx-minion
- **Planning question**: CONTRIBUTING.md currently states "contributions are licensed under Apache 2.0". Under PolyForm Shield, what does the contribution model look like? Contributors need to understand that their contributions fall under a non-OSI license. Should CONTRIBUTING.md include a brief explanation of what PolyForm Shield means for contributors? Is a CLA needed (noting CLA setup is explicitly out of scope -- but should we mention that it is intentionally deferred)?
- **Context to provide**: `CONTRIBUTING.md` (full file), the PolyForm Shield 1.0.0 license text (from polyformproject.org). CLA is out of scope per task constraints.
- **Why this agent**: devx-minion specializes in contributor experience and onboarding. The license change directly affects how contributors understand their relationship to the project.

## Cross-Cutting Checklist

- **Testing**: Exclude. No code changes -- only text file edits (LICENSE, README, package.json, landing page copy). Nothing executable to test.
- **Security**: Exclude. License change does not create attack surface, handle auth, or process user input.
- **Usability -- Strategy**: Exclude for planning. The license change does not alter user journeys or cognitive load in the product itself. The messaging question is fully covered by product-marketing-minion above.
- **Usability -- Design**: Exclude. No UI components or interaction patterns are changing (the landing page copy changes are textual, not structural).
- **Documentation**: Include implicitly -- the task IS documentation changes. software-docs-minion and user-docs-minion are not needed for planning because the files to change are already enumerated in the task scope and their current content is known. The execution agent handles the edits.
- **Observability**: Exclude. No runtime components affected.

## Notable Exclusions

- **security-minion**: License change has no security implications (no code, no auth, no infrastructure).
- **software-docs-minion**: The task itself is a documentation edit. The files and their current content are already identified. No architectural documentation expertise is needed to change "Apache 2.0" to "PolyForm Shield 1.0.0".
- **ux-strategy-minion**: No user journey changes. The positioning question (how to describe the license) is better handled by product-marketing-minion who specializes in messaging.

## Anticipated Approval Gates

None expected. This is a low-blast-radius, easily reversible change (text edits across ~8 files). All files are additive documentation changes. No downstream tasks depend on sequencing. The only judgment call -- how to frame the license in marketing copy -- can be handled within the execution task using product-marketing-minion's planning input.

## Rationale

This is a straightforward text substitution task across a known set of files. The two planning consultations address the only non-mechanical aspects:

1. **Messaging** (product-marketing-minion): "Apache 2.0" and "open source" appear in user-facing marketing copy. Replacing them requires deliberate word choices that accurately represent PolyForm Shield without underselling the project's transparency.

2. **Contributor experience** (devx-minion): CONTRIBUTING.md's license reference affects how potential contributors perceive the project. The shift from OSI-approved to source-available needs thoughtful framing.

Everything else -- LICENSE file replacement, package.json field, README badge, openapi.yaml license block, evolution log -- is mechanical find-and-replace that needs no specialist planning input.

## Scope

**In scope**: LICENSE file, package.json (root + packages/verify/package.json), package-lock.json (will auto-update), README.md (badge + license section), CONTRIBUTING.md (license reference), openapi.yaml (license block), landing page (index.html: FAQ, footer, structured data; llms.txt), verify package README.md, evolution log entry (0092).

**Out of scope**: Per-file license headers, CLA setup, license scanning CI, docs site pages (terms.html, privacy.html, etc. -- these reference Apache 2.0 in their own licensing context for the legal pages themselves, not for WRL's license).

## External Skill Integration

### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | Operations/infrastructure | Not relevant -- operational procedures, not license/docs work |

### Precedence Decisions

No precedence conflicts. The ops-runbook skill is unrelated to this task.
