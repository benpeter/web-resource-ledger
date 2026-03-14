# Domain Plan Contribution: software-docs-minion

## Recommendations

### 1. SECURITY.md: Tone and Phrasing

**Support policy ("latest on main only"):**
Frame it as a natural consequence of the project's stage, not an apology. The project has no versioned releases yet, so there is exactly one deployable artifact: whatever is on `main`. State this directly.

Recommended phrasing:

> **Supported versions**
>
> Web Resource Ledger does not publish versioned releases yet. Security
> fixes are applied to the `main` branch. We recommend always running
> the latest commit on `main`.

This is factual and forward-looking ("yet" implies versioned releases may come). It avoids defensive language like "we only support..." which sounds like a limitation being imposed rather than a stage of maturity.

**Response time ("no SLA"):**
The key is to be honest about capacity without undermining confidence. The pattern that works well for small projects: acknowledge the report, set a realistic expectation, and show you take it seriously even without enterprise guarantees.

Recommended phrasing:

> We will acknowledge receipt of your report within 72 hours and aim to
> provide an initial assessment within 7 days. These are goals, not
> guarantees -- this is a small project maintained in spare time. We do
> take every report seriously.

The "goals, not guarantees" framing is better than "no SLA" (which is a contract term that sounds cold in a community document). Giving concrete timeframes (72 hours, 7 days) shows intent without creating a legally binding commitment. The candid "maintained in spare time" sets expectations without being self-deprecating.

**Reporting channel:**
GitHub Security Advisories (GHSA) is the right choice. It gives the reporter a private channel, integrates with GitHub's CVE workflow, and does not require any infrastructure from the maintainer. Phrase it as:

> **Reporting a vulnerability**
>
> Please report security vulnerabilities through
> [GitHub Security Advisories](https://github.com/benpeter/web-resource-ledger/security/advisories/new).
> This creates a private discussion where we can assess the issue before
> any public disclosure.
>
> **Please do not open a public issue for security vulnerabilities.**

The "please do not" at the end is a standard convention that reporters expect to see. It reinforces the private channel without being preachy.

**No bug bounty:**
Simply omit mention of bug bounties. Stating "we don't have a bug bounty" draws attention to what you lack. If you say nothing, no expectation is created. Only add this section if you receive questions about it (YAGNI applies to documentation too).

### 2. CONTRIBUTING.md: Evolution Log Reference

**Yes, link to the evolution log -- but frame it as context, not a requirement.**

The evolution log is a distinguishing feature of this project. Contributors arriving from GitHub will see `docs/evolution/` in the tree and wonder what it is. Ignoring it in CONTRIBUTING.md leaves that question unanswered. But making it a contribution requirement would be premature and intimidating for casual contributors.

Recommended approach -- a short "About this project" or "How this project is built" section near the top of CONTRIBUTING.md (after prerequisites, before contribution workflow):

> ## How this project is built
>
> Web Resource Ledger is built transparently using AI agent orchestration.
> Each development phase is documented in
> [`docs/evolution/`](docs/evolution/) -- including the prompts, decisions,
> and outcomes. This log is part of the project's identity, not just
> internal notes.
>
> You do not need to write evolution log entries for your contributions.
> The maintainers handle that.

This accomplishes three things:
1. Explains a non-obvious directory that contributors will notice
2. Signals the project's transparency values (which may attract contributors)
3. Explicitly removes burden from contributors ("maintainers handle that")

**Do not require contributors to write evolution log entries.** The evolution log has a specific structure (prompt.md, decisions.md, outcome.md, process.md) and is tied to the nefario orchestration workflow. Asking external contributors to follow this process would be confusing and create friction. The maintainer can fold external contributions into the evolution log as part of the merge workflow.

### 3. CODE_OF_CONDUCT.md: Contact Info

Use Contributor Covenant v2.1 verbatim. The only project-specific customization needed is in the "Enforcement" section, which requires:

1. **Contact method**: Use a GitHub-native mechanism rather than a personal email. Options:
   - **GitHub Security Advisories** (for private reporting): reuse the same mechanism as SECURITY.md
   - **GitHub Issues** (for public concerns): lower barrier but lacks privacy for sensitive reports

   Recommended: provide both. Code of conduct violations can range from "someone was rude in a PR comment" (public issue is fine) to "someone is being harassed" (needs private channel). GitHub Security Advisories can serve double duty here without adding any new infrastructure.

   > Instances of abusive, harassing, or otherwise unacceptable behavior may
   > be reported by opening an issue or by contacting the maintainers privately
   > through [GitHub Security Advisories](https://github.com/benpeter/web-resource-ledger/security/advisories/new).

2. **Enforcement responsibility**: Since this is a single-maintainer project, the enforcement entity is "the project maintainers" (even if that is one person). Avoid naming individuals in the document -- it survives personnel changes better.

### 4. Document Cross-References

The community documents should form a coherent navigation structure without creating a tangled web. Here is the minimal cross-reference graph:

- **README.md** (existing, not modified in this phase): Already serves as the front door. Future phases may add links to CONTRIBUTING.md and LICENSE, but that is out of scope.
- **CONTRIBUTING.md** should reference:
  - `SECURITY.md` -- "For security vulnerabilities, see [SECURITY.md](SECURITY.md) instead of opening a public issue."
  - `CODE_OF_CONDUCT.md` -- "All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md)."
  - `LICENSE` -- "By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE)."
  - `docs/evolution/` -- context section as described in recommendation 2
  - `CLAUDE.md` (engineering philosophy) -- "This project follows the [Helix Manifesto](https://github.com/adobe/helix-home/blob/main/manifesto.md). Vanilla JS, YAGNI, KISS."
- **SECURITY.md** should reference:
  - Nothing else. Security docs should be self-contained. A reporter needs exactly one document to know what to do. Adding links to CODE_OF_CONDUCT or CONTRIBUTING creates distraction.
- **CODE_OF_CONDUCT.md** should reference:
  - Nothing else. Contributor Covenant v2.1 is self-contained by design. Adding project-specific links would require maintaining a fork of the covenant text.

**Rationale for minimal cross-references**: Each document serves a distinct audience at a distinct moment. A security reporter is not reading the contributing guide. A new contributor is not reading the security policy (yet). Let each document stand alone for its primary audience, with only the essential "go here instead" pointers.

### 5. Evolution Log and External Contributors

**Contributors should NOT write evolution log entries.** Reasoning:

1. **The format is coupled to the agent orchestration workflow.** The four-file structure (prompt.md, decisions.md, outcome.md, process.md) assumes a nefario-driven development cycle. External contributors submitting PRs are not working within that workflow.

2. **The maintainer has the full context.** Evolution log entries require knowledge of what was considered and rejected, how agents disagreed, and how the human resolved conflicts. Only the person running the orchestration has that context.

3. **It creates friction.** Requiring four additional markdown files for a contribution would deter casual contributors and first-timers. YAGNI -- wait until you have enough contributors that the process needs to be formalized.

4. **The CONTRIBUTING.md should mention that the evolution log exists** (recommendation 2) so contributors understand what it is, but explicitly state that maintainers handle it.

If the project later grows to have regular external contributors whose work constitutes "significant development phases," the process can be revisited. For now, keep the barrier low.

## Proposed Tasks

### Task A: SECURITY.md

**Deliverable**: `/SECURITY.md`

**Structure**:
1. Supported Versions (latest on main, no versioned releases yet)
2. Reporting a Vulnerability (GHSA link, do not open public issues)
3. What to Expect (72h acknowledgment goal, 7-day assessment goal, goals-not-guarantees caveat)
4. Scope (what counts as a security issue vs. a bug)
5. Disclosure (coordinate with reporter, credit in advisory)

**Length**: ~40 lines. No boilerplate walls of text.

**Dependency**: None. Can be written independently.

### Task B: CONTRIBUTING.md

**Deliverable**: `/CONTRIBUTING.md`

**Structure**:
1. How this project is built (evolution log context, AI agent transparency)
2. Prerequisites (Node 18+, npm)
3. Getting Started (fork, clone, `npm install`, `npm test`)
4. Development (what needs `.dev.vars` and Cloudflare account vs. what does not)
5. Making Changes (branch, commit messages, PR description expectations)
6. Tests (`npm test` is self-contained via Miniflare, `npm run lint:api` for OpenAPI)
7. Code Style (vanilla JS, YAGNI, KISS -- link to Helix Manifesto, no frameworks unless justified)
8. License (Apache 2.0, contributions under same license)
9. Code of Conduct (link to CODE_OF_CONDUCT.md)
10. Security (link to SECURITY.md for vulnerability reports)

**Length**: ~80-100 lines. Concise, scannable, task-oriented.

**Dependency**: Consult devx-minion contribution for Miniflare/Cloudflare-specific gotchas to include.

### Task C: CODE_OF_CONDUCT.md

**Deliverable**: `/CODE_OF_CONDUCT.md`

**Content**: Contributor Covenant v2.1 verbatim, with enforcement contact details customized to use GitHub issues and GitHub Security Advisories (for private reports).

**Length**: Standard Contributor Covenant length (~130 lines).

**Dependency**: None.

### Task D: Cross-Reference Audit

After all three documents are written, verify:
- CONTRIBUTING.md links to SECURITY.md, CODE_OF_CONDUCT.md, LICENSE, docs/evolution/, and Helix Manifesto
- SECURITY.md is self-contained (no outbound links to other community docs)
- CODE_OF_CONDUCT.md has correct GHSA link for private reporting
- All relative links resolve correctly from repo root

**Dependency**: Tasks A, B, C complete.

## Risks and Concerns

1. **GHSA link correctness**: The GitHub Security Advisories URL format is `https://github.com/{owner}/{repo}/security/advisories/new`. If the repo is renamed or transferred, the link breaks. This is an acceptable risk -- the same applies to every GitHub-hosted link. Mitigated by using the standard URL pattern.

2. **Contributor Covenant version pinning**: v2.1 is current as of 2024. The covenant is occasionally updated. The document should include the version number and link to the canonical source so it is clear which version was adopted. Future updates are a new decision (and would warrant an ADR if they change enforcement mechanisms).

3. **Evolution log explanation may confuse contributors**: Mentioning AI agent orchestration in CONTRIBUTING.md could be polarizing. Some contributors will find it interesting; others may be put off. The recommended framing is factual and brief -- it does not evangelize, it explains. If this becomes an issue, the section can be trimmed to a single sentence.

4. **Scope creep into README changes**: The meta-plan excludes README.md changes. Once CONTRIBUTING.md exists, the README would benefit from a "Contributing" section with a link. This is a natural follow-up but must remain out of scope for this phase. Note it in the evolution log outcome.md as a deferred item.

5. **Tone mismatch across documents**: SECURITY.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md are written by different hands (or at different times). They should share a consistent voice: direct, respectful, no corporate boilerplate. Since all three are being created in one phase, this is an opportunity to ensure consistency. The implementer should read all three sequentially before committing.

## Additional Agents Needed

None. The three consultation agents (iac-minion, devx-minion, software-docs-minion) plus the mandatory Phase 3.5 reviewers cover all required perspectives. The documents are straightforward markdown with no runtime implications, no API contract changes, and no security surface modifications.
