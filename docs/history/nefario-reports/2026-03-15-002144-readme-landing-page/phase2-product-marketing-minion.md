# Domain Plan Contribution: product-marketing-minion

## Recommendations

### Positioning Statement (2-3 sentences)

After running the Dunford positioning analysis against the actual codebase and competitive landscape, here is my recommended positioning statement for the README opening:

> **Web Resource Ledger captures web pages and seals them in cryptographically signed WACZ bundles -- so you can prove what was online, and when.** Submit a URL, get back a screenshot, rendered HTML, HTTP headers, and an Ed25519-signed archive that anyone can verify without an account. Deploy it on your own Cloudflare Workers; your captures, your keys, your infrastructure.

**Rationale for each sentence:**

1. **Sentence 1 (what + why):** "Captures web pages and seals them in cryptographically signed WACZ bundles" is the functional job. "Prove what was online, and when" is the emotional/social job -- the reason anyone cares. This sentence works for all three audiences: compliance developers recognize the proof-of-state pattern, archival tool evaluators see the WACZ standard, GitHub browsers get an immediate mental model.

2. **Sentence 2 (how it works in concrete terms):** Developers scanning a README need to know what they actually get. "Screenshot, rendered HTML, HTTP headers, and an Ed25519-signed archive" is specific and verifiable. "Anyone can verify without an account" is the core differentiator -- public, trustless verification. This sentence doubles as a feature summary without reading like a feature list.

3. **Sentence 3 (self-hosted positioning):** This is WRL's most important differentiation against the competitive field. Every major alternative (ProofSnap, WebPreserver, Stillio, Page Vault, MirrorWeb) is a SaaS platform where the vendor controls the signing keys and infrastructure. WRL is the self-hosted, open-source alternative. "Your captures, your keys, your infrastructure" speaks directly to the trust model -- you are the signer, not a third-party service.

### Positioning Analysis

**Competitive alternatives (what developers use today if WRL does not exist):**

| Alternative | What it is | WRL differentiator |
|---|---|---|
| Webrecorder / Browsertrix | Open-source crawling + WACZ bundles | No signing, no verification endpoint, no API-first design, requires significant infrastructure |
| Scoop (Harvard LIL) | High-fidelity WARC/WACZ via Playwright | CLI tool, not a deployable service; no built-in verification endpoint; no signing |
| ProofSnap / GetProofAnchor | SaaS with blockchain timestamps | Closed source, vendor-controlled keys, vendor lock-in, subscription pricing |
| WebPreserver / Page Vault | Enterprise legal evidence SaaS | Enterprise pricing, not self-hostable, vendor controls chain of custody |
| DEPT (digitalevidencetoolkit.org) | Journalist-focused capture with C2PA signing | Different signing standard (C2PA vs WACZ+Ed25519), not self-deployable as an API service |
| archive.org / archive.is | Free public archival | No signing, no tamper evidence, no API for programmatic use, no self-hosting |
| "Build it yourself" | Custom scripts + headless browser | Months of work to get signing, verification, SSRF prevention, WACZ compliance right |
| "Do nothing" / manual screenshots | Browser screenshots saved to disk | Zero integrity proof, inadmissible as evidence, no chain of custody |

**WRL's unique attributes (facts, not claims):**
- Self-hosted on Cloudflare Workers -- operator controls signing keys and infrastructure
- Ed25519 signing with public verification endpoint (no account required to verify)
- WACZ bundle format with standards pedigree (Harvard LIL, Library of Congress, Starling Lab)
- Full API with OpenAPI spec -- capture, poll, retrieve, verify are all programmatic
- SSRF prevention built in (DNS pre-resolution, private IP blocking, redirect chain validation)
- Static HTML verification page for non-technical third parties
- Two production dependencies (Puppeteer + fflate) -- minimal attack surface
- Estimated $5/month operating cost on Cloudflare

**Target customer segments (in priority order):**
1. **Compliance/legal developers** building evidence collection into workflows -- the pain is acute (courts reject screenshots), recognized (FRE 901/902, eIDAS), and acted upon (they are already evaluating tools)
2. **Journalism/OSINT developers** who need verifiable web evidence that does not depend on a vendor staying in business or being trustworthy
3. **Developer tool evaluators** looking at web archival options who value self-hosting, open source, and API-first design
4. **Open-source contributors** who find the project technically interesting (WACZ format, Ed25519 signing, Cloudflare Workers architecture)

**Market category:** Self-hosted web evidence API. Not "web archival" (sets expectations of crawling/preservation at scale, which is Browsertrix/ArchiveBox territory). Not "legal evidence platform" (sets expectations of court-ready compliance and eIDAS/TSA support, which WRL does not yet have). "Web evidence API" frames the value correctly: you submit a URL, you get back signed proof.

