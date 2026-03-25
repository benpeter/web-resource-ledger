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

### Consultation 1: MCP Directory Requirements, Manifest Standards, and Web Archiving Community Targets

- **Agent**: mcp-minion
- **Planning question**: Two-part question covering both MCP ecosystem and web archiving discoverability.

  **Part A -- MCP directories**: What are the current submission requirements for MCP.so, Smithery, and Glama? What manifest files, metadata, or configuration does each directory expect? The project already has a `server.json` (MCP registry schema 2025-10-17) -- is this sufficient for all three directories, or does each need its own manifest format (e.g., `smithery.yaml`)? Are there additional MCP ecosystem discovery mechanisms (`.well-known/mcp.json`, npm `mcp-server-*` naming conventions) that would improve discoverability? What category should WRL be listed under in each directory and in the Awesome MCP Servers list?

  **Part B -- Web archiving community**: Which web archiving tool indexes, directories, and community lists should WRL and @w-r-l/verify be submitted to? The success criteria requires at least one web archiving tool index. Candidates to evaluate include: awesome-web-archiving (GitHub), IIPC tools wiki, Webrecorder community listings, digital preservation tool registries (COPTR, DigiPres Commons), WACZ-specific lists, and any npm-focused lists relevant to @w-r-l/verify. For each viable target, what is the submission process (PR, form, email) and what information does each listing typically require? Should @w-r-l/verify be submitted to a separate set of lists from the main WRL project?
- **Context to provide**: `server.json` contents, `docs/mcp.md`, MCP server endpoint URL, tool list (capture_url, get_capture, list_captures, verify_capture, batch_capture), transport (Streamable HTTP), WRL key features (WACZ format, Ed25519 signing, RFC 3161 timestamps, eIDAS qualified timestamps, FRE 902(13) certificate), @w-r-l/verify capabilities (CLI + library, zero-install via npx), Apache 2.0 license
- **Why this agent**: mcp-minion has deep knowledge of MCP protocol ecosystem, directory standards, and what each platform requires for listing. This is the core domain expertise for the MCP submission work. With user-docs-minion removed from the team, mcp-minion also absorbs the web archiving community research -- this is natural because WRL's MCP server IS the tool being submitted, and mcp-minion understands the protocol-level positioning that web archiving tool directories care about (WACZ format support, API design). devx-minion covers developer experience aspects, and product-marketing-minion covers positioning copy -- but identifying the right directories and understanding their submission requirements is protocol-adjacent research.

### Consultation 2: Integration Example Coverage and Client Configuration

- **Agent**: devx-minion
- **Planning question**: Beyond Claude Code, Cursor, and Windsurf (already documented), which MCP clients should we target for integration examples? The success criteria requires "at least one other MCP client." Candidates include: VS Code with Copilot (GitHub MCP support), Cline, Continue, Zed, or custom SDK usage. Which clients have the largest user base and best MCP support right now? What should each integration example cover -- just config snippet, or also a worked usage scenario showing a realistic agent workflow? How should the examples be structured in the repo (separate files per client vs. consolidated docs page)? Consider that directory traffic will land on the docs site -- should examples be self-contained enough to serve as quick-start entry points for new users arriving from each directory? Note: devx-minion owns integration example quality and structure, while product-marketing-minion owns the short-form positioning text that appears in directory listings themselves.
- **Context to provide**: Existing integration docs in `docs/mcp.md` and `site/content/mcp.md`, the Streamable HTTP transport requirement, auth pattern (Bearer token header), the "Generic MCP client" section already in docs
- **Why this agent**: devx-minion understands developer onboarding, configuration ergonomics, and which clients developers actually use. The integration examples are developer experience artifacts, not protocol artifacts. devx-minion can also assess whether the existing "Generic MCP client" docs section is sufficient or whether client-specific examples add genuine value.

### Consultation 3: Product Positioning for Directory Listings and Community Submissions

- **Agent**: product-marketing-minion
- **Planning question**: How should WRL be positioned in MCP directory listings, awesome-lists, and web archiving indexes to maximize click-through and adoption? Each directory and list has a short description field (typically 1-2 sentences). What positioning statement works across all listings while being specific enough to differentiate from generic screenshot or web archival tools? Key differentiators to consider: Ed25519 signing, RFC 3161 timestamps, WACZ format (Webrecorder standard), MCP-native, self-hostable, eIDAS qualified timestamps, FRE 902(13) certification PDF. Different audiences care about different differentiators -- MCP directory visitors care about agent workflows, web archiving communities care about WACZ and standards compliance, legal-tech audiences care about eIDAS/FRE 902(13). Should the positioning vary per directory, or is there a single description that works everywhere? For Awesome MCP Servers, what category does WRL belong in? For the server.json `websiteUrl` field -- should it point to the docs site instead of GitHub, since docs.webresourceledger.com is a richer landing surface?
- **Context to provide**: Current `server.json` description, README tagline ("Cryptographic evidence of web content -- capture what a page looked like, when, with proof anyone can verify"), key features list, landing page URL, docs site URL
- **Why this agent**: product-marketing-minion crafts positioning and messaging. Directory descriptions are essentially micro-marketing copy -- they need to convey value in one sentence. Getting this right determines whether people click through. This agent also resolves the tension between audience-specific messaging and a single canonical description.

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The success criteria requires "integration examples are tested and working against the current API." Need to determine what "tested" means: manual verification against production, automated smoke test, or CI check. Planning question: Should the integration examples include a test script or just instructions? Should we add a CI job that validates the MCP server is up and directory manifest files are valid?
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

1. **Research**: What each directory and community requires (mcp-minion, covering both MCP ecosystem and web archiving communities)
2. **Content**: Positioning copy and descriptions (product-marketing-minion)
3. **Developer experience**: Integration examples for additional clients (devx-minion)
4. **Quality**: Testing that examples work, docs coherence, onboarding journey (test-minion, ux-strategy-minion, software-docs-minion via cross-cutting)
5. **Submission**: Actually creating the PRs and listings

mcp-minion leads because directory requirements and MCP ecosystem standards are
the structural foundation -- and with the team adjustment, mcp-minion also
absorbs the web archiving community identification that user-docs-minion would
have covered. This is a reasonable consolidation: identifying submission targets
and understanding their requirements is protocol-adjacent research that mcp-minion
can handle, while the positioning copy that makes submissions compelling remains
with product-marketing-minion. devx-minion provides the integration example quality
that makes listings credible (the "tested and working" success criterion).

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
