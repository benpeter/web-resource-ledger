# Phase 2: Technology Landscape Assessment -- Gru

**Date:** 2026-03-13
**Role:** Technology Radar / Strategic Technology Assessment
**Scope:** Evaluate technology options for WRL MVP across four domains: archival format, cryptographic timestamping, capture engine, and immutable storage.

---

## TL;DR

| Domain | MVP Recommendation | Ring | Upgrade Path |
|--------|-------------------|------|-------------|
| Archive format | **WACZ** (WARC inside, ZIP container, SHA-256 manifest) | **Adopt** | Already the legal-grade format; add WACZ-Auth signing later |
| Timestamping | **SHA-256 content hash + RFC 3161 via FreeTSA** (no blockchain) | **Trial** | Upgrade to eIDAS qualified TSA for EU legal admissibility |
| Capture engine | **Cloudflare Browser Rendering** (Playwright binding) | **Trial** | Already production infrastructure; add Scoop-style WARC generation |
| Storage | **Cloudflare R2** with bucket locks + content-addressed naming | **Adopt** | Add S3 Object Lock (AWS) only if WORM compliance required by customer |

The simplest stack that does not close doors: capture via Cloudflare Browser Rendering, package as WACZ with SHA-256 hashes, timestamp the package hash via RFC 3161, store on R2 with bucket lock retention and content-addressed keys. Every layer is upgradeable to legal-admissibility grade without changing the capture format.

---

## (A) Web Archival Bundle Format

### Landscape

| Format | Standardization | JS Ecosystem | Legal Precedent | Self-Contained | Signing Spec |
|--------|----------------|-------------|----------------|---------------|-------------|
| **WARC** | ISO 28500:2017 | warcio.js (TypeScript, streaming) | Library of Congress, Internet Archive, court use via Wayback Machine | No (loose files) | None built-in |
| **MHTML** | RFC 2557 | Chromium save-as only | Minimal; browser-specific | Yes (single file) | None |
| **WACZ** | Webrecorder spec v1.1.1, LOC-recognized | warcio.js + Scoop (JS) | Harvard LIL Perma.cc, Starling Lab evidence work | Yes (ZIP with manifest) | WACZ-Auth 0.1.0 (RFC 3161 + domain cert) |
| **Custom JSON bundle** | None | Trivial to build | None | Depends | Must build from scratch |

### Assessment

**WACZ -- Adopt for MVP**

WACZ is the clear winner. It is a ZIP file containing WARC records, a CDXJ index, a pages manifest, and a `datapackage.json` with SHA-256 hashes of every file. This means:

1. **It is WARC-based**, so you get ISO 28500 compatibility for free. You are not choosing WACZ *instead of* WARC -- WACZ *contains* WARC.
2. **Self-contained and portable.** A single `.wacz` file is a complete, verifiable archive. No external dependencies to replay it.
3. **Built-in integrity.** The `datapackage.json` contains SHA-256 hashes of every resource. Verification is: unzip, recompute hashes, compare. No custom tooling needed.
4. **Signing spec exists.** WACZ-Auth 0.1.0 defines exactly how to add RFC 3161 timestamps and domain-ownership identity proofs. WRL does not need to invent a signing scheme.
5. **Legal-evidence pedigree.** Harvard Law's Library Innovation Lab built Scoop specifically for legal-evidence-grade web archiving, and it outputs WACZ. The Starling Lab (Stanford/USC) uses WACZ for authenticated web archives.
6. **JS tooling exists.** `warcio.js` (TypeScript, streaming, works in Node and browser) handles WARC record creation. Scoop is a JavaScript library and CLI for high-fidelity capture to WACZ.

**Why not MHTML?** Browser-specific, no integrity metadata, no signing support, limited court acceptance. Dead end.

**Why not custom?** Violates KISS. You would spend months building what WACZ already provides, and you would have zero legal precedent.

### MVP Implementation Path

For MVP, WRL does not need to implement the full WACZ-Auth signing spec. The minimum viable bundle is:

