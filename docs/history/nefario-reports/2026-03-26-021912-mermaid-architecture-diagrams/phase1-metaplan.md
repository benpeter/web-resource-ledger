# Meta-Plan: Mermaid Architecture Diagrams for WRL Documentation Site

## Planning Consultations

#### Consultation 1: Capture pipeline accuracy and integrity chain
- **Agent**: security-minion
- **Planning question**: Review the capture pipeline flow described in the issue against the actual codebase (`src/capture.js`, `src/wacz.js`, `src/signing.js`, `src/rfc3161.js`, `src/rate-limits.js`, `src/threat-check.js`, `src/url-validation.js`, `src/verify.js`). What is the exact sequence of operations, and what is the precise cryptographic proof chain? Which steps are optional vs mandatory? Are there any security-sensitive details that should NOT be exposed in a public-facing diagram (e.g., internal rate-limiting implementation details)?
- **Context to provide**: The GitHub issue description, `src/` directory listing, existing verification docs at `site/content/verification.md`, `site/content/authentication.md`
- **Why this agent**: The diagrams must accurately represent the cryptographic integrity chain and authentication flows. Security-minion can verify correctness and flag anything that shouldn't be publicly documented.

#### Consultation 2: User interaction flow completeness
- **Agent**: api-design-minion
- **Planning question**: Review the API routes in `src/index.js` and the handler files (`src/capture.js`, `src/verify.js`, `src/account.js`, `src/oauth.js`, `src/auth.js`) to confirm the complete set of user-facing endpoints and interaction patterns. Does the issue description accurately capture all tenant and verifier flows? Are there flows missing (e.g., scheduled captures via `src/schedules.js`, rescan via `src/rescan.js`)? What level of endpoint detail is appropriate for an architecture overview diagram vs the existing API Reference page?
- **Context to provide**: `src/index.js` (router), existing `site/content/api-reference.njk`, the issue description
- **Why this agent**: API-design-minion can verify the completeness of the interaction flows against the actual route definitions and advise on appropriate abstraction level.

#### Consultation 3: Documentation site integration and navigation placement
- **Agent**: software-docs-minion
- **Planning question**: Given the existing site navigation structure (Getting Started → Authentication → Verification → Legal Evidence → Batch Captures → Limits → Webhooks → MCP Server → API Reference → Security section), where should an "Architecture" page sit? Should it be a single page with both diagrams or split? What frontmatter and layout conventions does the site use? Review `site/content/` pages for consistent style, heading structure, and prose conventions to ensure the new page fits naturally.
- **Context to provide**: `site/_data/site.js`, `site/content/index.md` (as style reference), all existing content page frontmatter, `site/` directory structure
- **Why this agent**: Documentation structure and navigation flow are core documentation concerns. The page needs to fit the existing information architecture.

#### Consultation 4: Diagram clarity and audience targeting
- **Agent**: ux-strategy-minion
- **Planning question**: The diagrams target two audiences: potential customers evaluating the product and technical evaluators assessing the integrity model. How should the two diagrams balance technical depth vs accessibility? Should Diagram 1 (user flows) be simplified for the customer audience while Diagram 2 (pipeline) targets evaluators? Are there cognitive load concerns with showing all flows in a single sequence diagram? Should the page include prose context between/around the diagrams?
- **Context to provide**: The issue description, existing doc page styles, the two audience types mentioned
- **Why this agent**: Every plan needs journey coherence review. The diagrams serve a specific user job (evaluate the product's architecture) and the strategy-minion can advise on how to structure them for clarity.

### Cross-Cutting Checklist

- **Testing**: Exclude from planning. This task produces documentation content (Markdown + Mermaid), not executable code. The site build (`eleventy`) will validate the page renders, but no test-minion planning input is needed.
- **Security**: INCLUDE (Consultation 1). The diagrams depict the security model — security-minion must verify accuracy and flag anything that shouldn't be publicly exposed.
- **Usability -- Strategy**: INCLUDE (Consultation 4). Diagram clarity and audience targeting are core UX-strategy concerns.
- **Usability -- Design**: Exclude from planning. No UI components are being created — the diagrams render as standard Mermaid in Markdown. Visual hierarchy is handled by the existing site layout.
- **Documentation**: INCLUDE (Consultation 3). This IS a documentation task — software-docs-minion is a natural planning participant.
- **Observability**: Exclude. No runtime components are being created or modified.

### Notable Exclusions

- **frontend-minion**: The site uses Eleventy (static site generator) with existing layouts. No frontend component work is needed — this is a content page using the existing `layouts/doc.njk` template.
- **ux-design-minion**: Mermaid diagrams have limited visual design flexibility. The rendering is handled by the existing site CSS/GitHub rendering. No custom visual design needed.
- **mcp-minion**: While the site documents the MCP server, this task doesn't involve MCP implementation — it's documenting existing functionality.

### Anticipated Approval Gates

1. **Diagram content accuracy** (MUST gate): Before writing the final page, the diagram content (which endpoints, which systems, which flow steps) should be verified against the codebase. This is hard to reverse (wrong diagrams in published docs erode trust) and has downstream impact (the page content depends on accurate diagrams). Gate after the specialist planning contributions confirm the exact flows.

### Rationale

This task is primarily a documentation task that requires domain accuracy. The four consultations cover: (1) cryptographic/security accuracy of the pipeline diagram, (2) API completeness of the user flow diagram, (3) documentation site integration, and (4) audience-appropriate presentation. These four perspectives ensure the diagrams are both technically correct and useful to readers.

The `mermaid` user-global skill is available and should be used during execution for Mermaid syntax reference, but it doesn't need to participate in planning — it's a LEAF skill providing syntax help.

### Scope

**In scope:**
- Two Mermaid diagrams (sequence + flowchart) as described in the issue
- A new content page in `site/content/` using the existing doc layout
- Navigation entry in `site/_data/site.js`
- Prose context around the diagrams for reader orientation

**Out of scope:**
- Changes to existing documentation pages
- Any code changes to the API or worker
- Custom CSS or layout changes for diagram rendering
- Interactive diagrams or non-Mermaid visualizations

### External Skill Integration

#### Discovered Skills
| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/` | LEAF | Operations/admin procedures | Not relevant to this task |
| mermaid | `~/.claude/skills/mermaid/` (user-global) | LEAF | Mermaid diagram syntax reference | Include in execution task prompt as Available Skill |

#### Precedence Decisions
No conflicts. The `mermaid` skill is a syntax reference that complements rather than conflicts with any specialist. It will be listed as an Available Skill in the execution task prompt for the agent producing the diagrams.
