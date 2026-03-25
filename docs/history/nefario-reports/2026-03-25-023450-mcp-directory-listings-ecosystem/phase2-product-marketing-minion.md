# Domain Plan Contribution: product-marketing-minion

## Recommendations

### 1. Positioning Strategy: Vary by Directory, Anchored to One Core Identity

WRL should **not** use one universal description across all directories. Each directory has a different audience with a different job-to-be-done. However, all descriptions should orbit the same core identity:

**Core positioning statement (internal, not for verbatim use):**
WRL is web evidence infrastructure that produces cryptographically signed, independently timestamped captures of web pages in a standard archival format (WACZ), verifiable by anyone without trusting the operator.

The three audience-specific positioning angles:

| Audience | Primary job-to-be-done | Lead differentiator | Secondary differentiator |
|----------|----------------------|---------------------|-------------------------|
| MCP / AI agent developers | Ground agent observations in verifiable evidence | MCP-native with 4 tools | Ed25519 + RFC 3161 = tamper-evident record |
| Web archiving community | Capture web pages with cryptographic integrity proofs | WACZ format (Webrecorder standard) | Ed25519 signing + RFC 3161 timestamps on every capture |
| Legal tech / forensics | Preserve web evidence with defensible chain of custody | eIDAS qualified timestamps + FRE 902(13) certificate | Self-hostable, your keys, your evidence |

This is a textbook big-fish-small-pond positioning play. WRL cannot win "best web archiver" (archive.org) or "best screenshot tool" (dozens). But WRL is the only tool that combines cryptographic signing + independent timestamps + standard archival format + MCP integration. In each pond, WRL is the only fish that does what it does.

### 2. Draft Descriptions by Directory

#### 2a. Official MCP Registry (server.json `description` field)

Current: "Capture web pages as tamper-evident evidence with Ed25519 signatures and RFC 3161 timestamps. Four tools: capture_url, get_capture, list_captures, verify_capture."

This is decent but front-loads technical mechanisms (Ed25519, RFC 3161) that MCP users do not know they want. Lead with the agent job instead.

**Recommended revision:**

> Capture web pages as verifiable evidence your agent can cite. Every capture is Ed25519-signed, RFC 3161-timestamped, and bundled as a WACZ archive. Four tools: capture_url, get_capture, list_captures, verify_capture.

Rationale: "verifiable evidence your agent can cite" is the job. The technical specs follow as proof. The tool list stays because the registry schema makes tool enumeration valuable for discovery.

#### 2b. Awesome MCP Servers (punkpeye/awesome-mcp-servers)

**Category recommendation: "⚖️ Legal"**

WRL does not fit cleanly into "Browser Automation" (it is not automating a browser for the user -- it operates server-side) or "Search & Data Extraction" (it is not extracting data from pages). The "Legal" category is small (1-2 entries currently), which means WRL will be visible rather than buried among 50+ screenshot tools. This is the big-fish-small-pond play.

If the maintainers push back on "Legal," the fallback is "🔒 Security" (evidence integrity, tamper-detection, cryptographic signing all fit).

