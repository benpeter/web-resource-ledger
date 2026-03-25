# Domain Plan Contribution: mcp-minion

## Recommendations

### Part A: MCP Ecosystem Discoverability

#### 1. Official MCP Registry (registry.modelcontextprotocol.io) -- HIGHEST PRIORITY

The official MCP Registry is the canonical source of truth. It is currently in preview (API freeze v0.1 since October 2025) and is the foundation that downstream directories (Glama, PulseMCP) increasingly pull from. Registering here first maximizes downstream discovery automatically.

**Current server.json gap analysis:** The existing `server.json` uses schema version `2025-10-17` and the older `remotes` field format. It needs to be updated to the current schema `2025-12-11`. The existing file is close to what the registry needs but has several issues:

1. **Schema version**: `2025-10-17` should be updated to `2025-12-11`
2. **Repository URL mismatch**: `server.json` references `benpeter/web-resource-ledger` -- verify this is the intended public-facing org (the GitHub remote is `benpeter`, not `ArtificialArchitects` as mentioned in the task context)
3. **Missing `title` field**: Optional but recommended for display names
4. **Missing `packages` field**: The registry supports both `remotes` (for HTTP servers) and `packages` (for npm/installable servers). WRL is remote-only, which is fine -- `remotes` alone is valid
5. **Headers format**: The current `headers` format uses a simple key-value object (`{"Authorization": "Bearer ${env:WRL_API_KEY}"}`). The registry schema uses a structured array format with `name`, `description`, `isRequired`, `isSecret` fields. This needs updating.

**Recommended updated server.json:**

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.benpeter/web-resource-ledger",
  "title": "Web Resource Ledger",
  "description": "Capture web pages as tamper-evident evidence with Ed25519 signatures, RFC 3161 timestamps, and WACZ bundles. Four tools: capture_url, get_capture, list_captures, verify_capture.",
  "version": "1.0.0",
  "websiteUrl": "https://docs.webresourceledger.com",
  "repository": {
    "url": "https://github.com/benpeter/web-resource-ledger",
    "source": "github"
  },
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://api.webresourceledger.com/mcp",
      "headers": [
        {
          "name": "Authorization",
          "description": "Bearer token using your WRL API key (format: Bearer wrl_live_...)",
          "isRequired": true,
          "isSecret": true
        }
      ]
    }
  ]
}
```

**Namespace decision**: Use `io.github.benpeter/web-resource-ledger` with GitHub authentication (simplest path). Alternative: use DNS authentication with `com.webresourceledger/mcp` for a branded namespace, which requires adding a DNS TXT record or hosting `/.well-known/mcp-registry-auth` on webresourceledger.com. The DNS approach is more professional but adds operational steps. Recommend GitHub auth for initial publish, consider DNS migration later.

**Publish process:**
1. Install `mcp-publisher` CLI via Homebrew or curl
2. Update `server.json` to new format
3. `mcp-publisher login github` (OAuth device flow)
4. `mcp-publisher publish`
5. Verify via `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.benpeter/web-resource-ledger"`

#### 2. Glama (glama.ai)

**How listing works**: Glama auto-indexes GitHub repositories that contain MCP servers. It likely already knows about WRL if the repo is public. Claiming ownership is the main action needed.

**Requirements:**
- Add a `glama.json` file to the repo root:
  ```json
  {
    "$schema": "https://glama.ai/mcp/schemas/server.json",
    "maintainers": ["benpeter"]
  }
  ```
- Go through the "Claim" ownership flow on glama.ai after the file is committed
- Once claimed, you can update the name, description, and configure Docker images from the admin panel

**Category**: Glama does not use fixed categories -- it uses search/tagging. The description and README drive discoverability.

**Effort**: Minimal -- one file, one claim flow.

#### 3. Smithery (smithery.ai)

**How listing works**: Smithery is a deployment and registry platform. It requires either deploying your server ON Smithery infrastructure (via Docker + `smithery.yaml`) or listing as a remote Streamable HTTP server.

**Key consideration**: Smithery sunsetted STDIO for remote servers in September 2025 and moved to Streamable HTTP. WRL already uses Streamable HTTP, which is ideal. However, Smithery's primary model is hosting servers themselves, not just listing externally-hosted ones.

**Requirements for deployment on Smithery:**
- `smithery.yaml` in repo root with:
  - `runtime`: "container" (Docker)
  - `startCommand` with `configSchema` defining required env vars
- Dockerfile for the MCP server
- `smithery deploy .` CLI command
- Smithery API key