1. Capture HTML + screenshot + headers
2. Write WARC records using `warcio.js`
3. Package as WACZ (ZIP with `datapackage.json` containing SHA-256 hashes)
4. Store the SHA-256 hash of `datapackage.json` as the bundle's content fingerprint

This gives you tamper-evidence from day one. Signing (WACZ-Auth) layers on top without changing the format.

### Risks

- `warcio.js` is maintained by Webrecorder but is a small team. Contributor count is modest. However, the spec is simple enough that the library could be forked or reimplemented if abandoned.
- WACZ spec is at v1.1.1 -- stable but not ISO-standardized. The Library of Congress recognizing it is a strong signal.

---

## (B) Cryptographic Timestamping

### Landscape

| Approach | Legal Weight | Complexity | Cost | JS Ecosystem | Edge-Compatible |
|----------|-------------|-----------|------|-------------|----------------|
| **SHA-256 hash only** | Proves integrity, not time | Trivial | Free | Built-in Web Crypto | Yes |
| **RFC 3161 TSA** | eIDAS-recognized, court-admissible | Moderate | Free (FreeTSA) to ~$0.01/stamp (commercial) | Pure JS libs exist | Yes (Cloudflare Workers) |
| **Blockchain-anchored** (OpenTimestamps, Ethereum) | Novel, inconsistent court acceptance | High | Gas fees (variable) | Libraries exist | No (needs chain access) |
| **HMAC/internal signing** | Zero legal weight (self-attested) | Low | Free | Built-in | Yes |
| **eIDAS Qualified TSA** | Strongest in EU (legal presumption) | Moderate | ~EUR 0.01-0.10/stamp | Same RFC 3161 protocol | Yes |

### Assessment

**RFC 3161 via FreeTSA -- Trial for MVP**

The timestamping approach should be layered. For MVP:

**Layer 1 (ship immediately): SHA-256 content hash.**
Every WACZ bundle already includes SHA-256 hashes in `datapackage.json`. Computing a hash of `datapackage.json` itself gives you a single fingerprint for the entire capture. This is free, instant, and proves content integrity. Store this hash in the WRL database alongside the capture metadata.

**Layer 2 (MVP target): RFC 3161 timestamp of that hash.**
After computing the content hash, submit it to an RFC 3161 Timestamp Authority. The TSA returns a signed timestamp token proving the hash existed at a specific time. This is the minimum for "cryptographic proof of capture time."

Why RFC 3161 specifically:

1. **Pure JS implementation exists.** The `pdf-rfc3161` library runs in Cloudflare Workers with zero native dependencies. The `@xevolab/timestamping-token` package provides full TypeScript RFC 3161 request/response handling. These are not wrappers around OpenSSL -- they are pure Web Crypto implementations.
2. **Free TSA servers are production-viable.** FreeTSA.org has been operational for years, recently updated its certificate (valid through 2040, P-384 ECC), and serves millions of requests. DigiCert and Sectigo also offer free RFC 3161 endpoints.
3. **eIDAS upgrade path is protocol-identical.** Moving from FreeTSA to a Qualified TSA (e.g., qtsa.eu, ANF AC, GlobalTrust) is a URL change. The protocol is the same. The legal weight goes from "trusted third party" to "EU-wide legal presumption of validity."
4. **WACZ-Auth already specifies RFC 3161.** The WACZ signing spec uses RFC 3161 timestamps. By building on RFC 3161 now, WRL aligns with the format's own signing roadmap.

**Why not blockchain?** Violates KISS and Lean. Blockchain timestamping adds complexity (chain access, confirmation times, gas fees) for marginal legal benefit. Courts are familiar with trusted timestamps; blockchain evidence is novel and inconsistently accepted. The 5th Circuit's skepticism of Wayback Machine evidence (even with established provenance) shows that courts value familiar authentication methods.

**Why not HMAC/internal signing?** Zero legal weight. A self-signed timestamp proves nothing to a third party. WRL's entire value prop is third-party verifiability.

### MVP Implementation Path