### Messaging Hierarchy

**Core message:** Capture web pages as signed, verifiable evidence you control.

**Supporting messages:**

1. **Cryptographic proof, not just screenshots.** Every capture produces an Ed25519-signed WACZ bundle containing rendered HTML, a full-page screenshot, and HTTP headers. Each artifact is individually hashed; the bundle hash is signed. Tampering with any byte breaks verification.

2. **Public verification, zero trust required.** Anyone with a capture ID can verify authenticity -- through the API or a human-readable verification page. No account needed. The signing key is published at `/.well-known/signing-key` for independent verification.

3. **Your keys, your infrastructure.** Deploy on your own Cloudflare Workers account. You generate the Ed25519 signing key. You control R2 storage. No vendor has custody of your evidence or signing authority.

4. **API-first, four endpoints.** POST to capture, GET to poll status, GET to retrieve, GET to verify. OpenAPI spec included. Integrates into any workflow that can make HTTP requests.

5. **Built for security from day one.** SSRF prevention with DNS pre-resolution and private IP blocking. Rate limiting. Security headers on every response. HTML artifacts served as `text/plain` to prevent XSS. Two runtime dependencies total.

**Proof points (for each supporting message):**
1. WACZ format used by Webrecorder, Harvard LIL, Library of Congress, Starling Lab
2. Three-check verification pipeline: artifact hashes, bundle hash, Ed25519 signature
3. `node scripts/generate-signing-key.js` + `wrangler secret put SIGNING_KEY` is the complete key setup
4. Full OpenAPI spec at `openapi.yaml`; all examples use `curl`
5. 12 documented build phases in `docs/evolution/`, each with security decisions recorded

### README Information Architecture

The README should follow this exact sequence (each section tuned to when a reader would want to leave or continue):

```
1. Badges (CI, license, despicable-agents, vibe-coded)
2. Project name + positioning statement (3 sentences above)
3. "What you get" -- concrete output of a capture (not features, outputs)
4. Quick start -- curl example showing capture -> poll -> verify
5. How it works -- brief architectural overview (one paragraph + diagram)
6. Setup -- prerequisites, install, key generation, deploy
7. API reference -- summary table linking to openapi.yaml
8. Verification -- how third parties check captures
9. Built with despicable-agents (see below)
10. Contributing, License, Security links
```

The critical insight: **sections 2-4 must fit in a single screenful (roughly 40 lines of markdown).** A developer who sees the positioning statement, the concrete output, and a working curl example in one scroll has enough to decide whether to read further. Everything below section 4 is for developers who have already decided this is relevant to them.

### despicable-agents Mention

The despicable-agents mention should live in a **dedicated short section near the bottom**, not woven into the positioning statement or the technical content. Reasons:

1. **Mixing build process into product positioning dilutes both messages.** A developer evaluating WRL for web evidence does not care how it was built. A developer interested in agent-driven development does not care about WACZ bundles. Separate sections serve separate audiences.

2. **The badge at the top is the ambient signal.** A gold/amber shields.io badge saying "built with despicable-agents" (or similar) catches the eye of anyone who recognizes it. That is sufficient for the top of the page.

3. **The bottom section is where curiosity converts.** After reading the technical content and deciding WRL is well-built, a reader who notices the badge has context to care about the "how." The section should be brief:

```markdown
## Built with despicable-agents

This project was built from scratch using [despicable-agents](../despicable-agents),
a multi-agent orchestration framework. Every design decision, specialist argument,
and outcome is documented in [`docs/evolution/`](docs/evolution/) -- 12 phases
from kickoff to open-source readiness.
```

This is natural, not promotional. It states a fact, points to evidence, and lets the reader decide if they care. The evolution log is the proof point -- 12 documented phases is concrete.

### "What You Get" Section

This is the highest-leverage addition missing from the current README. Instead of listing features, show the concrete output of a single capture:

```markdown
## What you get

A single API call produces:

- **Full-page screenshot** (PNG) -- rendered in a headless browser
- **Rendered HTML** -- the DOM after JavaScript execution
- **HTTP response headers** -- the server's response at capture time
- **Signed WACZ bundle** -- all artifacts packaged, hashed, and signed with Ed25519
- **Verification URL** -- a shareable link anyone can use to confirm authenticity
```

This maps directly to the Value Proposition Canvas gain creators. Each line item is a concrete artifact, not an abstract capability. A developer reading this knows exactly what they will get back from the API.

### Quick Start Section

The quick start must demonstrate the complete value loop: capture, poll, verify. Three curl commands, annotated output. This is the zero-to-working proof that the positioning statement is real.