**Challenge**: WRL's MCP server is embedded in a Cloudflare Worker, not a standalone Docker container. Deploying on Smithery would require either:
1. A proxy container that forwards to the real endpoint (wasteful, adds latency)
2. A standalone MCP server container (major new work)

**Recommendation**: Smithery may not be a natural fit for WRL's architecture. The server is a remote endpoint, not a deployable package. Check if Smithery supports listing remote servers without deployment. If not, defer or skip. The official MCP registry + Glama + awesome lists provide sufficient coverage without Smithery.

#### 4. MCP.so

**How listing works**: MCP.so is an index that appears to crawl/aggregate from other sources. Submission is via GitHub issue on the MCP.so repository.

**Requirements:**
- Create a GitHub issue with: server name, description, features, connection info, GitHub repo URL
- Appears to be manually reviewed

**Category**: "Search & Data Extraction" or "Security" would be the closest fits.

**Effort**: Low -- one GitHub issue.

#### 5. Awesome MCP Servers Lists

Two main lists exist:

**punkpeye/awesome-mcp-servers** (larger, more popular):
- Submit via PR to README.md
- Format: `- [Server Name](repo URL) - Brief description`
- Alphabetical order within category
- Category: **"Search & Data Extraction"** or **"Security"**
- Robot PRs can include `🤖🤖🤖` in title for fast-track

**appcypher/awesome-mcp-servers** (alternative):
- Similar PR-based submission
- Category: **"Search & Web"** or **"Security"**

**Recommendation**: Submit to both. PRs are small and fast.

#### 6. Cline MCP Marketplace

**Requirements:**
- GitHub issue on `cline/mcp-marketplace` repo
- Provide: GitHub repo URL, 400x400 PNG logo, brief explanation
- Must have a README that Cline can use to set up the server
- Reviewed for community adoption and security

**Consideration**: WRL should have a logo/icon ready. If one doesn't exist, this needs to be created first.

#### 7. PulseMCP

**How listing works**: Auto-indexes from the official MCP registry + manual submissions + crawling.

**Requirements:**
- Submit via https://www.pulsemcp.com/submit
- Or: publish to official registry (PulseMCP pulls from it)

**Effort**: If we publish to the official registry first, PulseMCP may pick it up automatically. Submit manually as backup.

#### 8. Additional Discovery Mechanisms

**`.well-known/mcp.json`**: Not currently a standard. The official registry uses `/.well-known/mcp-registry-auth` for HTTP authentication only -- not for server discovery. No action needed here.

**npm `mcp-server-*` naming**: WRL's MCP server is not an npm package (it's a remote endpoint), so this convention does not apply. The `@w-r-l/verify` npm package is a verification tool, not an MCP server, so naming it `mcp-server-*` would be misleading.

**`mcpName` in package.json**: Not needed since WRL is remote-only and not published as an npm package for the MCP server itself.

### Part B: Web Archiving Community Discoverability

#### 1. IIPC awesome-web-archiving (HIGHEST VALUE)

**Repository**: https://github.com/iipc/awesome-web-archiving

This is the authoritative list maintained by the International Internet Preservation Consortium. It is the first place web archiving practitioners look for tools.

**Target categories for WRL:**
- **Tools & Software > Acquisition**: WRL is fundamentally an acquisition tool (it captures web pages). This is where Browsertrix, ArchiveWeb.page, Scoop, and similar tools are listed.
- **Tools & Software > Quality Assurance**: The verification aspect of WRL (and @w-r-l/verify specifically) could go here, though this section currently focuses on link checkers.

**Submission process:**
- Individual PR per entry
- Alphabetical insertion within category
- Format: `* [Tool Name](URL) - Brief description. *(Status)*`
- Check spelling/grammar

**Recommended entry for Acquisition section:**
```
* [Web Resource Ledger](https://github.com/benpeter/web-resource-ledger) - API-driven web capture with Ed25519 signatures, RFC 3161 timestamps, and WACZ bundle output. Deploys on Cloudflare Workers. *(In Development)*
```

**Should @w-r-l/verify go separately?** Yes -- it is a standalone CLI tool with a different use case (verification, not capture). It could be listed under:
- **Utilities** (for working with web archives): `* [wrl-verify](https://www.npmjs.com/package/@w-r-l/verify) - CLI tool to verify cryptographic integrity of WRL captures (Ed25519 signatures, RFC 3161 timestamps, artifact hashes). Zero-install via npx.`

**Key selling point for this community**: WRL produces standard WACZ bundles. This is the format the Webrecorder community has standardized on. Emphasize WACZ output in the description.

#### 2. COPTR (Community-Owned digital Preservation Tool Registry)

**URL**: https://coptr.digipres.org

