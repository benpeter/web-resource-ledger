## Domain Plan Contribution: product-marketing-minion

### Recommendations

#### 1. Competitor Research: Factual Assessment

Below is what I can verify from public sources. Where I could not confirm a capability, I say so explicitly. This data should drive both the comparison table and the feature list framing.

##### Wayback Machine (Internet Archive)

- **Integrity/signing**: None. No cryptographic signatures on captures. Integrity is based on institutional reputation.
- **Independent timestamps**: None in the RFC 3161 sense. Captures have metadata timestamps from the crawl, but no independent third-party temporal proof.
- **Public verification**: Anyone can access archived pages. No cryptographic verification -- "verification" is "trust that archive.org didn't alter it."
- **API access**: Yes. Save Page Now API (submit URLs), Availability API, CDX API (query captures), Memento API. Rate-limited (15 requests/minute since 2019).
- **Standard format**: WARC (ISO 28500). Not WACZ.
- **eIDAS support**: None.
- **Where they're strong**: Massive scale, free, institutional credibility accepted by some courts (US Patent Office accepts their timestamps as prior art evidence). Cultural authority. 850+ billion pages archived.
- **Honest WRL differentiation**: WRL provides cryptographic proof vs. institutional trust. However, Wayback Machine has massive brand recognition and acceptance as a reference that WRL lacks. For casual "I want to see what a page looked like," Wayback Machine wins on accessibility and cost. WRL wins when you need evidence that can be independently verified without trusting any institution.

##### PageFreezer

- **Integrity/signing**: SHA-256 hashing on archived records. Digital signatures (their docs say "PKCS#1 v1.5" in some materials). Each archived page gets a SHA-256 digital signature.
- **Independent timestamps**: Stratum-1 atomic clock synchronized timestamps. Described as "ESIGN Act compliant." Not RFC 3161 -- this is their own timestamping infrastructure, not an independent third-party TSA. (One source mentioned "RFC 3136 compliant" which appears to be a documentation error or a different standard.)
- **Public verification**: Not documented. Verification appears to be internal to their platform. No public verification endpoint for third parties.
- **API access**: Yes. REST API available to partners. Supports single URL and bulk capture (up to 100,000 URLs). Outputs signed searchable PDFs. Requires partner registration for API access.
- **Standard format**: PDF exports. CSV exports. eDiscovery-compatible formats. No WACZ support confirmed. The WebPreserver sub-product may support WACZ/WARC but this is not confirmed for the main archiving platform.
- **eIDAS support**: Not documented.
- **Where they're strong**: Enterprise-grade compliance (FedRAMP authorized, SOC 2). Social media archiving (Teams, Workplace, etc.) -- WRL doesn't do this. Bulk capture at scale. Established legal market presence.
- **Honest WRL differentiation**: WRL uses Ed25519 + RFC 3161 (independent third-party timestamps) vs. PageFreezer's SHA-256 + proprietary timestamps. WRL produces WACZ (open standard) vs. PageFreezer's PDF (proprietary output). WRL's verification is public; PageFreezer's appears platform-locked. However, PageFreezer has FedRAMP and broader enterprise compliance certifications WRL lacks.

##### Hanzo

- **Integrity/signing**: Proprietary integrity mechanisms. Chain of custody documentation. WARC format storage on WORM (immutable) storage. ISO 28500 compliant. No public documentation of cryptographic signing.
- **Independent timestamps**: Not documented publicly.
- **Public verification**: Not available. Verification is internal to their platform.
- **API access**: No API available (confirmed by multiple sources including GetApp and Capterra reviews).
- **Standard format**: WARC (ISO 28500). No WACZ.
- **eIDAS support**: Not documented.
- **Where they're strong**: Dynamic content capture (SPAs, interactive elements, personalized pages). SOC 2 Type 2 certified. Strong in eDiscovery workflows with legal hold and targeted collection. Enterprise customer base.
- **Honest WRL differentiation**: WRL has an API, open verification, cryptographic signing, and standard timestamps. Hanzo has superior dynamic content capture capabilities and deeper eDiscovery integration. WRL is developer-accessible; Hanzo is enterprise-sales-only.

##### Page Vault