```
Capture content
  --> Generate WACZ with SHA-256 hashes
    --> Compute SHA-256 of datapackage.json
      --> Submit hash to FreeTSA via RFC 3161
        --> Store timestamp token alongside WACZ in R2
          --> Verification: recompute hash, validate against timestamp token
```

The timestamp token (a signed ASN.1 structure) is stored as a separate file alongside the WACZ bundle. Verification does not require contacting the TSA -- the token is self-contained and verifiable against the TSA's public certificate.

### Risks

- FreeTSA is a free service with no SLA. For production, use multiple TSAs for redundancy (the WACZ-Auth spec supports this).
- RFC 3161 token verification requires ASN.1 parsing. The JS libraries handle this, but it is more complex than simple hash comparison.
- Re-evaluation trigger: if a paying customer requires eIDAS Qualified timestamps, switch to a commercial Qualified TSA. Budget ~EUR 0.05/stamp.

---

## (C) Headless Browser Capture Engine

### Landscape

| Engine | Language | Edge-Compatible | WARC Output | Screenshot | Managed Infra | Cost (MVP) |
|--------|---------|----------------|-------------|-----------|--------------|-----------|
| **Cloudflare Browser Rendering** | JS (Playwright binding) | Native | No (must build) | Yes (REST API) | Yes | Free tier: 10 min/day; Paid: 10 hr/mo free, then $0.09/hr |
| **Playwright (self-hosted)** | JS/TS | No | No (must build) | Yes | No | Server cost |
| **Puppeteer (self-hosted)** | JS | No | No (must build) | Yes | No | Server cost |
| **Scoop (Harvard LIL)** | JS (Node.js + Playwright) | No | Yes (WACZ native) | Yes | No | Server cost |
| **Browsertrix Crawler** | JS (Docker) | No | Yes (WACZ native) | Yes | No | Container cost |

### Assessment

**Cloudflare Browser Rendering -- Trial for MVP**

This is the most interesting option given the technology bias toward Cloudflare infrastructure and the Helix Manifesto's "Lean and Mean" principle.

**What it provides:**
- Managed Playwright on Cloudflare's edge network. No browser infrastructure to provision.
- REST API for screenshots (`/screenshot`) and HTML snapshots (`/snapshot`) -- the two most basic capture artifacts.
- Playwright Workers Binding for full programmatic browser control when REST is insufficient.
- Free tier (10 hours/month on paid Workers plan) is sufficient for MVP validation.
- Global edge deployment means captures happen close to the target, reducing latency.

**What it does NOT provide:**
- WARC record generation. Cloudflare Browser Rendering gives you the page content and screenshot, but you must construct the WARC records yourself using `warcio.js`.
- HTTP response header capture in the REST API. The screenshot and snapshot endpoints return rendered content, not raw HTTP exchanges. For full-fidelity archiving, you need the Workers Binding to intercept network traffic.
- The deep "witnessing" guarantees that Scoop provides (proxy-based capture of unmodified HTTP exchanges).

**Why not Scoop for MVP?**
Scoop is the gold standard for legal-evidence web archiving. Harvard LIL built it specifically for this purpose. However:
1. It requires a server running Node.js + Chromium. This is infrastructure WRL does not need for MVP.
2. It is optimized for maximum fidelity (proxy-based interception of raw HTTP). MVP needs "good enough" fidelity.
3. It can be adopted later as the capture engine when legal-admissibility requirements tighten.

**The pragmatic MVP approach:**

Use Cloudflare Browser Rendering for capture, construct WACZ bundles from the outputs:

1. **Screenshot:** Cloudflare `/screenshot` REST API (PNG, full page)
2. **HTML snapshot:** Cloudflare `/snapshot` REST API (rendered DOM)
3. **HTTP headers:** Fetch the URL separately via Workers `fetch()` to capture response headers
4. **WARC packaging:** Use `warcio.js` to write WARC records from captured artifacts
5. **WACZ assembly:** ZIP the WARC + index + manifest into WACZ format

