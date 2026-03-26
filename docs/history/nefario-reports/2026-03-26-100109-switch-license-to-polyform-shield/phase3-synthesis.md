## Delegation Plan

**Team name**: license-switch
**Description**: Switch WRL license from Apache 2.0 to PolyForm Shield 1.0.0 and update all references across the codebase.

### Conflict Resolution

**package.json license field**: devx-minion recommends `"SEE LICENSE IN LICENSE"` (npm convention for non-SPDX identifiers). The task brief suggested `"PolyForm-Shield-1.0.0"`. devx-minion is correct -- PolyForm Shield has no SPDX identifier, and inventing one would cause license scanner false positives. `"SEE LICENSE IN LICENSE"` is the established npm convention (used by MongoDB, Elastic, etc. post-relicense).

Chosen: `"SEE LICENSE IN LICENSE"`
Over: `"PolyForm-Shield-1.0.0"` (non-standard SPDX string)
Why: npm/SPDX convention for non-OSI licenses; avoids tooling false positives.

**compare.njk column header**: The comparison table uses "Open Source" as a column header with WRL showing "Apache 2.0". Keeping "Open Source" as the column header while WRL sits in that column with a PolyForm Shield badge implies WRL is open source -- contradicting the messaging fix across all other surfaces. Rename the column to "Source" (neutral term that works for all tools). Update `data-label` attributes across all rows to match. No footnote needed -- the cell values (Apache 2.0, Proprietary, PolyForm Shield, etc.) are self-explanatory.

### Pre-condition Verified

All commits are from `bp@ben-peter.com`, `github-actions[bot]`, or `noreply@anthropic.com` (Claude co-author). No external contributors exist. Relicensing requires no third-party consent.

---

### Task 1: Replace LICENSE file and update package.json + openapi.yaml
- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Replace the LICENSE file and update package metadata for PolyForm Shield 1.0.0.

    ## What to do

    1. **Replace `/Users/ben/github/benpeter/web-resource-ledger/LICENSE`** with the full text of PolyForm Shield 1.0.0. The canonical text is at https://polyformproject.org/licenses/shield/1.0.0/ -- fetch it and write it verbatim. Keep the existing copyright line: `Copyright 2026 Ben Peter`.

    2. **Update `/Users/ben/github/benpeter/web-resource-ledger/package.json`**: Change `"license": "Apache-2.0"` to `"license": "SEE LICENSE IN LICENSE"`. This is the npm convention for licenses without SPDX identifiers.

    3. **Update `/Users/ben/github/benpeter/web-resource-ledger/packages/verify/package.json`**: Same change -- `"license": "Apache-2.0"` to `"license": "SEE LICENSE IN LICENSE"`.

    4. **Update `/Users/ben/github/benpeter/web-resource-ledger/openapi.yaml`**: Lines 8-9 currently read:
       ```
       name: Apache 2.0
       identifier: Apache-2.0
       ```
       Change to:
       ```
       name: PolyForm Shield 1.0.0
       url: https://polyformproject.org/licenses/shield/1.0.0/
       ```
       Remove the `identifier` field (no SPDX identifier exists). Add a `url` field instead.

    5. **Do NOT touch** `package-lock.json` -- those entries describe dependency licenses, not WRL's license. They will remain accurate (the dependencies are still Apache-2.0 licensed).

    ## What NOT to do
    - Do not add per-file license headers
    - Do not modify any other files
    - Do not run `npm install` or modify lock files

- **Deliverables**: Updated `LICENSE`, `package.json`, `packages/verify/package.json`, `openapi.yaml`
- **Success criteria**: LICENSE contains PolyForm Shield 1.0.0 text with correct copyright; package.json files use `"SEE LICENSE IN LICENSE"`; openapi.yaml references PolyForm Shield with URL

