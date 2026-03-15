## Domain Plan Contribution: gru

### Recommendations

#### Question 1: Signing/Legal `[consider]` items -- differentiation vs. over-investment

**TL;DR**: RFC 3161 timestamps are the only signing upgrade worth near-term investment. eIDAS Qualified TSA is premature. WACZ-Auth full compliance, domain-ownership certs, and HSM are over-investment for where WRL is today.

| Item | Ring | Verdict | Rationale |
|------|------|---------|-----------|
| RFC 3161 timestamps (basic TSA) | **Trial** | Build in H2 2026 | The single most impactful signing upgrade. Moves WRL from "self-asserted time" to "independently verifiable time." Multiple free/cheap TSAs exist (FreeTSA, rfc3161.ai.moda, DigiCert, GlobalSign). The `signedData` object in `datapackage-digest.json` was explicitly designed for this. ASN.1 parsing is the main complexity -- manageable with a focused implementation sprint. |
| Multiple TSAs for redundancy | **Assess** | Defer 6+ months past first TSA | FreeTSA has no SLA and its reliability is inconsistent (recent certificate rotation, endpoint confusion). But solving redundancy before having a single TSA working is premature. Ship one TSA integration first, then evaluate whether failover is needed based on observed reliability. |
| eIDAS Qualified TSA | **Hold** | Not before 2027 | eIDAS 2.0 Qualified TSA implementing acts (Article 42(2)) had a September 2025 deadline for technical specs, but the priority-sector compliance deadline is end of 2026, and production QTSP launches are expected Q4 2026 at earliest. The ecosystem is still forming. WRL would be building against a moving target. More critically: eIDAS Qualified TSA only matters if WRL targets European legal proceedings as a core use case. For a single-operator tool, a standard RFC 3161 timestamp from a reputable CA (DigiCert, GlobalSign) carries sufficient evidentiary weight in most jurisdictions. eIDAS qualification is a differentiator for a multi-tenant legal-tech SaaS, not for WRL's current form. **Re-evaluate when**: WRL has paying European customers asking for it, or when at least 3 QTSPs offer timestamp services with published pricing and APIs. |
| WACZ-Auth full spec compliance | **Assess** | Low priority | WRL already follows WACZ-Auth 0.1.0 structure (separate `datapackage-digest.json` with `signedData`). The gap to full compliance is the domain-ownership certificate component. The spec itself (January 2022) has not seen significant revision activity -- the Webrecorder GitHub repo shows minimal spec evolution since 2023. Starling Lab produced one experimental signed WACZ with AP News, but there is no production toolchain that consumes WACZ-Auth signatures for verification. Building full compliance produces a technically correct artifact that no tool in the ecosystem can validate. |
| Domain-ownership certificate | **Hold** | Over-investment | This is the identity-proof component of WACZ-Auth: proving the signer controls the domain via a TLS certificate. It requires WRL to use the same private key for both TLS and WACZ signing -- architecturally problematic (coupling TLS identity to application signing, key rotation complexity, certificate lifecycle management). The evidentiary value is marginal: WRL's `.well-known/signing-key` endpoint already provides a public key tied to the service's domain. The forensic chain is: DNS -> domain -> Worker -> signing key. A domain-ownership certificate adds a cryptographic proof of what is already inferrable. Not worth the complexity. |
| HSM-backed key storage | **Hold** | Wait for Cloudflare native solution | Cloudflare Workers have no native HSM integration. The Keyless SSL + HSM path exists but is designed for TLS termination, not application-level signing. Integrating an external HSM (AWS CloudHSM, Azure Managed HSM) from a Worker means adding a network hop to an external cloud for every signing operation -- this adds latency (30-100ms per sign), introduces a cross-cloud dependency, and complicates the "zero-ops Cloudflare-native" architecture. The current approach (Ed25519 key as a Wrangler secret) is acceptable for a single-operator deployment. HSM becomes relevant only when: (a) WRL handles keys for multiple tenants, or (b) a compliance requirement (e.g., FIPS 140-2 Level 3) explicitly mandates it. Neither condition exists today. |

**Bottom line on Question 1**: Invest in RFC 3161 basic timestamping. It is the one upgrade that materially changes WRL's evidentiary value (from self-asserted to third-party-attested time). Everything else is either premature (eIDAS), architecturally questionable (domain-ownership certs, HSM via cross-cloud), or building for a consumer that does not yet exist (full WACZ-Auth compliance).

---

#### Question 2: MCP/AI-agent trigger -- should it move up?

**Ring: Trial. Yes, it should move up from `[consider]` to `[should]`.**

The MCP ecosystem has undergone a phase transition since the kickoff backlog was written. Key signals:

1. **Production adoption is real, not speculative.** MCP was donated to the Linux Foundation. OpenAI, Google DeepMind, Microsoft, and Salesforce all adopted it by early 2026. Tens of thousands of MCP servers exist. This is not a "watch" technology -- it is the de facto standard for agent-to-tool integration.