**What it is**: A wiki-based registry of 633+ digital preservation tools. Managed by the digital preservation community (libraries, archives, museums). Anyone can add or edit entries.

**Submission process:**
- Create an account on the wiki
- Add a new tool page following the existing template
- Fill in: tool name, URL, description, function categories, platform, license, cost

**Function categories for WRL**: Web Archiving, Fixity (due to signature/hash verification)

**Function categories for @w-r-l/verify**: Validation, Fixity

**Effort**: Medium -- requires filling out a structured wiki form. No PR review delay.

**Recommendation**: Worth doing. COPTR is well-indexed by search engines and is a reference for institutional evaluators.

#### 3. DigiPres Commons / awesome-digital-preservation

**Repository**: https://github.com/digipres/awesome-digital-preservation

**What it is**: Curated list of digital preservation resources. Overlaps significantly with COPTR. The "Tools & Software" section links to COPTR rather than maintaining its own list.

**Recommendation**: Low priority as a separate submission. Getting into COPTR covers this community. The awesome list could be submitted to if there is a relevant section (e.g., "Web Archiving" under community resources), but the IIPC list is the canonical one for web archiving specifically.

#### 4. Webrecorder Community

**What it is**: The Webrecorder project maintains the WACZ specification and related tools (Browsertrix, ReplayWeb.page, py-wacz, authsign).

**Relevance**: WRL implements WACZ output and its own signing/verification that is inspired by (but diverges from) the Webrecorder WACZ Signing and Verification spec. WRL uses Ed25519 + RFC 3161 rather than the Webrecorder approach of LetsEncrypt certificates + FreeTSA.

**Submission targets:**
- No formal "tools list" to submit to. The Webrecorder community operates through GitHub repos and a Discord/forum.
- Could open an issue or discussion on `webrecorder/specs` to mention WRL as a WACZ producer, but this is community engagement rather than a listing.

**Recommendation**: Defer. This is community-building work, not a directory listing. Valuable but different scope from R35.

#### 5. Harvard LIL / Perma.cc Tools

**URL**: https://tools.perma.cc/

Perma Tools is Harvard Library Innovation Lab's collection of web archiving and signing tools. They maintain `wacz-signing` (the reference WACZ signing library).

**Recommendation**: Not a submission target -- this is their own tools page, not a community directory.

#### 6. ArchiveBox Community / Wiki

**URL**: https://docs.archivebox.io/dev/Web-Archiving-Community.html

ArchiveBox maintains a community wiki page listing web archiving tools and resources.

**Recommendation**: Low priority. The ArchiveBox wiki is a secondary source. Focus on IIPC awesome-web-archiving and COPTR.

#### 7. IIPC Tools and Software Page

**URL**: https://netpreserve.org/web-archiving/tools-and-software/

IIPC's official tools page. However, this appears to link to the awesome-web-archiving list rather than maintaining a separate registry.

**Recommendation**: Covered by awesome-web-archiving PR.

#### 8. @w-r-l/verify in npm-Focused Lists

The `@w-r-l/verify` package is a zero-install CLI tool (`npx @w-r-l/verify`). It could potentially be listed in:
- **awesome-nodejs** -- but this is for libraries/frameworks, not niche CLI tools
- **awesome-cli-apps** -- possible, under "Utilities" or "Security"

**Recommendation**: Low priority. The web archiving community lists are higher value for this tool. npm discoverability comes from npm search itself + good README keywords.

## Proposed Tasks

### Tier 1: High-Impact, Low Effort (Do First)

**T1. Update server.json to official MCP registry format**
- Update schema to `2025-12-11`
- Add `title` field
- Convert `headers` to structured array format with `isSecret`
- Update `websiteUrl` to docs site
- Verify and fix repository URLs
- Estimated: 30 minutes

**T2. Publish to official MCP registry**
- Install `mcp-publisher` CLI
- Authenticate via GitHub OAuth
- Publish server.json
- Verify listing via API
- Dependencies: T1
- Estimated: 30 minutes

**T3. Add glama.json and claim on Glama**
- Create `glama.json` with maintainers
- Commit and push
- Complete claim flow on glama.ai
- Estimated: 15 minutes

**T4. Submit to punkpeye/awesome-mcp-servers**
- Fork repo
- Add WRL entry under "Search & Data Extraction" (or "Security")
- PR with clear description
- Estimated: 20 minutes

**T5. Submit to appcypher/awesome-mcp-servers**
- Same as T4 for the alternative list
- Estimated: 15 minutes

**T6. Submit to MCP.so**
- Create GitHub issue with server details
- Estimated: 10 minutes

### Tier 2: Medium Effort, High Value for Web Archiving

