MODE: SYNTHESIS
ADVISORY: true

You are synthesizing specialist planning contributions into a team recommendation. Advisory-only -- no code, no branches, no PRs.

## Original Task
Should we add a collapsible "Verify independently" section to the verify page with a copy-to-clipboard npx command for the existing @w-r-l/verify CLI tool?

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-zdnDkL/verify-page-npx-copy-command/phase2-ux-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-zdnDkL/verify-page-npx-copy-command/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-zdnDkL/verify-page-npx-copy-command/phase2-accessibility-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-zdnDkL/verify-page-npx-copy-command/phase2-ux-strategy-minion.md

## Key consensus across specialists:
- ux-design-minion: New standalone <details> after "Cryptographic details", before footer. Ghost copy button top-right of code block with 44x44 touch target, icon swaps to checkmark on success. Only render when verified === true.
- security-minion: Clean security profile. captureId has no shell metacharacters, origin is server-controlled, Clipboard API compatible with CSP. Only requirement: use textContent not innerHTML.
- accessibility-minion: Native <button> with aria-label, dedicated <span aria-live="polite" role="status"> for feedback (must be in initial template). No custom ARIA on <details>. 24x24 min target. Clear status after 3-5s.
- ux-strategy-minion: Strong yes. Show on BOTH verified and failed pages. "Verify independently" is right text. Body should explain CLI validates timestamp chain. Pre-populate command.

## Conflict to resolve:
- ux-design-minion says only render on verified === true
- ux-strategy-minion says show on failed verifications too (independent verification is MORE valuable on failure)

## Instructions
1. Review all specialist contributions
2. Resolve the verified-only vs. always-show conflict
3. Identify consensus and dissent
4. Produce advisory report with executive summary, consensus, dissenting views, evidence, risks, next steps, conflict resolutions
5. Write to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-zdnDkL/verify-page-npx-copy-command/phase3-synthesis.md
