MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

R42: Legal-evidence positioning (landing + docs)

**Outcome**: WRL's landing page, documentation, and marketing copy use precise legal-evidence framing instead of vague compliance claims. The positioning shifts from "tamper-evident web archival" to "web evidence with FRE 901/902 authentication support and eIDAS-qualified timestamps." This gives legal-vertical prospects concrete, defensible claims rather than marketing buzzwords.

**Success criteria**:
- Landing page hero or feature section includes evidence-grade positioning:
  - "FRE 901(b)(9) - automated process producing accurate results"
  - "FRE 902(13) - self-authenticating certification documents"
  - "FRE 902(14) - SHA-256 hash integrity verification"
  - "eIDAS Article 41(2) - qualified timestamps with legal presumption of accuracy" (if R40 shipped)
- Documentation site has a dedicated "Legal Evidence" or "Admissibility" guide page explaining:
  - How WRL captures satisfy FRE authentication requirements
  - What the certification document contains and how to use it in proceedings
  - Comparison: WRL's cryptographic approach vs. traditional screenshots + affidavits
  - eIDAS qualified timestamps and what they mean for EU proceedings
  - Disclaimer: not legal advice, consult counsel
- Landing page removes or avoids vague terms like "FRCP compliant" or "legally admissible" without specifics
- Competitor comparison table on docs site includes integrity approach column
- Copy reviewed for accuracy: no overclaiming, every legal reference is to an actual rule/article

**Scope**:
- In: Landing page copy update, new docs guide page ("Legal Evidence"), competitor integrity comparison, precise legal-rule references
- Out: Attorney review (include disclaimer), jurisdiction-specific guides beyond US federal + EU, marketing campaigns, blog posts (separate pipeline)

**Constraints**:
- R40 (eIDAS timestamps): DONE (Phase 0063) - eIDAS claims CAN be included
- R41 (certification document): NOT shipped - 902(13) claims should be noted as future enhancement
- R19 (docs site): DONE - 11ty docs at docs.webresourceledger.com
- R23 (landing page): DONE - static HTML at webresourceledger.com
- Must not overclaim. "Supports FRE 901/902 authentication" is accurate. "Legally admissible" is a court determination, not a product feature.
- Budget: $30 - copywriting and HTML updates

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/declarative-roaming-hamster

## Codebase Context

### Landing Page
- `landing/public/index.html` — static HTML landing page, hero says "Web evidence you can prove."
- Hero section with tagline about signed, timestamped bundles
- Use cases: Legal Evidence, Compliance Archiving, AI Agent Grounding, Journalism and Research
- How It Works: Capture → Sign → Verify
- Pricing section with Explore/Evidence/On-Premise tiers

### Docs Site (11ty)
- `site/content/` — markdown pages: index.md, authentication.md, verification.md, batch.md, limits.md, mcp.md, schedules.md, webhooks.md
- `site/content/api-reference.njk` — generated from OpenAPI
- `site/_data/site.js` — navigation configuration
- `site/_includes/layouts/` — base.njk, doc.njk
- No existing "Legal Evidence" or "Admissibility" guide page

### Current Verification Docs
- `site/content/verification.md` — explains Ed25519 signatures, RFC 3161, WACZ structure, key rotation
- Already has trust model explanation but no legal-evidence framing

### Dependencies Status
- R40 (eIDAS): DONE — dual-TSA WACZ, account opt-in, Stripe meter
- R41 (certification document): NOT shipped — cannot make FRE 902(13) claims yet
- Existing copy is technically accurate but legally vague

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MyvylP/legal-evidence-positioning/phase1-metaplan.md`