**Draft entry (following the repo's exact format):**

```
- [benpeter/web-resource-ledger](https://github.com/benpeter/web-resource-ledger) 📇 ☁️ - Capture web pages as cryptographically signed, timestamped evidence bundles (WACZ). Ed25519 signatures, RFC 3161 timestamps, and public verification URLs. Designed for legal evidence, compliance archiving, and AI agent grounding.
```

Badges: `📇` (TypeScript), `☁️` (Cloud Service -- it runs on Cloudflare Workers).

#### 2c. MCP.so

MCP.so pulls descriptions from the GitHub README or the server.json. The submission is via GitHub issue on chatmcp/mcpso. The description field on mcp.so is typically 1-2 sentences.

**Recommended short description for MCP.so submission:**

> Capture web pages as tamper-evident evidence with cryptographic signatures and independent timestamps. Your AI agent gets four tools: capture, retrieve, list, and verify -- every capture produces a signed WACZ bundle anyone can independently verify.

Category tag: `legal`, `web-capture`, `evidence`, `verification`

#### 2d. Smithery

Smithery uses `smithery mcp publish <url>` and pulls metadata from the server. The description and README are the primary discovery surfaces. Since Smithery also has a web directory with search, keyword density matters.

**Recommended description:**

> Web evidence for AI agents. Capture any URL and get a signed, timestamped WACZ evidence bundle with Ed25519 signatures and RFC 3161 timestamps. Verify captures independently -- no account or trust required. Four MCP tools: capture_url, get_capture, list_captures, verify_capture.

#### 2e. Glama

Glama auto-indexes from GitHub and npm. You can "claim" your server for admin access. The listing quality depends on README quality and server.json metadata. Glama indexes, scans, and ranks servers by security, compatibility, and ease of use -- WRL's security-first design (SSRF protection, Ed25519 signing) should score well here.

No custom description submission needed -- Glama will pull from server.json and README. Ensure the server.json description is strong (per 2a above) and claim the listing after it appears.

#### 2f. IIPC awesome-web-archiving

This is the authoritative web archiving community list, maintained by the International Internet Preservation Consortium. The audience is librarians, archivists, digital preservation professionals, and developers building archival tools. They know WARC, WACZ, and OAIS. They do not know MCP.

**Category: "Acquisition" section** (tools that capture web content)

**Draft entry (matching the exact format):**

```
- [Web Resource Ledger](https://github.com/benpeter/web-resource-ledger) - API-first web capture service producing Ed25519-signed WACZ bundles with RFC 3161 timestamps. Includes a public verification endpoint and optional eIDAS-qualified timestamps. Self-hostable on Cloudflare Workers. *(In Development)*
```

Key choices:
- "API-first" signals this is a developer tool, not a browser extension
- "WACZ bundles" establishes format compatibility (the Webrecorder community's standard)
- "Ed25519-signed" and "RFC 3161 timestamps" are differentiators no other tool in this list has
- "Self-hostable on Cloudflare Workers" distinguishes from SaaS-only tools
- "*(In Development)*" is honest given pre-1.0 status. Claiming "Stable" and being wrong destroys credibility in this community.

#### 2g. Awesome Forensics / Digital Preservation Lists

**For cugu/awesome-forensics** (under "Tools" > "Internet Artifacts" or similar):

```
- [Web Resource Ledger](https://github.com/benpeter/web-resource-ledger) - Capture web pages with Ed25519 signatures, RFC 3161 timestamps, and WACZ evidence bundles. Produces FRE 902(13) certification PDFs. REST API and MCP server. Self-hostable.
```

**For ivbeg/awesome-forensicstools** (if a web evidence section exists):

```
- [Web Resource Ledger](https://github.com/benpeter/web-resource-ledger) - Cryptographic web evidence capture: Ed25519 signatures, RFC 3161 timestamps, WACZ bundles, FRE 902(13) certificates. API-first, self-hostable.
```

Note: Lead with FRE 902(13) for forensics audiences. They understand the evidentiary significance immediately. The web archiving community does not care about FRE but cares deeply about WACZ.

### 3. server.json `websiteUrl` -- Point to Docs Site

**Recommendation: `https://docs.webresourceledger.com`**

Rationale:
- The `websiteUrl` field in the official MCP registry is intended for "a landing page or documentation site" that helps users get set up. The docs site serves this purpose directly.
- The GitHub repo URL is already in the `repository` field. Duplicating it in `websiteUrl` wastes the field.
- The docs site has the MCP integration guide, getting-started flow, and API reference -- exactly what someone clicking through from a directory listing needs next.
- The landing page (webresourceledger.com) is marketing-oriented. A developer clicking through from an MCP directory wants docs, not a hero section. However, the landing page does link to docs. Either choice is defensible; docs is slightly better for the MCP audience.

Also update the `repository.url` and `repository.id` fields: the current server.json references `benpeter/web-resource-ledger` but the GitHub context mentions `ArtificialArchitects/web-resource-ledger`. Ensure these match the actual public repo URL.

### 4. Competitive Positioning Analysis for Directory Context

The directory landscape for screenshot/capture MCP servers is crowded with undifferentiated tools. A search on Glama for "screenshot MCP" returns 10+ results, all offering Puppeteer/Playwright-based screenshot capture. Their descriptions all read like: "Capture screenshots of web pages using Puppeteer."

WRL's positioning must immediately communicate it is not another screenshot tool. The word "evidence" is the key differentiator -- no other MCP screenshot server uses it. The technical proof points (Ed25519, RFC 3161, WACZ) back the claim.

Competitive alternatives in the directory context:

| Alternative | What they say | WRL's counter-position |
|-------------|--------------|----------------------|
| mcp-screenshot-server (sethbang) | "Capture screenshots of web pages using Puppeteer" | Screenshots are artifacts. WRL produces signed evidence bundles. |
| Wayback Machine MCP (Cyreslab-AI) | "Access Internet Archive's Wayback Machine" | Read-only access to existing archives vs. on-demand capture with cryptographic proof |
| ArchiveBox MCP (pragmar) | "Search content and metadata from ArchiveBox archives" | Accesses existing local archives vs. capture + sign + verify workflow |
| firecrawl-mcp-server | "Web scraping and search" | Data extraction vs. evidence preservation |

The "Legal" category in awesome-mcp-servers is the right positioning choice because it avoids this crowded field entirely and signals WRL's actual value: evidentiary integrity.

### 5. Messaging Hierarchy for Directory Listings

**Core message (one sentence):**
Capture web pages as verifiable evidence -- signed, timestamped, and independently provable.

**Supporting messages (for longer-form descriptions where space allows):**

1. **Cryptographic integrity** -- Every capture is Ed25519-signed and bundled as a WACZ archive. Tamper-evident by construction, not by policy.
2. **Independent timestamps** -- RFC 3161 timestamps from a third-party authority prove when the capture happened. Optional eIDAS-qualified timestamps for EU legal proceedings.
3. **Public verification** -- Anyone can verify a capture's authenticity without an account, without trusting the operator, without installing anything.
4. **Standard format** -- WACZ (Web Archive Collection Zipped) is the Webrecorder community standard, adopted by Harvard LIL, Library of Congress, and Starling Lab.
5. **MCP-native** -- Four tools for AI agents: capture, retrieve, list, verify. Streamable HTTP transport.

**Proof points:**
- Ed25519 signing (concrete: every capture, not "selected" captures)
- RFC 3161 via Sectigo TSA (named provider, not "a timestamp authority")
- WACZ 1.1.1 format compliance
- FRE 902(13) certification PDF endpoint
- Open source (Apache 2.0)
- Self-hostable on Cloudflare Workers
- `@w-r-l/verify` npm package for offline verification

### 6. Naming and Terminology Guidance

For directory listings, use these terms consistently:

| Use this | Not this | Why |
|----------|----------|-----|
| "evidence bundles" | "screenshots" | WRL produces bundles, not just screenshots. "Evidence" is the category differentiator. |
| "captures" | "snapshots" or "archives" | "Captures" is the WRL term of art, matches the API (`/v1/captures`). |
| "independently verify" | "check" or "validate" | "Independent verification" signals third-party provability. |
| "signed and timestamped" | "secure" or "protected" | Specific mechanisms > vague security claims. |
| "WACZ" | "web archive" | Signals standards compliance to the archiving community. Unknown term for MCP audience, so pair it: "WACZ evidence bundle." |
| "self-hostable" | "open-source" | Both are true but "self-hostable" communicates the operational benefit. Lead with it, follow with Apache 2.0. |


## Proposed Tasks

### T1: Update server.json description and websiteUrl
- Revise `description` field per recommendation 2a
- Change `websiteUrl` from GitHub repo URL to `https://docs.webresourceledger.com`
- Verify `repository.url` and `repository.id` match the actual public GitHub repo
- Owner: implementation agent

### T2: Publish to Official MCP Registry
- Ensure server.json conforms to the registry's 2025-10-17 schema
- Run `mcp-publisher init` and `mcp-publisher publish`
- Pre-requisite: npm package with `mcpName` matching server name
- Verify the `io.github.benpeter/web-resource-ledger` naming matches GitHub auth requirements
- Owner: implementation agent (depends on T1)

### T3: Submit to punkpeye/awesome-mcp-servers
- Open PR to the main awesome-mcp-servers repo (punkpeye)
- Place entry in "Legal" category using the draft from 2b
- If PR is rejected for category, propose "Security" as fallback
- Follow contribution guidelines (check for CONTRIBUTING.md)
- Owner: implementation agent (depends on T1)

### T4: Submit to MCP.so
- Open issue on chatmcp/mcpso repo with server details
- Use description from 2c
- Include: name, description, GitHub URL, connection URL, tool list
- Owner: implementation agent

### T5: Publish to Smithery
- Run `smithery mcp publish <url> -n benpeter/web-resource-ledger`
- Verify listing appears with correct description and README
- Owner: implementation agent (depends on T1)

### T6: Claim listing on Glama
- Wait for Glama to auto-index (or manually trigger by visiting glama.ai)
- Claim the server via admin panel
- Verify description, tools, and metadata are correct
- Owner: implementation agent (depends on T1)

### T7: Submit PR to IIPC awesome-web-archiving
- Add entry to "Acquisition" section using draft from 2f
- Follow the repo's contribution format exactly (link, dash, description, status)
- This is a different audience -- no mention of MCP, AI agents, or "evidence infrastructure"
- Lead with WACZ, Ed25519, RFC 3161
- Owner: implementation agent

### T8: Submit to forensics awesome lists
- Submit to cugu/awesome-forensics and ivbeg/awesome-forensicstools
- Use forensics-oriented descriptions from 2g
- Lead with FRE 902(13), Ed25519, RFC 3161
- Owner: implementation agent

### T9: Prepare a "WRL for MCP Clients" integration guide
- Write a short page on the docs site showing WRL integration with Claude Desktop, Cursor, and Windsurf
- Include the exact JSON config snippet for each client
- This is the page that directory click-throughs will land on
- Owner: docs specialist (not product-marketing -- this is instructional content)

### T10: Monitor and respond to directory feedback
- After submissions, monitor for PR review comments, issues, and questions
- Each directory community may have questions or requested changes
- Plan for 1-2 weeks of follow-up per submission
- Owner: project maintainer


## Risks and Concerns

### R1: "Legal" category rejection on awesome-mcp-servers
The Legal category in punkpeye/awesome-mcp-servers is small. Maintainers may argue WRL is a "Browser Automation" or "Web Scraping" tool. Mitigation: prepare a brief rationale explaining that WRL's primary value is evidentiary integrity, not browser automation. The fallback is "Security." Worst case, "Search & Data Extraction" works but buries WRL among competitors.

### R2: "In Development" status on IIPC list limits credibility
The IIPC web archiving community is conservative and values stability. Claiming "In Development" is honest but may cause some to wait. Mitigation: this is the right choice. Claiming "Stable" pre-1.0 and being caught will permanently damage credibility in a small, tight-knit community where reputation is everything.

### R3: Repository URL mismatch
The server.json currently references `benpeter/web-resource-ledger` while the GitHub context mentions `ArtificialArchitects/web-resource-ledger`. All directory listings must point to the actual, current public repo URL. Submitting with a wrong URL wastes the submission and looks unprofessional. Verify before any submission.

### R4: Description length constraints
Different directories have different display constraints. MCP.so truncates long descriptions. Smithery's web UI may show only the first 100-150 characters. The first sentence of every description must stand alone as a complete value proposition. All drafts above are structured with the strongest sentence first.

### R5: Timing dependency on docs site MCP guide
If `websiteUrl` points to docs.webresourceledger.com, the MCP integration page must exist and be accurate before directory submissions. A directory listing that links to a 404 or a page that says "coming soon" undermines every claim. Task T9 must precede T2-T6.

### R6: Audience confusion from inconsistent descriptions
Having different descriptions per directory is correct (different audiences) but creates a risk: if someone sees WRL on both MCP.so and IIPC's list, the different framings could seem inconsistent. Mitigation: all descriptions share the same factual claims (Ed25519, RFC 3161, WACZ) and differ only in emphasis and audience context. The core identity is consistent.

### R7: "Evidence" claim without legal validation
WRL positions as "evidence" but has not been tested in any legal proceeding. The directory descriptions use "designed for legal evidence" and "evidence bundles" without claiming "court-admissible" or "legally binding." This is the correct boundary. But the IIPC and forensics communities may ask pointed questions about evidentiary standing. Prepare a factual response: "WRL provides the technical infrastructure for evidence integrity (signing, timestamping, standard format). Evidentiary admissibility is a legal determination that depends on jurisdiction, case context, and judicial discretion."

### R8: Overcrowded MCP directories may bury the listing
MCP.so alone has 18,900+ servers. Glama indexes thousands. Simply being listed does not guarantee discovery. The listing is necessary but not sufficient -- it establishes presence for when people search for "web evidence" or "legal" or "archive" within these directories. The real discovery will come from SEO, community engagement, and content marketing (per the GTM plan).


## Additional Agents Needed

**software-docs-minion** -- needed for T9 (MCP client integration guide). The integration guide is instructional documentation, not positioning copy. It needs exact config snippets for Claude Desktop (`claude_desktop_config.json`), Cursor (`.cursor/mcp.json`), and Windsurf, with tested examples. Product-marketing can provide the framing ("Why connect WRL to your AI agent?") but the technical content is docs territory.

No other additional agents needed. The directory submissions themselves (T2-T8) are execution tasks that follow the positioning templates above. They do not require specialized technical knowledge beyond what is already in the server.json and README.