This is not as forensically rigorous as Scoop's proxy-based capture, but it produces a valid, verifiable WACZ bundle. The upgrade path to Scoop (or a Scoop-like approach using the Playwright Workers Binding for proxy interception) does not require changing the output format.

### Capture Fidelity Trade-offs

| Aspect | Cloudflare BR (MVP) | Scoop (future) |
|--------|-------------------|---------------|
| Screenshot | Full page, configurable viewport | Full page, configurable |
| HTML | Rendered DOM (post-JS execution) | Rendered DOM |
| HTTP headers | Separate fetch (may differ from render) | Proxy-captured (exact match) |
| Sub-resources | Not captured individually | Every CSS/JS/image captured |
| Certificate info | Not captured | Can be captured |
| Network timing | Not captured | Captured |

For MVP, the "separate fetch for headers" gap is acceptable. The core value prop is "proof of what was published" -- the screenshot and rendered HTML provide this. Full HTTP exchange fidelity is a post-MVP enhancement.

### Risks

- Cloudflare Browser Rendering is a relatively new service. Pricing changed in mid-2025. Monitor for further pricing or limit changes.
- The REST API has rate limits (10 req/sec on paid plans). Bulk capture scenarios need throttling.
- The gap between "rendered DOM capture" and "forensic HTTP exchange capture" could matter for legal use cases. Document this limitation clearly.
- Re-evaluation trigger: when a customer requires forensic-grade capture (e.g., for litigation), evaluate Scoop integration or building a proxy-based capture pipeline on the Playwright Workers Binding.

---

## (D) Immutable Storage Backend

### Landscape

| Backend | Immutability Mechanism | WORM Compliance | JS SDK | Edge Integration | Egress Cost | MVP Cost |
|---------|----------------------|----------------|--------|-----------------|-------------|---------|
| **Cloudflare R2** | Bucket locks (retention rules) | No formal WORM | S3-compatible + Workers binding | Native | $0 | Free tier: 10 GB storage, 10M reads/mo |
| **AWS S3** | Object Lock (Governance + Compliance modes) | SEC 17a-4 assessed | aws-sdk | Via API | $0.09/GB | Pay-as-you-go |
| **Backblaze B2** | Object Lock (S3-compatible) | Cohasset-assessed for SEC 17a-4 | S3-compatible | Via API | Free via Cloudflare Bandwidth Alliance | $0.006/GB/mo |
| **Content-addressed file system** | Hash-based naming (immutable by convention) | No | Custom | Any | Varies | Varies |

### Assessment

**Cloudflare R2 with content-addressed naming -- Adopt for MVP**

R2 is the right choice for MVP given the Cloudflare platform alignment and zero-egress pricing. The immutability strategy is layered:

**Layer 1: Content-addressed object keys.**
Name every stored object by its content hash: `captures/{sha256-of-wacz}.wacz`. This makes objects immutable by convention -- overwriting an object would change its hash, which would change its key, so it would be a different object. This is the simplest form of immutability and requires zero platform features.

**Layer 2: R2 bucket locks.**
Apply a retention rule to the captures bucket: objects cannot be deleted for N days/months/indefinitely. This prevents accidental or malicious deletion. R2 bucket locks support up to 1,000 rules and can be scoped by prefix.

**Layer 3 (future): S3 Object Lock on AWS for regulated customers.**
If a customer requires SEC 17a-4 or FINRA WORM compliance, add an S3 bucket with Object Lock as a secondary storage target. The capture format (WACZ) and naming convention (content-addressed) are identical -- only the storage backend changes.

**Why R2 over S3 for MVP?**

1. **Zero egress fees.** WRL's verification endpoint serves capture data to third parties. Egress is a core product cost, not an edge case. R2's zero-egress model makes the business economics predictable.
2. **Native Workers integration.** R2 bindings in Workers provide direct access without going through the S3 API. This means capture storage and verification can run entirely on Cloudflare's edge.
3. **Free tier is generous.** 10 GB storage, 1 million Class A (write) operations, 10 million Class B (read) operations per month. Sufficient for MVP validation.
4. **Bucket locks are adequate for MVP immutability.** Not WORM-certified, but combined with content-addressed naming, they provide practical immutability. The gap is regulatory certification, not technical capability.

