# Meta-Plan: MCP Directory Listings and Ecosystem (R35 / Issue #114)

## Task Summary

Get WRL discoverable in the MCP ecosystem and web archiving communities. This is
primarily an outreach and content-creation task: prepare submission materials for
MCP directories (MCP.so, Smithery, Glama), awesome-list PRs, client integration
examples, and web archiving community listings. No new code features needed --
all dependencies (MCP server, verify package, docs site) are shipped.

## Codebase Context

Key assets already in place:
- **MCP server**: live at `https://api.webresourceledger.com/mcp` (Streamable HTTP)
- **server.json**: MCP registry manifest already exists at repo root (schema 2025-10-17)
- **docs/mcp.md**: comprehensive tool reference with Claude Code, Cursor, Windsurf setup
- **site/content/mcp.md**: docs site version with tutorial and agent workflow examples
- **@w-r-l/verify**: published v0.2.1 on npm with CLI (`wrl-verify`)
- **OpenAPI spec**: `openapi.yaml` at repo root
- **GitHub repo**: `benpeter/web-resource-ledger` (public, Apache 2.0)
- **Docs site**: `https://docs.webresourceledger.com`
- **Landing page**: `https://webresourceledger.com`

What does NOT exist yet:
- No `smithery.yaml` (Smithery directory manifest)
- No `.well-known/mcp.json` (though `server.json` exists)
- No directory submission PRs or listings
- No expanded integration examples beyond Claude Code / Cursor / Windsurf

## Planning Consultations

### Consultation 1: MCP Directory Requirements and Manifest Standards

- **Agent**: mcp-minion
- **Planning question**: What are the current submission requirements for MCP.so, Smithery, and Glama? What manifest files, metadata, or configuration does each directory expect? The project already has a `server.json` (MCP registry schema 2025-10-17) -- is this sufficient for all three directories, or does each need its own manifest format (e.g., `smithery.yaml`)? Are there additional MCP ecosystem discovery mechanisms (`.well-known/mcp.json`, npm `mcp-server-*` naming conventions) that would improve discoverability?
- **Context to provide**: `server.json` contents, `docs/mcp.md`, MCP server endpoint URL, tool list (capture_url, get_capture, list_captures, verify_capture), transport (Streamable HTTP)
- **Why this agent**: mcp-minion has deep knowledge of MCP protocol ecosystem, directory standards, and what each platform requires for listing. This is the core domain expertise needed to structure the directory submission work correctly.

### Consultation 2: Integration Example Coverage and Client Configuration

- **Agent**: devx-minion
- **Planning question**: Beyond Claude Code, Cursor, and Windsurf (already documented), which MCP clients should we target for integration examples? The success criteria requires "at least one other MCP client." Candidates include: VS Code with Copilot (GitHub MCP support), Cline, Continue, Zed, or custom SDK usage. Which clients have the largest user base and best MCP support right now? What should each integration example cover -- just config, or also a worked usage scenario? How should the examples be structured in the repo (separate files per client vs. consolidated docs page)?
- **Context to provide**: Existing integration docs in `docs/mcp.md` and `site/content/mcp.md`, the Streamable HTTP transport requirement, auth pattern (Bearer token header)
- **Why this agent**: devx-minion understands developer onboarding, configuration ergonomics, and which clients developers actually use. The integration examples are developer experience artifacts, not protocol artifacts.

### Consultation 3: Product Positioning for Directory Listings

- **Agent**: product-marketing-minion
- **Planning question**: How should WRL be positioned in MCP directory listings, awesome-lists, and web archiving indexes to maximize click-through and adoption? Each directory has a short description field (typically 1-2 sentences). What positioning statement works across all listings while being specific enough to differentiate from generic screenshot or archival tools? For the Awesome MCP Servers PR, what category does WRL belong in? For web archiving directories/indexes, which communities and lists should we target (e.g., IIPC tools list, Webrecorder community, awesome-web-archiving)?
- **Context to provide**: Current `server.json` description, README tagline, key differentiators (Ed25519 signing, RFC 3161 timestamps, WACZ format, MCP-native, self-hostable, eIDAS qualified timestamps)
- **Why this agent**: product-marketing-minion crafts positioning and messaging. Directory descriptions are essentially micro-marketing copy -- they need to convey value in one sentence. Getting this right determines whether people click through.

### Consultation 4: Community Outreach Targets for Web Archiving