### Task 2: Update CONTRIBUTING.md
- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Update CONTRIBUTING.md to reflect the PolyForm Shield 1.0.0 license.

    ## What to do

    File: `/Users/ben/github/benpeter/web-resource-ledger/CONTRIBUTING.md`

    1. **Add a "License" section** after the "Quick Start" section (before "Full Local Development"). Use this text:

       ```markdown
       ## License

       This project is licensed under [PolyForm Shield 1.0.0](LICENSE), a source-available
       license. The source code is public and you are free to use, modify, and share it --
       but you may not use it to offer a product that competes with Web Resource Ledger.

       By submitting a pull request, you agree that your contribution is licensed under the
       same terms. If you have questions about whether your intended use is permitted, open
       an issue and ask.
       ```

    2. **Update the footer line** (line 131): Change `- License: contributions are licensed under [Apache 2.0](LICENSE)` to `- License: [PolyForm Shield 1.0.0](LICENSE)`. The detailed explanation is now in the section above.

    ## What NOT to do
    - Do not mention CLA or hint at future CLA requirements
    - Do not add lengthy legal disclaimers -- the LICENSE file is the legal document
    - Do not change anything else in CONTRIBUTING.md

- **Deliverables**: Updated `CONTRIBUTING.md` with License section and updated footer
- **Success criteria**: License section present after Quick Start; footer references PolyForm Shield; no mention of Apache 2.0; no CLA mention

### Task 3: Update README.md and packages/verify/README.md
- **Agent**: product-marketing-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Update README files to reflect the PolyForm Shield 1.0.0 license.

    ## What to do

    ### File 1: `/Users/ben/github/benpeter/web-resource-ledger/README.md`

    1. **Update the license badge** (line 3). Change from:
       `[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)`
       to:
       `[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/License-PolyForm%20Shield%201.0.0-blue.svg)](LICENSE)`

    2. **Update the license section** (around line 507). Change from:
       `[Apache 2.0](LICENSE)`
       to:
       `[PolyForm Shield 1.0.0](LICENSE) -- source-available. You may use, modify, and self-host WRL for any purpose except offering a competing web capture service. See [LICENSE](LICENSE) for the full text.`

    3. **Search for any other "Apache" or "open source" references** in the README and update them. Replace "open source" with "source-available" or "public source code" as contextually appropriate.

    ### File 2: `/Users/ben/github/benpeter/web-resource-ledger/packages/verify/README.md`

    Line 162 currently says `[Apache 2.0](../../LICENSE)`. Change to:
    `[PolyForm Shield 1.0.0](../../LICENSE)`

    ## Terminology rules
    - Never use "open source" to describe WRL -- use "source-available" or "public source code"
    - Lead with what users CAN do (self-host, audit, modify) rather than the restriction
    - The restriction is narrow: only competing web capture services are prohibited

    ## What NOT to do
    - Do not rewrite sections unrelated to the license
    - Do not add a "why we changed" section

- **Deliverables**: Updated `README.md` and `packages/verify/README.md`
- **Success criteria**: Badge shows PolyForm Shield; license section has plain-language summary; no "Apache" or "open source" references remain in either README