- **Integrity/signing**: SHA-256 hashing, digital signatures, timestamps. Metadata includes precise timestamp, source URL, capturing account. Designed for FRE 901(b)(9) and 902(13)/902(14) admissibility.
- **Independent timestamps**: Timestamps are part of their capture process. Not confirmed as RFC 3161 independent timestamps -- appears to be internally generated.
- **Public verification**: Not a self-service verification endpoint. They provide expert witness testimony and affidavit services to authenticate captures in court.
- **API access**: No API available. The product is a browser extension and managed capture service, not a developer-accessible platform.
- **Standard format**: Proprietary format. PDF exports. No WACZ or WARC.
- **eIDAS support**: Not documented. US legal market focus (FRE-oriented).
- **Where they're strong**: Purpose-built for US litigation. Expert witness/affidavit service is a significant differentiator for court admissibility. Strong legal market brand. Social media capture with auto-scroll/auto-expand.
- **Honest WRL differentiation**: WRL provides machine-verifiable cryptographic proof; Page Vault provides human-verifiable expert testimony. Both target evidence use cases but from opposite ends: WRL is API-first and developer-accessible; Page Vault is point-and-click for legal professionals. Page Vault's expert witness service is something WRL cannot currently match.

##### MirrorWeb

- **Integrity/signing**: SHA-1 digital signatures on archived records (per their documentation). Tamper-evident WORM storage. SOC 2 certified.
- **Independent timestamps**: Timestamped records, but not confirmed as RFC 3161. Timestamps appear to be part of their archiving process.
- **Public verification**: Not documented. Platform-internal verification.
- **API access**: Yes, an API exists for integration with other systems. Limited public documentation on API capabilities.
- **Standard format**: WARC (ISO 28500).
- **eIDAS support**: Not documented specifically, though they serve EU clients and reference UK FCA compliance.
- **Where they're strong**: Financial services compliance (SEC 17a-4, FINRA 2210, FCA COBS 4). Multi-channel archiving (websites, social media, SMS, email). Dynamic content capture.
- **Honest WRL differentiation**: WRL uses Ed25519 + RFC 3161 vs. MirrorWeb's SHA-1 signatures (SHA-1 is cryptographically deprecated). WRL has public verification; MirrorWeb is platform-locked. Note: MirrorWeb's SHA-1 usage is a genuine weakness, but be careful stating this -- they may have upgraded without updating all their public docs.

##### Stillio

- **Integrity/signing**: None documented. Screenshots with timestamp metadata only.
- **Independent timestamps**: None. Internal timestamps only.
- **Public verification**: None.
- **API access**: Yes, basic API available. Zapier integration. Limited compared to a full REST API.
- **Standard format**: PNG/JPEG screenshots. No WACZ, no WARC.
- **eIDAS support**: None.
- **Where they're strong**: Simple, affordable screenshot scheduling. Good for visual monitoring and brand tracking. Easy setup for non-technical users. $29/month starting price.
- **Honest WRL differentiation**: Completely different categories. Stillio is a screenshot tool; WRL is an evidence tool. Stillio captures images with no integrity proof. Including Stillio in comparison mainly illustrates the gap between "screenshot services" and "evidence services."

##### Archive-It (Internet Archive subscription service)

- **Integrity/signing**: No cryptographic signing. Integrity via checksums (MD5 and SHA-1 via WASAPI). Institutional credibility of Internet Archive.
- **Independent timestamps**: No RFC 3161. Crawl timestamps from the archiving process.
- **Public verification**: Archives are publicly accessible. Checksum verification available via WASAPI for data integrity (not cryptographic authenticity).
- **API access**: Yes. WASAPI (Web Archiving Systems API) for downloading WARC files with metadata. CDX/C API for querying captures.
- **Standard format**: WARC (ISO 28500).
- **eIDAS support**: None.
- **Where they're strong**: Library/institution-grade archiving. Cultural heritage preservation. Strong in academic and government sectors. Part of the Internet Archive ecosystem.
- **Honest WRL differentiation**: WRL adds cryptographic signing and independent timestamps on top of a similar capture-and-archive workflow. Archive-It is focused on preservation; WRL is focused on evidence. Archive-It serves institutions; WRL serves developers and legal professionals.

##### Webrecorder (Browsertrix / ArchiveWeb.page)