**Why content-addressed naming matters:**

The object key scheme should be:
```
captures/{tenant-id}/{sha256-of-wacz-file}.wacz
captures/{tenant-id}/{sha256-of-wacz-file}.wacz.tsr   (RFC 3161 timestamp token)
```

This provides:
- **Deduplication by default.** Same content = same hash = same key.
- **Verification without metadata lookup.** Given a WACZ file, anyone can compute its hash and check if the stored object matches.
- **Immutability by construction.** You cannot modify an object without changing its hash, which changes its key.

### Verification Endpoint Architecture

The public verification endpoint (WRL's core value prop) can be a Cloudflare Worker that:

1. Accepts a capture ID or hash
2. Reads the WACZ from R2 (zero-egress, in-network)
3. Reads the RFC 3161 timestamp token from R2
4. Returns verification status: content hash matches, timestamp is valid, TSA signature checks out

This runs entirely on Cloudflare's edge with sub-300ms latency for uncached requests (meeting the Helix Manifesto latency target).

### Risks

- R2 bucket locks are not WORM-certified. If a customer in a regulated industry (financial services, healthcare) requires certified immutable storage, R2 is insufficient. Plan for S3 Object Lock as an add-on.
- R2 does not support object-level locks, only bucket-level retention rules. All objects in a prefix share the same retention policy.
- Re-evaluation trigger: first enterprise customer with regulatory immutability requirements.

---

## Cross-Cutting Concerns

### Technology Stack Summary for MVP

```
Capture:      Cloudflare Browser Rendering (Playwright)
                |
                v
Packaging:    warcio.js --> WACZ (ZIP with WARC + SHA-256 manifest)
                |
                v
Timestamping: SHA-256 hash of datapackage.json --> FreeTSA (RFC 3161)
                |
                v
Storage:      Cloudflare R2 (content-addressed keys + bucket locks)
                |
                v
Verification: Cloudflare Worker (recompute hash, validate RFC 3161 token)
```

### Edge-First Architecture Alignment

This stack runs entirely on Cloudflare's edge platform:
- **Workers** for API, orchestration, and verification logic
- **Browser Rendering** for headless capture
- **R2** for artifact storage
- **D1** (SQLite) for capture metadata and tenant data (optional; could use KV for MVP)

This aligns with the Helix/Franklin architecture pattern: edge-first, minimal backend, content stored as flat files (WACZ bundles), metadata separate from content.

### What This Stack Cannot Do (Known Gaps)

1. **Full HTTP exchange capture.** The Cloudflare BR REST API does not capture raw HTTP exchanges as Scoop does. Rendered DOM + separate header fetch is the MVP compromise.
2. **Sub-resource archiving.** CSS, JS, images referenced by the page are not individually captured in MVP. The WACZ will contain the rendered HTML and screenshot but not a complete resource manifest. This limits offline replay fidelity.
3. **eIDAS Qualified timestamps.** FreeTSA is not a Qualified TSP under eIDAS. The timestamp is cryptographically valid but does not carry the EU legal presumption. Upgrade requires switching TSA URL only.
4. **WORM-certified storage.** R2 bucket locks are not SEC 17a-4 or FINRA assessed. Upgrade requires adding S3 Object Lock as secondary storage.

### Specialist Input Needed

- **security-minion**: Review the RFC 3161 timestamping chain for the verification endpoint. Specifically: how does the Worker validate the TSA's certificate chain? Should WRL pin TSA certificates or trust a root store?
- **api-design-minion**: Design the public verification API. Key question: does the endpoint return a yes/no attestation, or does it return the full proof (hash + timestamp token) for the verifier to check independently?
- **mcp-minion**: The PRODUCT.md lists MCP as a trigger method. Evaluate whether the capture API should be exposed as an MCP tool from day one or deferred post-MVP.

### Regulatory Timeline Awareness

The EU AI Act August 2026 enforcement date is not directly relevant to WRL (this is not an AI system). However, the eIDAS 2.0 rollout (completing end of 2026) *is* relevant: it strengthens the legal framework for qualified timestamps across EU member states. If WRL targets European customers, upgrading to a Qualified TSA before eIDAS 2.0 full enforcement would be strategic.

---

## Decision Matrix: Simplest Viable vs. Legal-Grade

| Component | MVP (Simplest Viable) | Legal-Admissibility Grade | Upgrade Cost |
|-----------|----------------------|--------------------------|-------------|
| **Format** | WACZ with SHA-256 hashes | Same format + WACZ-Auth signing | Add signing step; format unchanged |
| **Timestamp** | FreeTSA (RFC 3161) | eIDAS Qualified TSA | Change TSA URL + pay per stamp |
| **Capture** | Cloudflare BR REST API | Scoop or proxy-based Playwright capture | New capture engine; output format unchanged |
| **Storage** | R2 + bucket locks | S3 Object Lock (Compliance mode) | Add secondary storage target |
| **Identity** | None (anonymous hash) | Domain-ownership cert (WACZ-Auth) | Add domain cert signing step |

The critical design decision: **WACZ as the bundle format ensures that every upgrade is additive.** You add signing, you add better timestamps, you add fuller capture -- but you never rewrite the format. This is the "does not close the door" requirement satisfied.

---

## Sources

- [WARC format -- Library of Congress](https://www.loc.gov/preservation/digital/formats/fdd/fdd000236.shtml)
- [WACZ Specification v1.1.1](https://specs.webrecorder.net/wacz/1.1.1/)
- [WACZ Signing and Verification spec](https://specs.webrecorder.net/wacz-auth/0.1.0/)
- [WACZ -- Library of Congress format description](https://www.loc.gov/preservation/digital/formats/fdd/fdd000586.shtml)
- [Authenticated Web Archives: WACZ Files -- Starling Lab](https://dispatch.starlinglab.org/p/authenticated-web-archives-wacz-files)
- [Harvard LIL Scoop capture engine](https://github.com/harvard-lil/scoop)
- [warcio.js -- JS streaming WARC IO](https://github.com/webrecorder/warcio.js)
- [pdf-rfc3161 -- Pure JS RFC 3161 for Cloudflare Workers](https://github.com/mingulov/pdf-rfc3161)
- [@xevolab/timestamping-token -- TypeScript RFC 3161](https://github.com/Xevolab/timestamping-token)
- [FreeTSA.org](https://www.freetsa.org/index_en.php)
- [Free RFC 3161 server list](https://gist.github.com/Manouchehri/fd754e402d98430243455713efada710)
- [Cloudflare Browser Rendering docs](https://developers.cloudflare.com/browser-rendering/)
- [Cloudflare BR screenshot endpoint](https://developers.cloudflare.com/browser-rendering/rest-api/screenshot-endpoint/)
- [Cloudflare BR pricing](https://developers.cloudflare.com/browser-rendering/pricing/)
- [Cloudflare R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
- [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [WARC and WORM -- Hanzo / JD Supra](https://www.jdsupra.com/legalnews/warc-and-worm-digital-storage-web-53918/)
- [5th Circuit limits Wayback Machine evidence](https://wisblawg.law.wisc.edu/2022/05/03/5th-circuit-limits-use-of-wayback-machine-archived-content-without-additional-authentication/)
- [eIDAS Qualified Timestamps -- qtsa.eu](https://qtsa.eu/)
- [Sigstore Timestamp Authority](https://github.com/sigstore/timestamp-authority)
- [Renick -- legally secure web archiving](https://www.renick.io/en/blog/post/website-archiving-for-legally-secure-documentation-compliance-and-evidence-preservation)
- [Wacksy -- Rust WACZ library (Bodleian Library)](https://blogs.bodleian.ox.ac.uk/archivesandmanuscripts/2025/12/17/introducing-wacksy-a-library-for-writing-wacz-collections/)