2. **Cloudflare itself ships MCP-native Browser Rendering.** As of May 2025, you can deploy Playwright MCP directly on Cloudflare Browser Rendering. WRL's own infrastructure provider is betting on MCP as the agent-to-tool interface. This reduces the impedance mismatch to near-zero.

3. **WRL's API is already MCP-shaped.** The existing REST API (POST to capture, GET to poll, GET to verify) maps cleanly to MCP tool definitions. An MCP server for WRL would be a thin adapter over the existing API -- not a new architecture. Estimated effort: days, not weeks.

4. **The use case is compelling and immediate.** AI agents performing research, compliance monitoring, fact-checking, or legal evidence gathering need a way to capture web state as part of their workflow. "Capture this URL and give me a tamper-evident record" is a natural tool call for agents doing any kind of web-evidence work. Gartner's projection that 40% of enterprise applications embed AI agents by end of 2026 means the addressable integration surface is expanding rapidly.

5. **EU AI Act compliance creates demand.** The August 2026 enforcement date for high-risk AI system transparency requirements means AI systems need auditable evidence trails. An MCP-accessible web capture tool that produces tamper-evident records fits directly into this compliance narrative.

6. **Market positioning upside.** Being "the MCP server for web evidence" is a niche that currently has zero occupants. No existing web archival tool (Wayback Machine, Stillio, Webrecorder, Archive-It) offers an MCP interface. First-mover advantage in this intersection is achievable with minimal effort.

**Recommended timeline**: Build in Q2 2026. Ship immediately after the list/search endpoint (`GET /v1/captures`), since agents need to be able to retrieve their captures. The dependency chain is: list endpoint -> MCP server. The MCP server itself is a weekend project given the existing API.

**Implementation note**: The MCP server should expose three tools: `capture_url` (wraps POST), `get_capture` (wraps GET), `verify_capture` (wraps GET verify). It should also expose a resource for listing captures once that endpoint exists. This is a natural candidate for the mcp-minion to implement.

---

#### Question 3: Capture fidelity -- Cloudflare Browser Rendering limitations and alternatives

**Ring for the fidelity gap: Assess. The limitations are real but the alternatives are worse than the workarounds.**

**Current state of Browser Rendering (March 2026):**
- REST API rate limits increased 3x (now 600/min on paid plans)
- Playwright GA at v1.57.0 via `@cloudflare/playwright`
- New `/crawl` endpoint in beta (site-level crawling)
- Full CDP protocol access via WebSocket (Network, Page, Runtime, DOM, Input, Emulation domains confirmed)
- No changelog entries mentioning certificate info or response.securityDetails
- No changelog entries mentioning network timing metrics beyond `X-Browser-Ms-Used` header

**The certificate info gap:**