- **Agent**: user-docs-minion
- **Planning question**: Which web archiving tool indexes, directories, and community lists should WRL and @w-r-l/verify be submitted to? The success criteria requires at least one web archiving tool index. Candidates include: awesome-web-archiving (GitHub), IIPC tools wiki, Webrecorder community listings, digital preservation tool registries (COPTR, DigiPres Commons). For each target, what is the submission process (PR, form, email)? What information does each listing typically require? Should the @w-r-l/verify npm package be submitted to a different set of lists than the main WRL project (e.g., awesome-npm-packages, WACZ-specific lists)?
- **Context to provide**: WRL key features (WACZ format, Ed25519 signing, RFC 3161 timestamps, eIDAS support), @w-r-l/verify capabilities (CLI + library, zero-install via npx), Apache 2.0 license
- **Why this agent**: user-docs-minion understands community documentation ecosystems and can identify the right directories and lists where WRL's target audience (web archivists, legal tech, digital preservation) discovers tools.

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The success criteria requires "integration examples are tested and working against the current API." Need to determine what "tested" means -- manual verification against production, automated smoke test, or CI check. Planning question: Should the integration examples include a test script or just instructions? Should we add a CI job that validates the MCP server is up and directory manifest files are valid?
- **Security**: Exclude from planning. No new attack surface, auth flows, or code changes. Integration examples use existing Bearer token auth pattern. The examples must avoid including real API keys (use `YOUR_API_KEY` placeholder consistently), but this is a content review concern, not a security architecture question.
- **Usability -- Strategy**: ALWAYS include. Planning question for ux-strategy-minion: From the perspective of someone discovering WRL for the first time via a directory listing, what is the optimal click-through journey? Directory listing -> docs site MCP page -> quick setup -> first capture. Is the existing docs site MCP page adequate as a landing surface for directory traffic, or does it need adjustments to serve as an onboarding funnel? Should directory listings link to the docs site MCP page or the main landing page?
- **Usability -- Design**: Exclude from planning. No UI components or visual design work in this task.
- **Documentation**: ALWAYS include. Planning question for software-docs-minion: The existing `docs/mcp.md` and `site/content/mcp.md` already have substantial integration docs. This task will produce new integration examples and potentially new files (smithery.yaml, expanded client configs). Where should new integration examples live -- extend the existing MCP docs page, create separate per-client pages, or add them to a new `docs/integrations/` directory? Should the server.json be updated with the docs site URL (currently points to GitHub)?
- **Observability**: Exclude from planning. No runtime components or services being created. Directory listings are static content.

## Notable Exclusions

- **seo-minion**: Directory listings are external submissions, not changes to WRL's own site. Structured data and meta tags on the docs site are out of scope for this task.
- **security-minion**: No new attack surface or auth changes. Integration examples use existing placeholder patterns. Excluded from planning, but standard content review will catch any accidentally-included real credentials.
- **iac-minion**: No infrastructure changes. Directory manifests are metadata files, not deployment configuration.

## Anticipated Approval Gates

1. **Directory manifest files and submission content** (MUST gate): The positioning copy, manifest files (smithery.yaml, updated server.json), and awesome-list PR text are hard to change after submission. Multiple downstream tasks (individual submissions) depend on getting the content right. This gate covers all submission materials before any external PRs or submissions are made.

2. **Integration example scope** (OPTIONAL gate): Which clients to include beyond the three already documented. Low blast radius (examples are independent), easy to reverse (add more later), but involves judgment about which communities to target.

## Rationale

This task is primarily **content creation and outreach**, not engineering. The
MCP server, verify package, and docs site are all shipped and working. The work
breaks down into:

1. **Research**: What each directory requires (mcp-minion, user-docs-minion)
2. **Content**: Positioning copy and descriptions (product-marketing-minion)
3. **Developer experience**: Integration examples for additional clients (devx-minion)
4. **Quality**: Testing that examples work, docs coherence (test-minion, ux-strategy-minion, software-docs-minion)
5. **Submission**: Actually creating the PRs and listings

mcp-minion leads because directory requirements and MCP ecosystem standards are
the structural foundation. product-marketing-minion and devx-minion provide the
content quality. user-docs-minion identifies the web archiving community targets
that are outside the MCP ecosystem.

## Scope

**In scope**:
- Manifest/metadata files required by MCP directories (smithery.yaml, server.json updates)
- Submission materials for MCP.so, Smithery, Glama
- PR to Awesome MCP Servers
- Integration examples for additional MCP clients beyond Claude Code / Cursor / Windsurf
- Submission to at least one web archiving tool index
- Submission of @w-r-l/verify to at least one relevant awesome-list
- All new files committed to the WRL repo; external PRs created via gh CLI

**Out of scope**:
- Paid directory placements
- Blog posts, conference talks, social media
- Changes to the MCP server implementation
- Changes to the docs site layout or design
- New features or API changes
- Acceptance of submissions (success = submission, not acceptance)

## External Skill Integration

No external skills detected in project (no `.claude/skills/` or `.skills/` directories with SKILL.md files in the working directory). User-global skills (nefario, despicable-prompter, etc.) are framework-level orchestration skills, not project-specific leaf skills relevant to this task.