**T7. Submit WRL to IIPC awesome-web-archiving**
- PR to add WRL under "Tools & Software > Acquisition"
- Use WACZ-focused description
- Estimated: 20 minutes

**T8. Submit @w-r-l/verify to IIPC awesome-web-archiving**
- Same PR or separate PR for "Utilities" section
- Estimated: 15 minutes (can bundle with T7)

**T9. Create COPTR wiki entry for WRL**
- Register account
- Fill in tool details: name, URL, function, platform, license
- Estimated: 30 minutes

**T10. Create COPTR wiki entry for @w-r-l/verify**
- Separate tool page since it has a different function (verification vs capture)
- Estimated: 20 minutes

### Tier 3: Additional Coverage

**T11. Submit to PulseMCP**
- Visit pulsemcp.com/submit
- May auto-index from official registry (T2)
- Estimated: 10 minutes

**T12. Submit to Cline MCP Marketplace**
- Requires 400x400 PNG logo -- create or source
- GitHub issue on cline/mcp-marketplace
- Dependencies: Logo exists
- Estimated: 20 minutes (plus logo creation)

**T13. Evaluate Smithery listing feasibility**
- Check if Smithery supports listing remote HTTP servers without deploying on their infrastructure
- If yes, create smithery.yaml and list
- If no, skip
- Estimated: 30 minutes investigation

### Deferred / Out of Scope

**T14. DNS-based namespace for MCP registry** -- Use `com.webresourceledger/mcp` instead of `io.github.benpeter/...`. Requires DNS TXT record or `/.well-known/mcp-registry-auth`. Professional but not urgent. Can migrate later.

**T15. Webrecorder community engagement** -- Open discussion on webrecorder/specs about WRL as WACZ producer. Community-building, not a directory listing. Different scope from R35.

## Risks and Concerns

### 1. Repository URL Discrepancy
The task context says the GitHub repo is `ArtificialArchitects/web-resource-ledger`, but the actual git remote is `benpeter/web-resource-ledger`. The existing `server.json` and `package.json` both reference `benpeter`. If the repo will move to a different org, all listings and registry entries will need updating. **Resolve the canonical URL before publishing to any directory.**

### 2. Official MCP Registry Is Still in Preview
The registry warns that "breaking changes or data resets may occur before general availability." Publishing now is still worthwhile (establishes presence, tests the flow), but be prepared to re-publish if the registry resets.

### 3. Logo/Icon Requirement
Cline MCP Marketplace requires a 400x400 PNG logo. Glama may also benefit from one. If WRL does not have a logo, this blocks T12 and limits visual presence across directories.

### 4. Smithery Architecture Mismatch
WRL runs as a Cloudflare Worker, not a deployable container. Smithery's model assumes it hosts the server. Without support for listing externally-hosted remote servers, Smithery may not be feasible. This is a gap, not a blocker -- the other directories provide sufficient coverage.

### 5. IIPC Awesome List Review Cadence
The IIPC awesome-web-archiving list is actively maintained but PRs may take weeks to be reviewed. This is a community-run list, not automated. Submit early.

### 6. WACZ Signing Spec Divergence
WRL's signing approach (Ed25519 + RFC 3161 with anonymous key distribution) differs from the Webrecorder WACZ Signing spec (domain-name identity via LetsEncrypt + FreeTSA). When engaging with the web archiving community, be transparent about this divergence. Frame it as "compatible WACZ format, alternative signing approach optimized for API-driven workflows."

### 7. Version Number
The current `server.json` says version `0.1.0`, but the project has shipped significant features. For directory listings, the version should match the actual maturity. Consider bumping to `1.0.0` if the API stability commitment (from the recent versioning PR) supports it, or use the current API version. The version in `server.json` should reflect the MCP server version specifically.

### 8. "In Development" Status
For IIPC awesome-web-archiving, entries include a status marker. Using "*(In Development)*" is honest given the pre-1.0 status mentioned in the README, but may reduce adoption. Consider whether the project is stable enough to omit the status marker or use "*(Stable)*" for the core capture workflow.

## Additional Agents Needed

**Product Marketing Minion** -- I see this specialist is already involved (per the scratch directory). They should:
- Craft the short descriptions for each directory (different audiences: MCP developers vs web archivists vs digital preservationists)
- Decide on category placement across directories
- Write the "why this is awesome" pitch for Cline Marketplace

**Design / Branding** -- If no 400x400 logo exists, someone needs to create one for Cline Marketplace and visual presence across directories. Not a specialist agent per se, but a dependency.

No other specialists are needed. The actual submissions are mechanical (PRs, issues, CLI commands, wiki edits) and can be executed by any implementation agent once the content is finalized.
