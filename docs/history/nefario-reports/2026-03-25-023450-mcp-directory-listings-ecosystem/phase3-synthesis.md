# Phase 3: Synthesis -- MCP Directory Listings and Ecosystem (R35)

## Delegation Plan

**Team name**: mcp-directory-ecosystem
**Description**: Make WRL discoverable in the MCP ecosystem and web archiving communities by fixing docs issues, updating registry metadata, adding integration examples for additional MCP clients, and submitting to directories and awesome lists.

---

### Conflict Resolutions

Before the task breakdown, here are the key decisions made during synthesis:

**1. Tool naming: `capture_url` is correct, `capture_page` is a site docs bug**
Source code (`src/mcp.js`) registers the tool as `capture_url`. The repo docs (`docs/mcp.md`) are correct. The published site docs (`site/content/mcp.md`) incorrectly use `capture_page` in 7+ places and also list a phantom `batch_capture` MCP tool that does not exist in the MCP server implementation. Both must be fixed before any directory submissions go out.

**2. Smithery: Skip**
mcp-minion correctly identified the architecture mismatch -- Smithery's model requires deploying a Docker container, and WRL runs as a Cloudflare Worker. The success criteria mention Smithery as one option of three ("at least two of: MCP.so, Smithery, Glama"), not a requirement. We satisfy the criteria with Official MCP Registry + Glama + MCP.so (three directories), making Smithery unnecessary. Attempting a proxy container would violate YAGNI.

**3. Awesome MCP Servers category: "Legal"**
Chosen: "Legal" category (product-marketing-minion recommendation).
Over: "Search & Data Extraction" (mcp-minion recommendation) and "Security" (both suggested as fallback).
Why: "Legal" is a small category (1-2 entries) where WRL will be visible. "Search & Data Extraction" has 50+ screenshot tools where WRL gets buried. The "big-fish-small-pond" positioning is correct. If maintainers reject "Legal", the PR description should propose "Security" as fallback.

**4. Cline: Include but with caveat**
devx-minion flagged uncertainty about Cline's Streamable HTTP support (cline/cline#3315). Include Cline config in docs (low effort, identical format to Cursor) but note that it requires verification. The task prompt instructs the agent to test if possible and add a note if untested.