### Task 4: Update landing page files
- **Agent**: product-marketing-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Update all landing page files to reflect the PolyForm Shield 1.0.0 license.

    ## What to do

    All files are under `/Users/ben/github/benpeter/web-resource-ledger/landing/public/`.

    ### Footer tagline (6 files)
    In each of these files, change:
    `Open source under Apache 2.0. Independently verifiable by design.`
    to:
    `Source code public under PolyForm Shield. Independently verifiable by design.`

    Files: `index.html`, `404.html`, `privacy.html`, `security.html`, `refund-policy.html`, `terms.html`, `content-policy.html`

    ### index.html specific changes

    1. **Structured data featureList** (line 74): Change `"Self-hostable (Apache 2.0)"` to `"Self-hostable (PolyForm Shield 1.0.0)"`

    2. **FAQ structured data** (line 190): Change the FAQ answer text from:
       `"Yes. WRL is open source under the Apache 2.0 license. You can deploy it on your own Cloudflare Workers infrastructure. The hosted service at api.webresourceledger.com is the same codebase."`
       to:
       `"Yes. WRL's full source code is public on GitHub. You can deploy it on your own Cloudflare Workers infrastructure for internal use. The hosted service at api.webresourceledger.com is the same codebase. The PolyForm Shield license permits all uses except offering a competing web capture service."`

    3. **Visible FAQ answer** (line 545): Apply the same text change as above to the visible FAQ `<dd>` element.

    ### security.html specific changes

    1. **Meta descriptions** (lines 7, 15, 21): In all three meta tags, change "open source" to "source-available". The descriptions read: `"...RFC 3161 timestamps, open source."` -- change to `"...RFC 3161 timestamps, source-available."`

    2. **Intro paragraph** (line 52): Change `"open-source codebase"` to `"public codebase"`

    3. **Open Source section heading** (line 84): Change `<h2>Open Source</h2>` to `<h2>Public Source Code</h2>`

    4. **Open Source section body** (line 85): Change from:
       `"The full WRL codebase is published on GitHub under the Apache 2.0 license. Every security claim on this page can be verified by reading the code. No trust in our assertions required."`
       to:
       `"The full WRL codebase is published on <a href=\"https://github.com/benpeter/web-resource-ledger\">GitHub</a> under the PolyForm Shield 1.0.0 license. Every security claim on this page can be verified by reading the code. No trust in our assertions required."`

    ### llms.txt
    File: `/Users/ben/github/benpeter/web-resource-ledger/landing/public/llms.txt`
    Line 16: Change `"Self-hostable under Apache 2.0"` to `"Self-hostable under PolyForm Shield 1.0.0 (source-available; all uses permitted except competing web capture services)"`

    ## Terminology rules
    - Never use "open source" to describe WRL
    - Use "source-available", "public source code", or "public codebase"
    - Lead with what users CAN do
    - The restriction applies only to competing web capture services

    ## What NOT to do
    - Do not add a "why we changed" explanation to the landing page
    - Do not restructure pages or change content unrelated to the license
    - Do not touch CSS or layout

- **Deliverables**: Updated `index.html`, `404.html`, `privacy.html`, `security.html`, `refund-policy.html`, `terms.html`, `content-policy.html`, `llms.txt`
- **Success criteria**: No instance of "Apache 2.0" or "open source" (describing WRL) remains in any landing page file

### Task 5: Update docs site files
- **Agent**: product-marketing-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Update docs site files to reflect the PolyForm Shield 1.0.0 license.

    ## What to do

    All files are under `/Users/ben/github/benpeter/web-resource-ledger/site/content/`.

    ### compare.njk
    File: `/Users/ben/github/benpeter/web-resource-ledger/site/content/compare.njk`

    1. **Column header** (line 26): Change `<th scope="col">Open Source</th>` to `<th scope="col">Source</th>`

    2. **WRL row** (line 38): Change `<span class="badge badge--pass">Apache 2.0</span>` to `<span class="badge badge--pass">PolyForm Shield</span>`

    3. **All `data-label` attributes**: In every row, change `data-label="Open Source"` to `data-label="Source"`. There are ~10 rows in the table.

    4. **No footnote needed** -- the cell values speak for themselves.

    ### security/index.md
    File: `/Users/ben/github/benpeter/web-resource-ledger/site/content/security/index.md`

    Line 9: Change `"open-source codebase"` to `"public codebase"` (this appears in the intro paragraph).

    ### security/whitepaper.md
    File: `/Users/ben/github/benpeter/web-resource-ledger/site/content/security/whitepaper.md`

    Line 451: Change `"Open source codebase"` to `"Public source code"` in the table.

    ### legal-evidence.md
    File: `/Users/ben/github/benpeter/web-resource-ledger/site/content/legal-evidence.md`

    Line 152: The phrase "open-source package" here refers to the verifier package specifically, which remains accurately described as open-source if it is separately licensed. Check `/Users/ben/github/benpeter/web-resource-ledger/packages/verify/package.json` -- if it shares WRL's license, change "open-source" to "source-available". If it has its own permissive license, leave it.

    ## Terminology rules
    - "open source" -> "source-available" or "public source code" when describing WRL
    - Do not change references to other tools' open-source status

    ## What NOT to do
    - DO rename the column header from "Open Source" to "Source" and update all data-label attributes
    - Do not restructure content or change non-license-related text

- **Deliverables**: Updated `compare.njk`, `security/index.md`, `security/whitepaper.md`, `legal-evidence.md`
- **Success criteria**: No "Apache 2.0" references remain in docs site describing WRL; "open source" replaced with "source-available" or "public source code" when describing WRL; comparison table column renamed to "Source"

