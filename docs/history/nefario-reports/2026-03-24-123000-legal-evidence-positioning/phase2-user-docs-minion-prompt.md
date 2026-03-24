You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
R42: Legal-evidence positioning (landing + docs) — Update WRL's landing page and docs with precise FRE 901/902 and eIDAS legal-evidence framing instead of vague compliance claims. A new "Legal Evidence" guide page needs to be created on the docs site.

## Your Planning Question
What should the structure and information architecture of the new "Legal Evidence" docs page look like? The page needs to cover: FRE 901/902 authentication mapping, eIDAS Article 41(2) qualified timestamps, WRL vs. traditional screenshots+affidavits comparison, competitor integrity comparison, and a disclaimer. How should this be organized — single long page with anchor sections, or split across sub-pages? What is the right reading order for a lawyer evaluating WRL for the first time vs. a developer who wants to understand what legal standards the evidence supports? Should the competitor comparison be a section within the guide or a standalone page? How should the "not legal advice" disclaimer be positioned so it is visible but does not undermine confidence? Note: the existing verification.md already covers the trust model (Ed25519, RFC 3161, WACZ structure) in detail — the new page should reference it rather than duplicate it. Also note: product-marketing-minion will recommend where on the landing page the legal content lives; your focus is the docs site IA and the guide page itself.

## Context
Read these files in the working directory (/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/declarative-roaming-hamster):
- site/content/ — all existing docs pages (index.md, authentication.md, verification.md, batch.md, limits.md, mcp.md, schedules.md, webhooks.md)
- site/_data/site.js — navigation configuration
- site/_includes/layouts/ — base.njk, doc.njk
- site/eleventy.config.js — build configuration
- site/content/verification.md — existing trust model documentation (Ed25519, RFC 3161, WACZ structure, key rotation)

## Instructions
1. Read the existing docs structure to understand the pattern
2. Apply your documentation expertise to the IA question
3. Propose a page structure with section headings and reading order
4. Return your contribution in this format:

## Domain Plan Contribution: user-docs-minion

### Recommendations
<your expert recommendations for the guide page structure>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved, or "None">

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MyvylP/legal-evidence-positioning/phase2-user-docs-minion.md