```markdown
## Quick start

# 1. Capture a URL
curl -X POST https://your-wrl.workers.dev/v1/captures \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Returns: { "id": "cap_...", "statusUrl": "..." }

# 2. Poll until complete
curl https://your-wrl.workers.dev/v1/captures/cap_.../status

# Returns: { "status": "complete", "captureUrl": "..." }

# 3. Verify the capture
curl https://your-wrl.workers.dev/v1/verify/cap_...

# Returns: { "verified": true, "checks": [...] }
```

Three commands. The entire value proposition demonstrated. A developer can read this in 15 seconds and understand exactly what WRL does.

## Proposed Tasks

1. **Write the positioning statement** -- the 3-sentence opener as specified above. This anchors everything else. (~5 min to finalize, but must be reviewed by the human before the rest proceeds.)

2. **Write the "What you get" section** -- artifact-focused, not feature-focused. One bullet per concrete output.

3. **Write the quick start section** -- three curl commands showing capture -> poll -> verify. Use realistic but generic URLs (`your-wrl.workers.dev`).

4. **Write the despicable-agents section** -- brief, bottom of README, linking to `docs/evolution/`.

5. **Define badge placement** -- CI status, license, despicable-agents badge, vibe-coded badge. Left-to-right order: most important to reader first (CI status proves the project works, license tells them if they can use it, the rest is context).

6. **Review the full README draft for messaging consistency** -- every section should reinforce the core message ("signed, verifiable evidence you control") without repeating it verbatim. Check that no section makes claims without proof points.

Note: Tasks 1-5 are product-marketing-minion scope (positioning sections of the README). The full setup instructions, API reference details, and contributing/license/security links are software-docs-minion scope per the collaboration boundary in my operating instructions.

## Risks and Concerns

### Risk 1: Overpromising legal admissibility

The current product does **not** have RFC 3161 timestamps, eIDAS compliance, or court-tested admissibility. The positioning must not imply "court-ready evidence" or "legally admissible." The phrase "prove what was online, and when" is carefully chosen -- it describes what the cryptography does (proves integrity and authorship), not what a court would accept. The "when" is self-asserted (server timestamp), not independently timestamped by a TSA.

**Mitigation:** The README should include a brief, honest note in the verification or architecture section: "Timestamps are self-asserted by the WRL instance. For independent temporal proof, RFC 3161 timestamping is on the roadmap." This preempts the inevitable "but can I use this in court?" question without undermining the value proposition.

### Risk 2: v0.1.0 maturity expectations

The project is at v0.1.0 with a backlog that includes fundamental items like per-tenant API keys, key versioning, and list endpoints. The README must not set expectations of production-grade multi-tenant software.

**Mitigation:** The positioning statement says "Deploy it on your own Cloudflare Workers" (singular operator framing). The quick start uses a personal API key. Neither implies multi-tenant SaaS readiness. The version badge (0.1.0) is an honest signal. Consider adding a one-line maturity note: "WRL is in active early development. The API surface is stable but features like key versioning and multi-tenancy are not yet implemented."

### Risk 3: "Self-hosted" framing may limit perceived audience

Positioning as self-hosted appeals strongly to segment 1 (compliance developers who need key custody) but may seem like a burden to segment 3 (developers who just want to try it). The quick start section must demonstrate that "self-hosted on Cloudflare" is not a heavy lift -- it is `npm install` + `wrangler deploy`.

### Risk 4: WACZ format recognition

Most developers do not know what WACZ is. The positioning statement names it but does not depend on the reader knowing it. The "What you get" section lists concrete artifacts (screenshot, HTML, headers) before mentioning the bundle format. A reader who has never heard of WACZ still understands the value; a reader who knows WACZ gets an immediate credibility signal.

### Risk 5: Dual-purpose messaging confusion

The project explicitly serves two audiences: people who want web evidence tooling and people interested in agent-driven development. Mixing these in the positioning statement would weaken both messages. The badge + bottom section approach keeps them cleanly separated.

## Additional Agents Needed

**software-docs-minion** -- Required for the non-positioning sections of the README: full setup instructions (the current prerequisites/setup/signing-key/key-rotation/development/deploy sections need restructuring but the content is technical documentation, not marketing copy), API reference table, and links section. The product-marketing-minion writes sections 1-4 and the despicable-agents section; software-docs-minion writes sections 5-9 (setup, API reference, verification details, contributing/license/security).

No other additional agents are needed. The question of visual design (badge styling, potential architecture diagram) is secondary to the content structure and can be handled by whoever implements the README. The positioning work does not require UX strategy input -- the README is a text document, not an interactive product.