- **Integrity/signing**: The WACZ-Auth specification (authored by Webrecorder) defines signing for WACZ files using ECDSA with domain-name identity and optional RFC 3161 timestamps via FreeTSA. This is a *specification* -- actual implementation status in production tools varies. The `authsign` library and `py-wacz` CLI support signing. Browsertrix (the hosted service) does not appear to sign WACZ files by default.
- **Independent timestamps**: The WACZ-Auth spec supports RFC 3161 via FreeTSA. Implementation in hosted Browsertrix: not confirmed as default behavior.
- **Public verification**: Tools exist for verification (validator tools). Not a hosted public verification endpoint like WRL's.
- **API access**: Browsertrix has an API for managing crawls, scheduling, and downloading archives. Self-hostable via Kubernetes.
- **Standard format**: WACZ (they created the format). Also WARC.
- **eIDAS support**: Not documented.
- **Where they're strong**: They *invented* WACZ. High-fidelity browser-based capture. Open source. Strong in digital preservation community. Self-hostable. Active in government web archiving (End of Term Web Archive). ArchiveWeb.page browser extension for manual capture.
- **Honest WRL differentiation**: WRL provides server-side signing + RFC 3161 timestamps + a hosted verification endpoint as default behavior on every capture. Webrecorder has the specification for this but does not appear to enable it by default on their hosted service. WRL is API-first (single call = signed evidence bundle); Webrecorder is crawl-oriented (multi-page site archiving). Different primary use cases: WRL = point-in-time evidence of a specific URL; Webrecorder = comprehensive site preservation. **Important caveat**: Webrecorder authored the WACZ-Auth spec that WRL effectively implements. Acknowledging this lineage builds credibility.

##### Manual Screenshots + Notarization

- **Integrity/signing**: Notary attestation (legally strong in many jurisdictions).
- **Independent timestamps**: Notary timestamp (accepted by courts).
- **Public verification**: Notary records can be verified through notary databases.
- **API access**: None. Entirely manual.
- **Standard format**: None. Typically PDF or image files with notary stamp.
- **eIDAS support**: Notarization has its own EU legal framework, separate from eIDAS electronic timestamps.
- **Where it's strong**: Legally established. Notary attestation is broadly accepted by courts. No technical knowledge required.
- **Honest WRL differentiation**: WRL is 1000x faster, scalable, and cheaper. But notarization has centuries of legal precedent. WRL's cryptographic proof is technically superior but legally less tested.

#### 2. Genuine WRL Differentiators (What No Competitor Matches)

Based on the research, these are WRL's genuine unique differentiators -- capabilities where no competitor in this set matches WRL:

1. **Ed25519 signing on every capture by default** -- PageFreezer and MirrorWeb sign, but with older algorithms (PKCS#1, SHA-1). Webrecorder has a spec but doesn't sign by default on their hosted service.
2. **RFC 3161 independent timestamps on every capture by default** -- No competitor does this as a standard feature. PageFreezer uses proprietary atomic clock timestamps. Webrecorder's spec supports it but it's not default behavior.
3. **Public verification endpoint (no account needed)** -- No competitor offers this. Every other service requires you to trust their platform for verification.
4. **eIDAS-qualified timestamp option** -- No competitor offers this. This is a clear EU market differentiator.
5. **WACZ as the default output format** -- Only Webrecorder also uses WACZ (they invented it). Every other competitor uses WARC, PDF, or proprietary formats.
6. **MCP server for AI agent integration** -- Zero competitors occupy this niche.
7. **Open source, self-hostable** -- Webrecorder/Browsertrix is also open source and self-hostable. But WRL combines open source with all the above signing/timestamp/verification features.
8. **Single API call = complete signed evidence bundle** -- No competitor produces a signed, timestamped, verifiable evidence package from a single API call.

#### 3. Where Competitors Are Genuinely Stronger Than WRL

Honesty here builds credibility. The comparison table should NOT hide these:

- **Scale**: Wayback Machine has 850B+ pages. WRL is a new service.
- **Social media archiving**: PageFreezer, Hanzo, MirrorWeb archive Teams, Slack, social platforms. WRL captures web pages only.
- **Dynamic content**: Hanzo's "Dynamic Capture Technology" handles SPAs, interactive elements, personalized pages better than a standard headless browser capture.
- **Enterprise compliance certs**: PageFreezer (FedRAMP), Hanzo (SOC 2 Type 2), MirrorWeb (SOC 2) -- WRL has none of these.
- **Legal services**: Page Vault's expert witness/affidavit service is a differentiated offering WRL cannot match.
- **Site-wide archiving**: Webrecorder/Browsertrix and Archive-It are built for crawling entire sites. WRL captures one URL at a time.
- **Legal track record**: Wayback Machine and Page Vault have actual court case history. WRL has none.

#### 4. Feature List Structure and Messaging

**Two audiences, one page, two visual treatments.**

The feature list should serve both the non-technical buyer ("what does this prove?") and the developer ("what can I build with this?"). These are different decision-making frames:

- **Non-technical (legal, compliance)**: Cares about *trust outcomes* -- "Is this admissible?", "Can my auditor verify this?", "Does this meet EU standards?"
- **Developer/technical**: Cares about *integration capabilities* -- "Can I automate this?", "What format do I get back?", "Can I self-host?"

**Proposed structure (landing page):**

**Section title**: "What You Get" (concrete, outcome-oriented, not "Features")

**Category 1: Evidence Integrity** (for the legal/compliance buyer)
These map to the job "I need proof that will hold up."

1. **Ed25519 Digital Signatures** -- Every capture is cryptographically signed. Proves who captured it and that nothing was altered.
2. **RFC 3161 Independent Timestamps** -- A third-party authority records when the capture happened. No one -- not even WRL -- can backdate it.
3. **Public Verification** -- Share a link. Anyone can confirm authenticity. No account, no trust in you required.
4. **eIDAS Qualified Timestamps** -- Optional EU-standard timestamps with legal presumption of accuracy across all member states.

**Category 2: Developer Experience** (for the builder)
These map to the job "I need to integrate this into my workflow."

5. **REST API** -- One POST, one signed evidence bundle. Batch captures, webhooks, scheduled captures.
6. **MCP Server** -- Your AI agents can capture and verify web pages with cryptographic proof.
7. **WACZ Standard Format** -- Open archive format used by Harvard, Library of Congress, Starling Lab. Not locked to any vendor.
8. **Self-Hostable** -- Deploy on your infrastructure. Your keys, your storage, your evidence chain.

This gives 8 items total (matching ux-strategy-minion's 6-8 recommendation), with a clean split between trust-oriented and capability-oriented messaging.

**Ordering rationale**: Evidence Integrity first because it answers the "why should I care?" question. Developer Experience second because it answers "how do I use it?" The legal/compliance buyer stops at category 1 and is already interested. The developer scans both and sees the integration story.

**Docs site feature list**: Expand each of the 8 items with 2-3 sentences of technical detail. Add items that don't belong on the landing page: cookie consent dismissal (dual screenshots), HTTP header capture, FRE 902(13) certification PDF, CLI verification tool, threat screening, audit logging.

#### 5. Comparison Table Column Structure

**Landing page (summary):** 4 columns, 4 competitors.

Columns:
1. **Cryptographic Signing** (the core differentiator)
2. **Independent Timestamps** (second core differentiator)
3. **Public Verification** (third core differentiator)
4. **Open Standard Format** (WACZ/WARC -- tangible, verifiable)

Competitors (selected for recognition and contrast):
1. **Wayback Machine** -- everyone knows it; illustrates the "trust institution vs. trust math" gap
2. **PageFreezer** -- the closest enterprise competitor; shows WRL's technical edge
3. **Webrecorder** -- the closest technical competitor; shows WRL's API-first and default-signing advantage
4. **Manual screenshots** -- the most common alternative in practice; makes the automation case

This 4x4 matrix (plus WRL row = 5 rows) fits on a mobile screen and communicates the core story: WRL is the only service that signs, timestamps independently, verifies publicly, and outputs an open standard -- all by default.

**Docs site (full):** 7 columns, 10 competitors.

Columns:
1. **Cryptographic Signing** -- algorithm and approach
2. **Independent Timestamps** -- RFC 3161 or equivalent
3. **Public Verification** -- anyone can verify without account
4. **API Access** -- REST API, developer-accessible
5. **Standard Format** -- WACZ, WARC, PDF, proprietary
6. **eIDAS Qualified Timestamps** -- EU legal standard
7. **Open Source / Self-Hostable** -- deployment control

Competitors (all 9 from the task + "Build it yourself" and "Do nothing"):
Wayback Machine, PageFreezer, Hanzo, Page Vault, MirrorWeb, Stillio, Archive-It, Webrecorder, Manual screenshots + notarization

Each cell: checkmark, cross, partial indicator, or 2-3 word descriptor. No prose in cells.

**Notes section**: One paragraph per competitor explaining nuances. This is where honesty lives -- "PageFreezer uses SHA-256 signing with their own timestamping infrastructure, which is compliant with the ESIGN Act but does not use an independent third-party TSA per RFC 3161." Link to sources.

#### 6. Comparison Table Content: Cell-Level Recommendations

I'll provide the recommended cell content for each competitor across the 7 docs-site columns. Use checkmarks, crosses, and short descriptors.

**Legend:**
- Full = fully supported as a default feature
- Partial = supported with caveats
- No = not supported
- N/A = not applicable

| | Crypto Signing | Independent Timestamps | Public Verification | API Access | Standard Format | eIDAS Qualified | Open Source |
|---|---|---|---|---|---|---|---|
| **WRL** | Ed25519 (every capture) | RFC 3161 (DigiCert TSA) | Yes (no account needed) | REST API, MCP | WACZ | Optional | Apache 2.0 |
| **Wayback Machine** | No | No (crawl timestamps only) | Public access (no crypto verification) | Yes (rate-limited) | WARC | No | Partial (some tools) |
| **PageFreezer** | SHA-256 + PKCS#1 | Stratum-1 clock (not RFC 3161) | No (platform-only) | Yes (partner API) | PDF | No | No |
| **Hanzo** | Not documented | Not documented | No | No | WARC | No | No |
| **Page Vault** | SHA-256 hashing | Internal timestamps | No (expert witness service) | No | Proprietary/PDF | No | No |
| **MirrorWeb** | SHA-1 signatures | Timestamped (not RFC 3161) | No (platform-only) | Limited API | WARC | No | No |
| **Stillio** | No | No (metadata only) | No | Basic API | PNG/JPEG | No | No |
| **Archive-It** | No (checksums only) | No (crawl timestamps) | Public access (no crypto) | Yes (WASAPI) | WARC | No | No |
| **Webrecorder** | WACZ-Auth spec (not default) | RFC 3161 in spec (not default) | Validator tools exist | Yes (Browsertrix API) | WACZ + WARC | No | Yes |
| **Manual + Notary** | Notary attestation | Notary timestamp | Via notary records | No | N/A | Separate framework | N/A |

**Important accuracy notes for the implementing agent:**

- PageFreezer: I found references to both "SHA-256 digital signature" and "PKCS#1 v1.5" in their materials. The existing competitive analysis doc says "PKCS#1 v1.5." I cannot confirm whether they use both or one. The safest cell content is "SHA-256 signing" without specifying the algorithm further.
- MirrorWeb: Their docs mention "SHA1 digital signature" but this may be outdated. SHA-1 is cryptographically deprecated. Consider softening to "Digital signatures (SHA-1 per docs)" with a note that this may have been updated.
- Webrecorder: The WACZ-Auth spec supports signing, but whether Browsertrix (hosted) enables it by default is unclear from public docs. The cell should reflect the spec vs. default behavior distinction.
- Hanzo: Multiple sources confirm "no API available." Their integrity approach is proprietary and not publicly documented. Cells should reflect this honestly.

#### 7. Feature Messaging Vocabulary

For the landing page, use the language each audience actually uses:

**For legal/compliance buyers:**
- "evidence" not "data"
- "proof" not "verification"
- "tamper-evident" not "signed"
- "independently verifiable" not "open source"
- "third-party timestamp authority" not "RFC 3161"
- Reference FRE 901(b)(9), FRE 902(13)/902(14), eIDAS Art. 41(2) -- these are the standards their work revolves around

**For developers:**
- "Ed25519" not "digital signatures"
- "RFC 3161" not "independent timestamps"
- "WACZ" not "evidence bundle"
- "REST API" / "MCP server" -- specific protocol names
- "self-host" / "Apache 2.0" -- deployment and licensing specifics
- "one POST = signed bundle" -- the integration story in one phrase

The landing page feature list should lean toward the legal/compliance vocabulary (broader audience, less technical, higher emotional resonance) with the developer subsection switching to precise technical terms. The docs site uses full technical vocabulary throughout.

### Proposed Tasks

1. **Draft landing page feature list copy** -- 8 items in 2 categories ("Evidence Integrity" + "Developer Experience"). Each item: heading + one sentence. Total word budget: ~120 words. Heading for the section: "What You Get." This is content work, not implementation.

2. **Draft landing page comparison summary** -- 4x4 matrix (WRL + 4 competitors, 4 columns). Determine exact cell content using checkmarks/crosses/short descriptors. Write intro sentence and link to full comparison. Total word budget: ~80 words (excluding table cells).

3. **Draft docs site comparison page content** -- Full 7-column, 10-row matrix. Per-competitor notes section (3-5 sentences each). Methodology note with verification date. This produces the raw content that gets placed into `site/content/compare.md`.

4. **Draft docs site expanded feature list** -- Expand each of the 8 landing-page items with 2-3 sentences of technical detail. Add secondary features (cookie consent, HTTP headers, FRE certification PDF, CLI verification, threat screening). This either lives on the compare page or as a standalone section.

5. **Fact-check competitor claims before implementation** -- Every cell in the comparison table that I flagged with uncertainty (PageFreezer signing algorithm, MirrorWeb SHA-1 status, Webrecorder default signing behavior) should be verified by checking their current public documentation or testing their product. Flag any cell that cannot be verified with a footnote saying so.

6. **Implement landing page HTML/CSS** -- Place feature list section and comparison summary in the page per ux-strategy-minion's placement recommendations. This is frontend-minion's task, consuming the content from tasks 1-2.

7. **Implement docs site compare page** -- Create `site/content/compare.md` consuming content from tasks 3-4. Add nav entry per software-docs-minion's recommendations.

### Risks and Concerns

**Competitor accuracy is the highest-stakes risk.** Every claim about a competitor is verifiable by that competitor, their customers, and journalists. One factual error undermines the entire comparison. Specific concerns:

- **PageFreezer's signing approach**: Multiple conflicting descriptions in their own materials. The comparison should state what their public docs claim and note the ambiguity rather than asserting a specific implementation.
- **MirrorWeb's SHA-1**: If they've upgraded and we list SHA-1, we look uninformed. If they haven't and we omit it, we miss a genuine differentiator. Recommend noting "per their current public documentation" with a date.
- **Webrecorder's WACZ-Auth**: WRL effectively implements a specification that Webrecorder authored. The comparison must acknowledge this lineage respectfully. "WRL implements WACZ signing as a default on every capture; Webrecorder authored the specification and provides tooling for it" is honest framing. Claiming WRL "invented" this approach when it builds on Webrecorder's spec would be dishonest and would be caught by the web archiving community instantly.
- **Hanzo confusion**: "Hanzo" (hanzo.co) the web archiving company is distinct from "Hanzo AI" (hanzo.ai) the AI platform. Search results conflate these. All claims must reference hanzo.co specifically.

**Staleness**: Competitor features change. The docs page needs a "Last verified: YYYY-MM-DD" date and an invitation to report inaccuracies via GitHub issues. This is not optional -- it's the primary credibility signal for developer audiences.

**"Build it yourself" and "Do nothing" are the real competitors.** The comparison table focuses on named products, but the most common alternatives in practice are (a) writing a quick headless Chrome script and dumping to S3, and (b) not archiving at all. The feature list messaging should address these: "What you'd have to build yourself: signing infrastructure, timestamp integration, verification UI, standard format packaging, key management..."

**Tone risk**: The comparison must be factual, not dismissive. "No cryptographic signing" is a fact. "Lacks real security" is an opinion. Every cell should state what the competitor does, not what they lack. "Checksums only" is better than "No real integrity."

### Additional Agents Needed

- **frontend-minion**: To implement the comparison table HTML/CSS with responsive behavior. The 4x4 landing summary and 7x10 docs table have very different responsive requirements.
- **seo-minion**: To handle structured data updates (the existing `featureList` in the SoftwareApplication schema needs updating) and ensure the landing/docs split doesn't create duplicate content issues.
- **ux-design-minion**: To review visual treatment of feature list (lightweight list vs. cards) and comparison table (badge colors, checkmark/cross styling) against the existing design system.