Playwright upstream does not expose `response.securityDetails()` -- this is a Puppeteer-only API (via CDP `Security.securityStateChanged`). There is an [open feature request](https://github.com/microsoft/playwright-python/issues/629) for it in Playwright, but it has not been implemented. Since WRL migrated to Playwright in phase 0014, the certificate info gap is a Playwright limitation, not just a Cloudflare limitation.

However, Cloudflare Browser Rendering does support CDP protocol access via WebSocket. This means it is *technically possible* to open a CDP session alongside Playwright and use the `Security` and `Network` CDP domains to capture certificate details. This would be a custom integration -- not a first-class Playwright API -- but it is achievable within the current platform constraints.

**Practical assessment of workarounds:**

| Gap | Workaround | Feasibility | Priority |
|-----|-----------|-------------|----------|
| TLS certificate info | CDP `Security.securityStateChanged` via WebSocket alongside Playwright | Medium -- requires dual-protocol management, adds complexity | Low for MVP+1. Certificate info is forensic-grade evidence, not needed for basic web state capture. |
| Network timing | CDP `Network.requestWillBeSent` + `Network.responseReceived` via WebSocket | Medium -- same dual-protocol approach | Low. Timing is a bonus signal, not core to WRL's value prop. |
| Full HTTP exchange | CDP `Network.enable` with full request/response interception | Medium-High -- significant data volume, storage implications | Medium-term. This is the path to Scoop-level capture fidelity without leaving Cloudflare. |
| Sub-resource archiving | Page resource enumeration via CDP + individual fetch | High complexity -- CORS issues, storage multiplication, deduplication | Low priority. The backlog correctly identifies this as a significant complexity escalation. |

**Alternatives to Cloudflare Browser Rendering:**

| Alternative | Pros | Cons | Verdict |
|------------|------|------|---------|
| Cloudflare Containers + full Chromium | Unrestricted CDP, full network stack, certificate access, no API limits | Still in preview (not GA), pricing model uncertain, adds ops complexity, breaks "zero-ops" architecture | **Assess** -- monitor for GA and stable pricing. This is the escape hatch if Browser Rendering limits become blocking. |
| External browser service (Browserless, BrowserStack, etc.) | Full CDP, mature APIs | Adds external dependency, egress costs, latency, breaks Cloudflare-native constraint | **Hold** -- defeats WRL's architectural advantage. |
| Cloudflare Queue + Container hybrid | Use Queue to dispatch to Container-based Chromium for high-fidelity captures | Best of both worlds architecturally, but doubles infrastructure complexity | **Assess** -- viable design pattern once Containers reach GA. |

**Recommendation on capture fidelity:**

Do not chase forensic-grade capture fidelity now. The current approach (rendered HTML + screenshot + HTTP headers) serves the core value proposition. RFC 3161 timestamps add more evidentiary value than certificate info does.

If forensic capture becomes a stated requirement, the path is:
1. First: try CDP via WebSocket within Browser Rendering (cheapest, stays Cloudflare-native)
2. If that hits walls: evaluate Cloudflare Containers when they reach GA
3. Last resort: external browser service

Monitor Cloudflare Containers for GA announcement and stable pricing -- this is the most likely unlock for the full capture fidelity story.

---

### Proposed Tasks

**Task 1: RFC 3161 Timestamp Integration**
- What: Integrate a single RFC 3161 TSA (recommend DigiCert or GlobalSign over FreeTSA for reliability). Add timestamp response to `signedData` in `datapackage-digest.json`. Update verification endpoint to validate the timestamp.
- Deliverables: TSA integration module, updated WACZ bundling, updated verification pipeline, tests
- Dependencies: None (current signing infrastructure supports extension)
- Timeline: Q2 2026
- Handoff: Implementation to edge-minion + security-minion

**Task 2: MCP Server for WRL**
- What: Build an MCP server exposing `capture_url`, `get_capture`, and `verify_capture` tools. Use Streamable HTTP transport for remote deployment.
- Deliverables: MCP server package, documentation, example agent integration
- Dependencies: List/search endpoint (`GET /v1/captures`) should ship first or concurrently
- Timeline: Q2 2026, after or alongside list endpoint
- Handoff: Implementation to mcp-minion

**Task 3: CDP Capture Fidelity Spike**
- What: Proof-of-concept: open CDP WebSocket session alongside Playwright within Browser Rendering. Attempt to capture TLS certificate details and network timing via `Security` and `Network` CDP domains. Determine what is possible within Cloudflare's sandboxed CDP environment.
- Deliverables: Spike report documenting what works, what does not, and performance impact
- Dependencies: None
- Timeline: Q3 2026 (lower priority than Tasks 1-2)
- Handoff: Implementation to edge-minion

**Task 4: Cloudflare Containers Monitoring**
- What: Track Cloudflare Containers for GA announcement and stable pricing. When GA, evaluate as escape hatch for capture fidelity constraints.
- Deliverables: Technology assessment when GA is announced (gru produces this)
- Dependencies: External -- Cloudflare product roadmap
- Timeline: Ongoing, check quarterly

---

### Risks and Concerns

1. **RFC 3161 TSA reliability risk.** FreeTSA has documented reliability issues and no SLA. Using a commercial TSA (DigiCert, GlobalSign) adds a cost but removes the reliability concern. Recommendation: start with a commercial TSA that offers a free tier or low-cost tier; FreeTSA as fallback only.

2. **MCP spec velocity risk.** MCP is evolving rapidly (2025-11-25 spec added Tasks, Streamable HTTP, OAuth). Building now means potentially adapting to spec changes. Mitigation: the WRL MCP server is thin enough (3 tools over REST) that spec changes have minimal impact. Use the stable core of MCP (tools + resources), not bleeding-edge features (Tasks, server discovery).

3. **CDP within Browser Rendering -- untested territory.** The spike (Task 3) may reveal that Cloudflare's sandboxed CDP environment blocks `Security` domain events or filters network details. If so, the certificate/timing capture path is blocked until Containers reach GA. This is an acceptable risk for a spike.

4. **eIDAS over-investment temptation.** The eIDAS narrative is compelling for positioning ("EU-compliant tamper-evident archival") but the implementation reality is: QTSPs are not ready, the ecosystem is forming, and WRL would be building against draft implementing acts. The risk is spending engineering time on compliance theater rather than product value. A standard RFC 3161 timestamp from DigiCert carries more practical evidentiary weight today than a promise of future eIDAS qualification.

5. **Capture fidelity scope creep.** Certificate info and network timing are forensic niceties, not core to WRL's value proposition. The risk is that pursuing these diverts focus from the items that actually move the product forward (list endpoint, MCP, timestamps, multi-tenancy). Contain capture fidelity work to a time-boxed spike, not an open-ended implementation.

---

### Additional Agents Needed

- **mcp-minion** -- Required for Task 2 (MCP server implementation). MCP server design and implementation is explicitly in mcp-minion's domain.
- **edge-minion** -- Required for Tasks 1 and 3 (TSA integration within Workers, CDP spike within Browser Rendering). Both tasks involve Cloudflare Worker internals and Browser Rendering platform constraints.
- **security-minion** -- Should review Task 1 (TSA integration touches the signing/verification chain, which is security-critical) and provide input on whether the CDP spike reveals any new attack surface.
- **legal/compliance specialist** (if available) -- The eIDAS and RFC 3161 decisions would benefit from someone who understands evidentiary standards in specific jurisdictions. If no legal specialist exists in the agent team, this is a gap that should be filled by human domain expertise, not agent speculation. Flag this to the human operator.