**5. server.json version: Bump to `1.0.0`**
The MCP server has been stable since R15 shipped. The API versioning commitment (PR #191) solidifies this. The `version` field in server.json reflects the MCP server interface version, not the overall product. Four tools, stable transport, stable auth -- this is 1.0.0.

**6. COPTR wiki: Out of scope for automated execution**
COPTR requires manual wiki account creation and form filling on a third-party wiki. This cannot be automated via `gh` CLI or PRs. Capture it as a follow-up task in the outcome, not an execution task.

**7. `batch_capture` in site docs: Remove from MCP page**
The `batch_capture` section in `site/content/mcp.md` (lines 170-181) documents a tool that does not exist in the MCP server. The batch endpoint exists as a REST API (`POST /v1/captures/batch`) but was never exposed as an MCP tool. Remove it from the MCP docs page to avoid confusing directory traffic.

---

### Task 1: Fix docs and update server.json (Foundation)
- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: All downstream directory submissions depend on correct tool names, descriptions, and server.json metadata. Hard to reverse once external PRs are submitted with wrong information.
- **Gate rationale**: |
    Chosen: Fix all naming issues, update server.json schema and description, add VS Code + Cline configs in a single foundation task
    Over: (1) Submitting with current docs and fixing later (risks wrong tool names in external PRs that are hard to amend), (2) Splitting into separate tasks for docs fix vs server.json vs new configs (unnecessary serialization for tightly coupled changes)
    Why: Directory submissions will reference these exact tool names and docs URLs. Getting it wrong means amending PRs on external repos we don't control.
- **Prompt**: |

    ## Task: Fix MCP docs inconsistencies, update server.json, and add client configs

    You are preparing WRL's MCP documentation and registry metadata for directory submissions. Everything downstream depends on this being correct.

    ### Part A: Fix tool naming in site docs

    The published site docs (`site/content/mcp.md`) have two bugs:

    1. **Wrong tool name**: The file uses `capture_page` in multiple places. The actual MCP tool name (in `src/mcp.js` line 55) is `capture_url`. Replace ALL occurrences of `capture_page` with `capture_url` in `site/content/mcp.md`.

    2. **Phantom tool**: Lines 170-181 document a `batch_capture` MCP tool. This tool does NOT exist in the MCP server (`src/mcp.js` has exactly 4 tools: `capture_url`, `get_capture`, `list_captures`, `verify_capture`). The batch endpoint exists as a REST API but is not exposed via MCP. Remove the entire `batch_capture` section (the heading, table, description, and the link to batch guide). Also remove any references to `batch_capture` in the Troubleshooting section (line 247 mentions it).

    3. **Sync check**: After fixing site/content/mcp.md, diff it against `docs/mcp.md` (the repo-level reference). The repo docs already use `capture_url` correctly. Ensure both files are consistent in tool names, parameter names, and descriptions. The site version has `batch_capture` and different tutorial wording -- align the tool reference sections. The site version may have additional content (like `batch_capture` and `Example agent workflows`) that the repo version doesn't -- that's fine as long as the tool names and parameters match.

    ### Part B: Update server.json

    Update `server.json` in the repo root with these changes:

    1. **Schema version**: Change from `2025-10-17` to `2025-12-11`
    2. **Description**: Change to: `Capture web pages as verifiable evidence your agent can cite. Every capture is Ed25519-signed, RFC 3161-timestamped, and bundled as a WACZ archive. Four tools: capture_url, get_capture, list_captures, verify_capture.`
    3. **Version**: Change from `0.1.0` to `1.0.0`
    4. **websiteUrl**: Change from `https://github.com/benpeter/web-resource-ledger` to `https://docs.webresourceledger.com`
    5. **Headers format**: Convert from the simple key-value object to the structured array format:
       ```json
       "headers": [
         {
           "name": "Authorization",
           "description": "Bearer token using your WRL API key (format: Bearer wrl_live_...)",
           "isRequired": true,
           "isSecret": true
         }
       ]
       ```
    6. Keep `repository.url`, `repository.source`, and `repository.id` as they are (already correct: `benpeter/web-resource-ledger`).

    ### Part C: Add glama.json

    Create `glama.json` in the repo root:
    ```json
    {
      "$schema": "https://glama.ai/mcp/schemas/server.json",
      "maintainers": ["benpeter"]
    }
    ```

    ### Part D: Add VS Code and Cline config examples

    Add two new client sections to BOTH `docs/mcp.md` AND `site/content/mcp.md`, in the Setup section.

    **VS Code (GitHub Copilot)** -- add BEFORE the Claude Code section (largest audience first):

    ```
    ### VS Code (GitHub Copilot)

    Add to `.vscode/mcp.json` in your project directory:

    ```json
    {
      "servers": {
        "wrl": {
          "type": "http",
          "url": "https://api.webresourceledger.com/mcp",
          "headers": {
            "Authorization": "Bearer ${input:wrl-api-key}"
          }
        }
      },
      "inputs": [
        {
          "type": "promptString",
          "id": "wrl-api-key",
          "description": "WRL API key (capture + read scopes)",
          "password": true
        }
      ]
    }
    ```

    VS Code prompts for the API key on first use and stores it securely.
    ```

    **Cline** -- add AFTER the Cursor section (similar config format):

    ```
    ### Cline

    Open Cline sidebar > MCP Servers > Configure, then add:

    ```json
    {
      "mcpServers": {
        "wrl": {
          "url": "https://api.webresourceledger.com/mcp",
          "headers": {
            "Authorization": "Bearer YOUR_API_KEY"
          }
        }
      }
    }
    ```
    ```

    ### Part E: Add "try it" prompt

    After the Generic MCP client section (or after the last client-specific section, before the Available tools heading), add a brief "Try it" callout in both docs files:

    ```
    > **Try it:** Ask your agent: *"Capture https://example.com as evidence and verify it."*
    ```

    ### Part F: Reorder Setup sections

    Reorder the client sections in BOTH docs files to: VS Code (GitHub Copilot), Claude Code, Cursor, Cline, Windsurf, Generic MCP client.

    ### What NOT to do
    - Do not change the Available tools section content beyond fixing the `capture_page` -> `capture_url` rename and removing `batch_capture`
    - Do not change the Tutorial section content beyond the tool name fix
    - Do not modify `src/mcp.js` -- the source code is correct
    - Do not add a smithery.yaml file
    - Do not create separate files per client -- keep everything on the single MCP page

    ### Files to modify
    - `server.json` (update schema, description, version, websiteUrl, headers format)
    - `site/content/mcp.md` (fix capture_page, remove batch_capture, add VS Code + Cline, reorder, add try-it)
    - `docs/mcp.md` (add VS Code + Cline, reorder, add try-it, sync check)
    - `glama.json` (create new)

    ### Success criteria
    - `capture_page` appears ZERO times in the codebase (grep to verify)
    - `batch_capture` appears ZERO times in site/content/mcp.md
    - server.json validates against the 2025-12-11 schema structure
    - Both docs files have identical client config sections (same clients, same order, same snippets)
    - glama.json exists at repo root

- **Deliverables**: Updated server.json, fixed site/content/mcp.md, updated docs/mcp.md, new glama.json
- **Success criteria**: Zero occurrences of `capture_page` in codebase; zero occurrences of `batch_capture` in MCP docs; server.json at schema 2025-12-11 with structured headers; both docs files have 6 client configs in correct order; glama.json exists

---

### Task 2: Submit to Official MCP Registry
- **Agent**: mcp-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Publish WRL to the Official MCP Registry

    The server.json has been updated (Task 1). Now publish it to the official MCP registry at registry.modelcontextprotocol.io.

    ### Steps

    1. Check if `mcp-publisher` CLI is installed: `which mcp-publisher`. If not installed, install via: `npm install -g mcp-publisher` (or check the official installation method -- the tool may be available via Homebrew or npx).

    2. Authenticate with GitHub: `mcp-publisher login github` (this uses OAuth device flow).

    3. Publish: `mcp-publisher publish` (run from the repo root where server.json lives).

    4. Verify the listing: `curl -s "https://registry.modelcontextprotocol.io/v0.1/servers?search=web-resource-ledger" | jq .`

    ### Important notes
    - The namespace `io.github.benpeter/web-resource-ledger` uses GitHub authentication (simplest path)
    - The registry is in preview -- "breaking changes or data resets may occur before general availability"
    - If `mcp-publisher` doesn't exist or the CLI interface has changed, check: `npx mcp-publisher --help` or search npm for the current package name
    - If the publish fails, capture the error output -- it may need schema adjustments

    ### What NOT to do
    - Do not modify server.json (it was already updated in Task 1)
    - Do not attempt DNS-based namespace authentication (save for later)
    - Do not create any additional config files

    ### Success criteria
    - `mcp-publisher publish` succeeds (or equivalent command)
    - The server appears in registry search results
    - Registry entry shows correct name, description, and endpoint URL

- **Deliverables**: WRL listed on the official MCP registry
- **Success criteria**: Server appears in registry search results at registry.modelcontextprotocol.io

---

### Task 3: Submit to Awesome MCP Servers (punkpeye)
- **Agent**: product-marketing-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Submit WRL to punkpeye/awesome-mcp-servers

    Create a pull request to the main awesome-mcp-servers list.

    ### Steps

    1. Fork the repo: `gh repo fork punkpeye/awesome-mcp-servers --clone=false`

    2. Read the repo's README.md and CONTRIBUTING.md (if it exists) to understand the exact entry format, category list, and submission guidelines. Use `gh api repos/punkpeye/awesome-mcp-servers/contents/README.md` to read the file, or clone and read locally.

    3. Find the "Legal" category section (look for the ⚖️ emoji or "Legal" heading). If "Legal" doesn't exist as a category, check for "Security" (🔒). Note the exact format of existing entries.

    4. Create the entry following the EXACT format used by other entries in the file. The content should be:
       ```
       - [benpeter/web-resource-ledger](https://github.com/benpeter/web-resource-ledger) 📇 ☁️ - Capture web pages as cryptographically signed, timestamped evidence bundles (WACZ). Ed25519 signatures, RFC 3161 timestamps, and public verification URLs. Designed for legal evidence, compliance archiving, and AI agent grounding.
       ```
       Badges: `📇` = TypeScript, `☁️` = Cloud Service. Check the repo's badge legend and use ONLY badges that match their conventions.

    5. Insert the entry in ALPHABETICAL order within the chosen category.

    6. Create the PR:
       ```
       gh pr create --repo punkpeye/awesome-mcp-servers \
         --title "Add Web Resource Ledger - web evidence capture with cryptographic signatures" \
         --body "$(cat <<'EOF'
       ## What is Web Resource Ledger?

       An MCP server that captures web pages as tamper-evident evidence bundles. Every capture is Ed25519-signed, RFC 3161-timestamped, and packaged as a WACZ archive that anyone can independently verify.

       **Why Legal category?** WRL's primary value is evidentiary integrity -- cryptographic proof of what a web page contained at a specific time. This serves legal evidence preservation, compliance archiving, and audit trails. It is not a browser automation or web scraping tool.

       - **MCP endpoint:** https://api.webresourceledger.com/mcp (Streamable HTTP)
       - **Tools:** capture_url, get_capture, list_captures, verify_capture
       - **GitHub:** https://github.com/benpeter/web-resource-ledger
       - **Docs:** https://docs.webresourceledger.com/mcp/
       - **License:** Apache 2.0
       EOF
       )"
       ```

    ### Category strategy
    - **First choice**: "Legal" (⚖️) -- small category, high visibility, accurate positioning
    - **Fallback if Legal doesn't exist or maintainers push back**: "Security" (🔒) -- evidence integrity, cryptographic signing, tamper detection all fit
    - **Last resort**: "Search & Data Extraction" -- accurate but buries WRL among 50+ screenshot tools

    ### What NOT to do
    - Do not submit to appcypher/awesome-mcp-servers in this task (separate task)
    - Do not modify any other entries in the file
    - Do not use the `🤖🤖🤖` robot PR marker (we want human review)
    - Do not include the Smithery badge unless the repo's convention requires it

    ### Success criteria
    - PR is created and visible on punkpeye/awesome-mcp-servers
    - Entry is in the correct category with correct format
    - PR description explains the category choice

- **Deliverables**: Open PR on punkpeye/awesome-mcp-servers
- **Success criteria**: PR created with correct format and category placement

---

### Task 4: Submit to Awesome MCP Servers (appcypher)
- **Agent**: product-marketing-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Submit WRL to appcypher/awesome-mcp-servers

    Create a pull request to the alternative awesome-mcp-servers list.

    ### Steps

    1. Fork the repo: `gh repo fork appcypher/awesome-mcp-servers --clone=false`

    2. Read the repo's README.md to understand the exact entry format and category list. Use `gh api repos/appcypher/awesome-mcp-servers/contents/README.md` to read it.

    3. Find the best-fit category. Look for "Security", "Search & Web", "Legal", or similar. Match the exact section heading and format.

    4. Create the entry following the repo's EXACT format. Content:
       ```
       - [Web Resource Ledger](https://github.com/benpeter/web-resource-ledger) - Capture web pages as cryptographically signed evidence with Ed25519 signatures, RFC 3161 timestamps, and WACZ archive bundles. MCP server with four tools for AI agent workflows.
       ```

    5. Insert in ALPHABETICAL order within the category.

    6. Create the PR with a clear title and description explaining what WRL is and why it fits the chosen category.

    ### What NOT to do
    - Do not duplicate work from the punkpeye submission
    - Do not modify existing entries

    ### Success criteria
    - PR is created on appcypher/awesome-mcp-servers with correct format

- **Deliverables**: Open PR on appcypher/awesome-mcp-servers
- **Success criteria**: PR created with correct format

---

### Task 5: Submit to MCP.so
- **Agent**: mcp-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Submit WRL to MCP.so

    MCP.so is a directory that accepts submissions via GitHub issues on the chatmcp/mcpso repository.

    ### Steps

    1. Check the submission process: `gh repo view chatmcp/mcpso` and look for issue templates or CONTRIBUTING.md.

    2. Create a GitHub issue with the server details:
       ```
       gh issue create --repo chatmcp/mcpso \
         --title "Add Web Resource Ledger - web evidence capture MCP server" \
         --body "$(cat <<'EOF'
       ## Server Information

       **Name:** Web Resource Ledger
       **GitHub:** https://github.com/benpeter/web-resource-ledger
       **MCP Endpoint:** https://api.webresourceledger.com/mcp
       **Transport:** Streamable HTTP
       **Documentation:** https://docs.webresourceledger.com/mcp/

       ## Description

       Capture web pages as tamper-evident evidence with cryptographic signatures and independent timestamps. Your AI agent gets four tools: capture_url, get_capture, list_captures, and verify_capture. Every capture produces a signed WACZ bundle anyone can independently verify.

       ## Tools

       - `capture_url` - Capture a web page as signed evidence (Ed25519 + RFC 3161 timestamp)
       - `get_capture` - Get capture status and artifact URLs
       - `list_captures` - List recent captures with filters
       - `verify_capture` - Verify cryptographic integrity of a capture

       ## Tags

       legal, web-capture, evidence, verification, archiving, WACZ, cryptographic-signing

       ## License

       Apache 2.0
       EOF
       )"
       ```

    3. If the repo uses a different submission format (issue template), adapt accordingly.

    ### What NOT to do
    - Do not submit a PR (MCP.so uses issues, not PRs, for submissions)
    - Do not include pricing information

    ### Success criteria
    - Issue is created on chatmcp/mcpso with correct server details

- **Deliverables**: Open issue on chatmcp/mcpso
- **Success criteria**: Issue created with server details

---

### Task 6: Submit to PulseMCP
- **Agent**: mcp-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |

    ## Task: Submit WRL to PulseMCP

    PulseMCP auto-indexes from the official MCP registry but also accepts manual submissions.

    ### Steps

    1. Check if WRL already appears on PulseMCP (it may have been auto-indexed after the official registry publish in Task 2). Visit or fetch: `https://www.pulsemcp.com/servers?q=web-resource-ledger`

    2. If not yet indexed, submit manually at https://www.pulsemcp.com/submit. Use a browser tool or note the submission URL for manual follow-up.

    3. If auto-indexed, verify the listing details are correct (name, description, endpoint).

    ### What NOT to do
    - Do not create duplicate submissions if already indexed
    - Do not modify server.json

    ### Success criteria
    - WRL appears on PulseMCP (either auto-indexed or manually submitted)

- **Deliverables**: WRL listed or submitted on PulseMCP
- **Success criteria**: Server discoverable on pulsemcp.com

---

### Task 7: Submit to IIPC awesome-web-archiving
- **Agent**: product-marketing-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Submit WRL and @w-r-l/verify to IIPC awesome-web-archiving

    The IIPC (International Internet Preservation Consortium) maintains the authoritative web archiving tool list. This is a different audience from MCP directories -- they know WARC, WACZ, and OAIS. They do NOT know or care about MCP or AI agents.

    ### Steps

    1. Fork the repo: `gh repo fork iipc/awesome-web-archiving --clone=false`

    2. Read the README to understand the exact format: `gh api repos/iipc/awesome-web-archiving/contents/README.md`

    3. Find the "Acquisition" section (under "Tools & Software"). This is where Browsertrix, ArchiveWeb.page, Scoop, and similar capture tools are listed.

    4. Add the WRL entry in ALPHABETICAL order within the Acquisition section. Use the repo's exact format (typically: `* [Name](URL) - Description. *(Status)*`):
       ```
       * [Web Resource Ledger](https://github.com/benpeter/web-resource-ledger) - API-first web capture service producing Ed25519-signed WACZ bundles with RFC 3161 timestamps. Includes a public verification endpoint and optional eIDAS-qualified timestamps. Self-hostable on Cloudflare Workers. *(In Development)*
       ```

    5. Find the "Utilities" section. Add the @w-r-l/verify entry:
       ```
       * [wrl-verify](https://www.npmjs.com/package/@w-r-l/verify) - CLI tool to verify cryptographic integrity of WRL captures (Ed25519 signatures, RFC 3161 timestamps, artifact hashes). Zero-install via npx. *(In Development)*
       ```

    6. Create a SINGLE PR with both entries:
       ```
       gh pr create --repo iipc/awesome-web-archiving \
         --title "Add Web Resource Ledger and wrl-verify" \
         --body "$(cat <<'EOF'
       Adds two related tools:

       **Web Resource Ledger** (Acquisition) — API-first web capture service that produces Ed25519-signed WACZ bundles with RFC 3161 timestamps. Each capture includes a public verification endpoint. Self-hostable on Cloudflare Workers. Currently in development (pre-1.0).

       **wrl-verify** (Utilities) — Standalone CLI tool (available via `npx @w-r-l/verify`) for verifying the cryptographic integrity of WRL captures. Checks Ed25519 signatures, RFC 3161 timestamps, and artifact hashes.

       Both tools are open source (Apache 2.0).

       - GitHub: https://github.com/benpeter/web-resource-ledger
       - npm: https://www.npmjs.com/package/@w-r-l/verify
       EOF
       )"
       ```

    ### Positioning for this audience
    - Lead with WACZ format -- this is the Webrecorder community's standard
    - Emphasize Ed25519 signing and RFC 3161 timestamps -- no other tool in this list has both
    - "API-first" signals developer tool, not browser extension
    - "Self-hostable" is important to this community (institutions want control)
    - Use "*(In Development)*" status -- this community is conservative and values honesty. Claiming "Stable" pre-1.0 would damage credibility.
    - Do NOT mention MCP, AI agents, or "evidence infrastructure" -- irrelevant to this audience
    - Do NOT mention FRE 902(13) -- this is a web archiving list, not forensics

    ### What NOT to do
    - Do not mention MCP or AI agents in the entry or PR description
    - Do not claim "Stable" status
    - Do not submit to COPTR (requires manual wiki account -- out of scope for this task)
    - Do not submit to digipres/awesome-digital-preservation (covered by IIPC)

    ### Success criteria
    - PR is created on iipc/awesome-web-archiving with both entries
    - Entries use the correct format and are in alphabetical order within their sections
    - Description focuses on WACZ, signing, and timestamps (not MCP/AI)

- **Deliverables**: Open PR on iipc/awesome-web-archiving with WRL and @w-r-l/verify entries
- **Success criteria**: PR created with correct format for web archiving audience

---

### Task 8: Submit @w-r-l/verify to awesome-nodejs-security
- **Agent**: product-marketing-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Submit @w-r-l/verify to a relevant "awesome" list

    The success criteria require @w-r-l/verify to be submitted to "at least one relevant awesome list." The best fit is a security or forensics list where cryptographic verification tools are valued.

    ### Steps

    1. Check `lirantal/awesome-nodejs-security` -- this is the main Node.js security awesome list. Read the README: `gh api repos/lirantal/awesome-nodejs-security/contents/README.md`

    2. If there's a section for "Data Validation" or "Cryptography" or "Verification", add @w-r-l/verify there.

    3. If that repo doesn't fit well, try `cugu/awesome-forensics` instead. Read: `gh api repos/cugu/awesome-forensics/contents/README.md`. Look for "Internet Artifacts" or "Verification" sections.

    4. Create a PR with an entry like:
       ```
       - [@w-r-l/verify](https://www.npmjs.com/package/@w-r-l/verify) - Verify cryptographic integrity of web captures: Ed25519 signatures, RFC 3161 timestamps, artifact hashes. Zero-install CLI via npx.
       ```

    5. For forensics lists, use this variant:
       ```
       - [Web Resource Ledger](https://github.com/benpeter/web-resource-ledger) - Capture web pages with Ed25519 signatures, RFC 3161 timestamps, and WACZ evidence bundles. FRE 902(13) certification endpoint. REST API and MCP server.
       ```

    ### What NOT to do
    - Do not submit to awesome-nodejs (too generic)
    - Do not create more than one PR in this task -- pick the single best fit

    ### Success criteria
    - PR created on at least one relevant awesome list for @w-r-l/verify

- **Deliverables**: Open PR on a relevant awesome list
- **Success criteria**: PR created targeting verification/security/forensics audience

---

### Cross-Cutting Coverage

- **Testing**: Not included as a separate task. This work produces documentation and external submissions, not executable code. The site docs fix (Task 1) changes markdown only. server.json and glama.json are metadata files. Phase 6 (test execution) will run existing tests to verify no regressions from docs changes.
- **Security**: Not included. No new attack surface, no auth changes, no user input handling. The work is documentation and external directory submissions.
- **Usability -- Strategy**: Covered by devx-minion in Task 1 (client config ordering by audience size, "try it" prompt for zero-to-first-capture path, single-page structure for directory traffic). product-marketing-minion covers audience-specific positioning in Tasks 3-4, 7-8.
- **Usability -- Design**: Not included. No UI changes. All deliverables are text (markdown, JSON, PR descriptions).
- **Documentation**: Task 1 IS the documentation task -- it fixes bugs and adds content to both docs files. Phase 8 (post-execution) will assess if additional documentation changes are needed.
- **Observability**: Not included. No runtime components are created or modified.

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - user-docs-minion: The site docs changes in Task 1 are user-facing documentation (the MCP page is the primary onboarding surface for directory traffic). user-docs-minion should review the "try it" prompt, client config ordering, and tutorial consistency.
    Review focus: Whether the updated MCP docs page provides a coherent zero-to-first-capture experience for directory traffic landing cold.
- **Not selected**:
  - ux-design-minion: No UI components or visual layouts in this plan.
  - accessibility-minion: No HTML/UI output -- all deliverables are markdown and JSON.
  - sitespeed-minion: No web-facing runtime code changes.
  - observability-minion: No runtime components.
  - software-docs-minion: The documentation being modified is user-facing (docs site), not architectural. user-docs-minion covers this.

---

### Decisions

- **Smithery skip**
  Chosen: Skip Smithery entirely
  Over: Creating a proxy container, or investigating remote-only listing
  Why: Smithery requires Docker deployment; WRL is a Cloudflare Worker. A proxy container adds latency and complexity for a directory that isn't required by the success criteria. YAGNI.

- **Awesome MCP Servers category**
  Chosen: "Legal" category (product-marketing-minion)
  Over: "Search & Data Extraction" (mcp-minion's initial suggestion)
  Why: "Legal" is a small pond (1-2 entries) where WRL is immediately visible. "Search & Data Extraction" has 50+ entries. WRL's value is evidentiary integrity, not data extraction.

- **batch_capture removal from MCP docs**
  Chosen: Remove the batch_capture section from site/content/mcp.md
  Over: Adding batch_capture to the MCP server (src/mcp.js)
  Why: The batch endpoint exists as REST API but was never exposed as an MCP tool. Directory traffic trying `batch_capture` via MCP would get errors. Removing the docs entry is correct; adding the tool is new scope that belongs on the backlog.

- **server.json version 1.0.0**
  Chosen: Bump to 1.0.0
  Over: Keeping 0.1.0 (mcp-minion noted the discrepancy but didn't pick a number)
  Why: The MCP server has 4 stable tools, stable transport, stable auth, and the API versioning commitment (PR #191) solidifies the interface. 0.1.0 undersells maturity for directory listings.

---

### Risks and Mitigations

1. **Tool name fix may break existing bookmarks/links**: Users who bookmarked the site docs page with `capture_page` in their notes will find the tool doesn't exist. Mitigation: Low risk -- the tool was always `capture_url` in the actual server; existing users would have already discovered this.

2. **MCP Registry in preview**: May reset data before GA. Mitigation: Accept the risk; establishing presence early is worth the potential re-publish. server.json is versioned in the repo.

3. **IIPC PR review latency**: Community-run list, PRs may take weeks. Mitigation: Submit early (Task 7 can run in parallel). No downstream dependency.

4. **Cline Streamable HTTP uncertainty**: cline/cline#3315 suggests possible issues. Mitigation: Config is included with a note that it should be tested. If it doesn't work, the config can be removed in a follow-up.

5. **awesome-mcp-servers "Legal" category may not exist**: The maintainers may not have a Legal category or may reject it. Mitigation: PR description includes rationale; fallback to "Security" is documented in the task prompt.

6. **No logo for Cline Marketplace**: Cline Marketplace requires a 400x400 PNG logo. Mitigation: Cline Marketplace submission is NOT in this plan (not in success criteria). Noted as future work.

7. **mcp-publisher CLI may not exist or may have changed**: The tool name and interface may differ from what the specialist assumed. Mitigation: Task 2 prompt instructs the agent to check availability and fall back to npx or alternative approaches.

---

### Execution Order

```
Batch 1 (sequential, gated):
  Task 1: Fix docs + server.json + glama.json + client configs
  [APPROVAL GATE]

Batch 2 (parallel, all unblocked after Task 1 approval):
  Task 2: Official MCP Registry publish
  Task 3: Awesome MCP Servers (punkpeye) PR
  Task 4: Awesome MCP Servers (appcypher) PR
  Task 5: MCP.so issue
  Task 7: IIPC awesome-web-archiving PR
  Task 8: @w-r-l/verify awesome list PR

Batch 3 (after Task 2):
  Task 6: PulseMCP submission (depends on registry publish)
```

---

### External Skills

No external skills detected in project.

---

### Verification Steps

After all tasks complete:

1. **Docs consistency**: `grep -r "capture_page" site/ docs/` returns zero results
2. **Docs consistency**: `grep -r "batch_capture" site/content/mcp.md` returns zero results
3. **server.json validity**: Read server.json and verify schema version is 2025-12-11, version is 1.0.0, headers is array format
4. **glama.json exists**: `cat glama.json`
5. **Client configs present**: Both docs files have VS Code, Claude Code, Cursor, Cline, Windsurf, Generic sections
6. **External PRs/issues created**: List all PRs/issues created during execution
7. **Success criteria checklist**:
   - [ ] MCP server listed on at least two of: MCP.so, Smithery, Glama → targeting MCP.so + Glama + Official Registry (three, exceeds requirement)
   - [ ] PR submitted to Awesome MCP Servers with WRL entry → PRs on both punkpeye and appcypher repos
   - [ ] Integration examples for Claude Code, Cursor, and at least one other → VS Code, Claude Code, Cursor, Cline, Windsurf (five clients)
   - [ ] WRL listed in at least one web archiving tool index → IIPC awesome-web-archiving PR
   - [ ] @w-r-l/verify submitted to at least one relevant awesome list → Task 8
   - [ ] All directory listings link to docs site and GitHub repo → verified in PR descriptions and server.json
   - [ ] Integration examples tested and working → Phase 6 test execution + manual verification of config snippets

### Follow-up items (not in this plan)
- COPTR wiki entries (requires manual wiki account creation)
- Cline MCP Marketplace submission (requires 400x400 logo)
- DNS-based namespace for MCP registry (professional branding, not urgent)
- Webrecorder community engagement (community-building, different scope)
- Verify Cline Streamable HTTP support works in practice
- Add `batch_capture` MCP tool to backlog if demand warrants
