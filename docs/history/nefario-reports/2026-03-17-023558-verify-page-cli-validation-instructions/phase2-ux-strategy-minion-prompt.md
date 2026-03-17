You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Should we update the verify page with CLI instructions for cryptographic validation?

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed into a team recommendation, not an execution plan. Focus on analysis, trade-offs, and recommendations rather than implementation tasks.

## Your Planning Question
Where on the page do CLI instructions go without cluttering the trust interface for casual users? Should they be static or dynamic (pre-filled with the actual capture's hash/ID)? Third disclosure section vs nested inside existing crypto details? Or should they live on a separate documentation page instead of the verify page itself?

## Context
Read the verify page source for the current layout:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/verify-page.js

Key facts about the current verify page layout:
1. Status banner (verified/unverified) -- primary trust signal
2. Capture metadata section (URL, date)
3. Verification checks list (pass/fail/skip)
4. Screenshot section
5. "Capture details" disclosure (collapsible)
6. "Cryptographic details" disclosure (collapsible, shows bundle hash, signed at, public key URL, TSA info)
7. Footer with Terms and Report Abuse links

The page serves two audiences:
- Casual users: want green checkmark confirmation, URL, date, screenshot
- Technical users: want to independently verify the cryptographic claims

Project principles: YAGNI, KISS, the verify page is the primary user-facing trust artifact

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the format specified
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BZ3vZv/verify-page-cli-validation-instructions/phase2-ux-strategy-minion.md`