### Task 6: Evolution log entry
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2, Task 3, Task 4, Task 5
- **Approval gate**: no
- **Prompt**: |
    Create the evolution log entry for the license switch phase.

    ## What to do

    The next phase number is **0092**. Create the directory and files:

    1. **Create directory**: `/Users/ben/github/benpeter/web-resource-ledger/docs/evolution/0092-license-switch/`

    2. **Create `prompt.md`**: Document the task as given:
       "Switch license from Apache 2.0 to PolyForm Shield 1.0.0. WRL is relicensed under PolyForm Shield 1.0.0, so the source remains fully public but competitors cannot use the code to offer a competing web capture service. No time-based conversion -- the protection is permanent."

    3. **Create `decisions.md`**: Document these key decisions:
       - **License choice**: PolyForm Shield 1.0.0 chosen over FSL, BSL, SSPL, and CC licenses. PolyForm Shield is the narrowest restriction -- it only prevents competitors from offering a competing service. No time-based conversion to permissive (unlike BSL/FSL).
       - **Terminology**: "source-available" chosen over "open source" (inaccurate for non-OSI license) and "community license" (vague). Follows industry precedent from Elastic, HashiCorp, Sentry relicensing.
       - **package.json field**: `"SEE LICENSE IN LICENSE"` chosen over `"PolyForm-Shield-1.0.0"` because PolyForm Shield has no SPDX identifier. npm convention for non-SPDX licenses.
       - **CLA**: Not added. Explicit decision to use inbound=outbound via CONTRIBUTING.md statement rather than CLA. CLA creates contributor friction disproportionate to current project scale.
       - **No "why we changed" on landing page**: Landing page serves prospective customers who have no relationship with Apache 2.0. Changelog/blog post is appropriate for existing users (flagged as future task, not in scope).

    4. **Create `outcome.md`**: Summarize what changed:
       - LICENSE file replaced with PolyForm Shield 1.0.0 text
       - package.json and packages/verify/package.json license fields updated
       - openapi.yaml license info updated
       - CONTRIBUTING.md rewritten with License section and inbound=outbound clause
       - README.md and packages/verify/README.md license references updated
       - 7 landing page HTML files updated (footer tagline, FAQ, structured data, meta descriptions)
       - llms.txt updated with license clarification for LLM consumers
       - 4 docs site files updated (compare.njk with footnote, security pages, legal-evidence)
       - All "open source" references describing WRL changed to "source-available" or "public source code"
       - Backlog changes: none (this phase was not in the backlog; no new items deferred)

    5. **Update the index**: Add this line to `/Users/ben/github/benpeter/web-resource-ledger/docs/evolution/README.md`:
       `| [0092-license-switch](0092-license-switch/) | License switch from Apache 2.0 to PolyForm Shield 1.0.0: all references updated across codebase, landing pages, docs site |`

    ## What NOT to do
    - Do not create a `process.md` -- that is written separately after PR creation
    - Do not modify any source files
    - Keep documents factual and concise per the project's evolution log conventions

- **Deliverables**: `docs/evolution/0092-license-switch/prompt.md`, `decisions.md`, `outcome.md`; updated `docs/evolution/README.md`
- **Success criteria**: All three evolution log files exist with accurate content; README.md index updated with the new phase

---

### Cross-Cutting Coverage

- **Testing**: EXCLUDED. This is a text/documentation change only -- no executable code is modified. No tests to write or run. The existing test suite will be run in Phase 6 as a regression check.
- **Security**: EXCLUDED. No attack surface change, no auth/secrets/infrastructure changes. The license is a legal instrument, not a security control. security-minion reviews at Phase 3.5.
- **Usability -- Strategy**: INCLUDED via product-marketing-minion's copy recommendations (Tasks 3-5). The messaging strategy -- leading with what users CAN do rather than the restriction -- is a UX-strategy concern that product-marketing-minion addressed directly. ux-strategy-minion reviews at Phase 3.5.
- **Usability -- Design**: EXCLUDED. No UI components, visual layouts, or interaction patterns change. This is text-only.
- **Documentation**: INCLUDED. Task 6 (evolution log) covers architectural documentation. Tasks 3-5 update user-facing documentation (README, landing pages, docs site). software-docs-minion handles the evolution log. product-marketing-minion handles the copy.
- **Observability**: EXCLUDED. No runtime components, services, or APIs are modified.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - product-marketing-minion: Already authored the copy recommendations; no separate review needed since they produced Tasks 3-5.
- **Not selected**:
  - ux-design-minion: No UI components or visual changes -- text replacements only.
  - accessibility-minion: No HTML structure changes that affect accessibility -- text content swaps preserve existing DOM.
  - sitespeed-minion: No runtime code or asset changes.
  - observability-minion: No runtime components.
  - user-docs-minion: product-marketing-minion already covered all user-facing copy; software-docs-minion covers the evolution log. No separate user docs task needed.

