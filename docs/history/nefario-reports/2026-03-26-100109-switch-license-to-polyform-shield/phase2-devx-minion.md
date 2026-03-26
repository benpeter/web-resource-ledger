# Domain Plan Contribution: devx-minion

## Recommendations

### CONTRIBUTING.md must be rewritten with license clarity as a first-class concern

The current CONTRIBUTING.md has a single line at the bottom: "License: contributions are licensed under Apache 2.0". This is insufficient for PolyForm Shield. The key difference contributors need to understand:

1. **PolyForm Shield is not OSI-approved open source.** It is source-available. Contributors who care about the distinction (and many do) must be told upfront, not discover it from the LICENSE file after they have already invested effort.

2. **The noncompete restriction flows to contributions.** Under PolyForm Shield, anyone can use, modify, and redistribute the software -- but they cannot use it to build a competing product. Contributors need to understand that their code will be governed by this restriction. This is not a downside for most contributors (they are contributing because they use the product, not because they want to fork a competitor), but transparency is non-negotiable for trust.

3. **No inbound=outbound ambiguity.** Apache 2.0 Section 5 has a built-in "inbound=outbound" clause (contributions are automatically under the same license unless stated otherwise). PolyForm Shield has no such clause. CONTRIBUTING.md should state explicitly: "By submitting a pull request, you agree that your contribution is licensed under PolyForm Shield 1.0.0, the same license that covers the project." This is the minimum viable contribution agreement -- it does not require a CLA, but it removes ambiguity.

### What to say about CLA deferral

The CONTRIBUTING.md should NOT mention CLA at all. Mentioning "we might add a CLA later" creates uncertainty and discourages contributions. Either you require a CLA or you do not. Right now you do not. If this changes in the future, that is a future change to CONTRIBUTING.md. Silence is the correct stance -- it avoids the chilling effect of "terms may change."

### Contributor experience: make the license stance scannable

Contributors read CONTRIBUTING.md in two modes: (a) quick scan before their first PR, and (b) reference when something goes wrong. The license section should be:

- Near the top (not buried at the bottom as a footer line)
- A short, plain-language section titled "License" or "Licensing"
- 3-5 sentences maximum
- Link to the full PolyForm Shield 1.0.0 text
- State what it means practically: source is public, contributions welcome, competitors cannot use the code to offer a competing web capture service

Avoid legalese in CONTRIBUTING.md. The LICENSE file is the legal document. CONTRIBUTING.md is the human-readable explanation.

### Suggested CONTRIBUTING.md license section text

```markdown
## License

This project is licensed under [PolyForm Shield 1.0.0](LICENSE), a source-available
license. The source code is public and you are free to use, modify, and share it --
but you may not use it to offer a product that competes with Web Resource Ledger.

By submitting a pull request, you agree that your contribution is licensed under the
same terms. If you have questions about whether your intended use is permitted, open
an issue and ask.
```

This is 4 sentences. It covers: what the license is, what you can do, what you cannot do, how contributions work, and where to get help. No legalese, no hedging, no CLA threats.

## Proposed Tasks

### Task 1: Rewrite CONTRIBUTING.md license section
- **Deliverable**: Updated CONTRIBUTING.md with a "License" section near the top (after "Quick Start", before "Full Local Development") containing the plain-language explanation above
- **Dependencies**: Final LICENSE file must be decided first (so the link target is correct)
- **Effort**: Small -- text change only

### Task 2: Update the footer reference
- **Deliverable**: Change the bottom line from `License: contributions are licensed under [Apache 2.0](LICENSE)` to `License: [PolyForm Shield 1.0.0](LICENSE)` (the detailed explanation is now in the section above, so the footer just needs the link)
- **Dependencies**: Task 1
- **Effort**: Trivial

### Task 3: Verify no other files reference "Apache" in contributor-facing context
- **Deliverable**: Grep for "Apache" and "Apache-2.0" across the repo. Update any references in CODE_OF_CONDUCT.md, SECURITY.md, README, package.json (`"license"` field), or GitHub repo settings. The `package.json` license field should change from `"Apache-2.0"` to `"SEE LICENSE IN LICENSE"` (SPDX does not have a standard identifier for PolyForm Shield, so the pointer-to-file convention is correct).
- **Dependencies**: None (can run in parallel with Task 1)
- **Effort**: Small

## Risks and Concerns

1. **Contributor deterrence.** Switching from a permissive OSI license to a source-available license will deter some contributors. This is a known and accepted trade-off, but the CONTRIBUTING.md language should minimize unnecessary friction. The goal is informed consent, not a warning wall.

2. **"Inbound=outbound" without a CLA is legally weaker.** A statement in CONTRIBUTING.md that "your contribution is licensed under PolyForm Shield" is a reasonable practice used by many projects, but it is not as robust as a signed CLA. If the project grows to have significant external contributors, revisiting CLA is advisable. This is explicitly out of scope now and should not block this phase.

3. **SPDX identifier gap.** PolyForm Shield does not have an SPDX short identifier. Package managers, license scanners, and dependency audit tools will flag the project as "unknown license" or "non-standard license." The `package.json` should use `"SEE LICENSE IN LICENSE"` rather than inventing a non-standard SPDX string. GitHub's license detection will also likely show "Other" instead of a recognized badge. This is cosmetic but worth noting.

4. **Existing contributions under Apache 2.0.** Code contributed before the license change was contributed under Apache 2.0 terms. If any external contributors exist, their contributions were made under Apache 2.0 and relicensing requires their consent (or the code must be rewritten). If all contributions are from the sole copyright holder, this is a non-issue. Verify the git history for external contributors.

## Additional Agents Needed

None -- this is a documentation and configuration change within the devx domain. The legal substance of the license choice is a business decision already made. If there are external contributors in the git history, a legal review of relicensing rights would be warranted, but that is outside the agent framework.
