# Domain Plan Contribution: product-marketing-minion

## Recommendations

### Terminology: use "source-available," never "open source"

The term "open source" has a precise definition (OSI-approved licenses granting unrestricted use, modification, and distribution). PolyForm Shield is explicitly not OSI-approved. Calling WRL "open source" after this switch would be factually wrong, and developers will call it out immediately. Projects that have tried to blur this line (Elastic, HashiCorp, Sentry) faced significant community backlash precisely because of misleading terminology.

The correct term is **"source-available."** Every piece of copy must use this term or a plain-language equivalent. Never use "open source" or "open-source" to describe the license.

Acceptable phrasing:
- "Source-available under PolyForm Shield 1.0.0"
- "Source code is public -- read, audit, and self-host"
- "Full source code on GitHub"

Unacceptable phrasing:
- "Open source" (inaccurate)
- "Free and open" (misleading about freedoms)
- "Community license" (vague, evasive)

### Framing strategy: lead with what you CAN do, not what you cannot

PolyForm Shield permits everything except competing with WRL's web capture service. For WRL's target personas (legal teams, compliance officers, journalists, AI agent builders), the restriction is irrelevant -- none of them are building competing capture services. The messaging should make this clear without being defensive.

**Core reframe:** The story is not "we took away your Apache 2.0 freedoms." The story is "the source is public, you can self-host, you can audit every line, and the only thing you cannot do is use our code to build a competing web capture service."

### Recommended copy for each touchpoint

**Footer tagline** (all pages):
- Current: "Open source under Apache 2.0. Independently verifiable by design."
- Proposed: "Source code public under PolyForm Shield. Independently verifiable by design."

**FAQ answer ("Can I self-host WRL?")**:
- Current: "Yes. WRL is open source under the Apache 2.0 license. You can deploy it on your own Cloudflare Workers infrastructure. The hosted service at api.webresourceledger.com is the same codebase."
- Proposed: "Yes. WRL's full source code is public on GitHub. You can deploy it on your own Cloudflare Workers infrastructure for internal use. The hosted service at api.webresourceledger.com is the same codebase. The PolyForm Shield license permits all uses except offering a competing web capture service."

**Structured data featureList**:
- Current: "Self-hostable (Apache 2.0)"
- Proposed: "Self-hostable (PolyForm Shield 1.0.0)"

**llms.txt**:
- Current: "Self-hostable under Apache 2.0"
- Proposed: "Self-hostable under PolyForm Shield 1.0.0 (source-available; all uses permitted except competing web capture services)"

**README badge**:
- Current: `[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)`
- Proposed: `[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/License-PolyForm%20Shield%201.0.0-blue.svg)](LICENSE)`

**README license section**:
- Current: `[Apache 2.0](LICENSE)`
- Proposed: `[PolyForm Shield 1.0.0](LICENSE) -- source-available. You may use, modify, and self-host WRL for any purpose except offering a competing web capture service. See [LICENSE](LICENSE) for the full text.`

**Security page** (security.html):
- Current references to "Apache 2.0 license" and "open-source codebase"
- Change "open-source codebase" to "public codebase" or "publicly available source code"
- Change "Apache 2.0 license" to "PolyForm Shield 1.0.0 license"
- The security transparency argument ("every security claim can be verified by reading the code") remains fully valid and should be preserved

### Do NOT add a defensive "why we changed" section to the landing page

The landing page is for prospective customers evaluating WRL. They have no relationship with Apache 2.0. A changelog blog post or GitHub discussion explaining the change is appropriate for existing users; the landing page should state the current license cleanly without relitigating the decision.

### Consider a brief blog post or GitHub discussion (out of scope but flagged)

Existing users and GitHub watchers will notice the change. A short, honest explanation acknowledging the switch, stating the reason (protecting the project's sustainability against competitors using the code to offer a competing service), and clarifying what has not changed (self-hosting is still permitted, source is still public, contributions are welcome) would preempt negative reactions. This is a content task, not a positioning task -- flagging for awareness.

## Proposed Tasks

### Task 1: Update all landing page license references
**Deliverables**: Modified `index.html`, `404.html`, `privacy.html`, `security.html`, `refund-policy.html`, `terms.html`, `content-policy.html` (footer tagline in all; FAQ and structured data in index.html; security transparency copy in security.html)
**Dependencies**: LICENSE file must be updated first (legal/code task, not mine)
**Scope**: Replace every instance of "open source under Apache 2.0" across all landing pages. Update FAQ answer. Update structured data featureList. Replace "open-source codebase" with "public codebase" in security.html. See detailed copy recommendations above.

### Task 2: Update llms.txt
**Deliverables**: Modified `landing/public/llms.txt`
**Dependencies**: None beyond the license change decision
**Scope**: Replace "Self-hostable under Apache 2.0" with the recommended phrasing that includes the PolyForm Shield scope clarification. LLMs ingesting this file need the nuance to avoid hallucinating that WRL is open source.

### Task 3: Update README badge and license section
**Deliverables**: Modified `README.md`
**Dependencies**: LICENSE file must be updated first
**Scope**: Replace badge, update license section with plain-language summary of what the license permits and restricts. This is the first thing developers see -- clarity here prevents misunderstanding.

### Task 4: Audit docs site for "open source" / "Apache 2.0" references
**Deliverables**: List of files requiring updates in `docs.webresourceledger.com` content
**Dependencies**: Need to check the docs site source (likely in a `docs/` directory or separate repo)
**Scope**: The docs site may reference the license in multiple places. Every instance needs updating. This is a search-and-replace audit, not a rewrite.

## Risks and Concerns

### Risk 1: "Source-available" is perceived as a downgrade by developer audience
**Severity**: Medium
**Mitigation**: Lead with what users can do (self-host, audit, modify for internal use) rather than framing around the restriction. The restriction only affects competitors building rival web capture services -- a group that is not WRL's target customer. For the actual target personas (legal, compliance, journalism, AI agents), nothing changes functionally.

### Risk 2: Existing content or third-party references say "open source"
**Severity**: Low-medium
**Mitigation**: Task 4 (audit) catches internal references. External references (blog posts, directories, community mentions) will take time to update organically. The README and landing page are the canonical sources -- getting those right is the priority.

### Risk 3: Self-hosting messaging becomes ambiguous
**Severity**: Medium
**Mitigation**: The FAQ and README must explicitly state that self-hosting for internal use is permitted. The restriction is narrow (competing services), but if the copy is vague, potential self-hosters may assume they cannot deploy it at all. Be specific: "You can deploy WRL on your own infrastructure. The only restriction is using our code to offer a competing web capture service to others."

### Risk 4: SEO/structured data misalignment
**Severity**: Low
**Mitigation**: The `featureList` in structured data currently says "Self-hostable (Apache 2.0)". Search engines and AI retrievers may cache the old version. Update promptly and ensure the `license` field in structured data points to the correct LICENSE file (it already points to `github.com/.../LICENSE`, which will update when the file changes).

### Risk 5: Meta descriptions mentioning "open source" in security.html
**Severity**: Low
**Mitigation**: The security page's meta description says "open source" -- this needs updating to avoid the term. Recommend changing to "publicly auditable source code" or simply removing the term from the meta description.

## Additional Agents Needed

None. The copy changes are straightforward text replacements guided by the recommendations above. The implementation agent handling the license file swap can apply these copy changes in the same PR. If a separate docs site exists with its own build/deploy, that may need a docs-focused agent -- but that is a conditional dependency, not a definite one.