### Decisions

- **package.json license field**
  Chosen: `"SEE LICENSE IN LICENSE"` (npm convention)
  Over: `"PolyForm-Shield-1.0.0"` (invented SPDX string, per task brief)
  Why: PolyForm Shield has no SPDX identifier. Non-standard strings cause license scanner false positives. `"SEE LICENSE IN LICENSE"` is the established convention used by MongoDB, Elastic, and others post-relicense.

- **compare.njk column header**
  Chosen: Rename column from "Open Source" to "Source" and update all data-label attributes
  Over: Keep "Open Source" header with footnote disclaimer
  Why: Keeping WRL in an "Open Source" column while saying "PolyForm Shield" contradicts the messaging fix applied everywhere else. "Source" is neutral and accurate for all tools.

- **CLA deferral messaging**
  Chosen: Silence (no mention of CLA in CONTRIBUTING.md)
  Over: "We may add a CLA in the future" disclaimer (per devx-minion recommendation)
  Why: Mentioning potential future CLA creates contributor uncertainty and chilling effect. Either require a CLA or don't. Currently don't.

### Risks and Mitigations

1. **"Source-available" perceived as downgrade** (Medium): Lead with what users can do (self-host, audit, modify). The restriction only affects competitors building rival web capture services -- irrelevant to WRL's target personas (legal, compliance, journalism, AI agents).

2. **GitHub license detection shows "Other"** (Low): Expected behavior for non-SPDX licenses. Cosmetic only -- the LICENSE file and README clearly identify PolyForm Shield 1.0.0.

3. **Cached "open source" references in search engines and AI retrievers** (Low): Landing page, llms.txt, and structured data updates will propagate over time. No immediate action needed beyond updating canonical sources.

4. **Self-hosting messaging ambiguity** (Medium): FAQ and README explicitly state self-hosting is permitted. The restriction is narrow and specifically called out: "only offering a competing web capture service."

5. **Inbound=outbound without CLA is legally weaker than CLA** (Low, accepted): Adequate for current project scale with no external contributors. Revisit if external contribution increases.

### Execution Order

```
Batch 1 (parallel): Task 1, Task 2, Task 3, Task 4, Task 5
Batch 2 (sequential): Task 6 (after all of Batch 1)
```

No approval gates needed. All tasks are text replacements with clear, pre-defined copy. Easy to reverse (git revert). Low blast radius within each task. No downstream dependencies beyond the evolution log needing to reference completed work.

### Verification Steps

1. `grep -ri "Apache" --include="*.md" --include="*.json" --include="*.html" --include="*.txt" --include="*.yaml" | grep -v package-lock | grep -v node_modules | grep -v docs/evolution | grep -v docs/history | grep -v docs/backlog` -- should return zero results (excluding dependencies and historical evolution logs)
2. `grep -ri "open.source" --include="*.html" --include="*.md" | grep -v node_modules | grep -v docs/evolution | grep -v docs/history | grep -v site/content/compare.njk | grep -v site/content/legal-evidence.md` -- should return zero results describing WRL as open source (compare.njk and legal-evidence.md may reference other tools' open-source status)
3. LICENSE file starts with "PolyForm Shield License 1.0.0"
4. `jq .license package.json` returns `"SEE LICENSE IN LICENSE"`
5. Evolution log directory `docs/evolution/0092-license-switch/` exists with prompt.md, decisions.md, outcome.md
6. `docs/evolution/README.md` contains 0092 entry
