# Phase 3: Synthesis -- WRL MVP Scoping and Planning

## Delegation Plan

**Team name**: wrl-mvp-scoping
**Description**: Scope the WRL minimum shippable product, produce planning documents, create GitHub issues for implementation work units, and document decisions in the evolution log.

---

### Conflict Resolutions

#### 1. Bundle Format: WACZ vs. Directory-of-Files

**gru** recommends WACZ (ZIP container with WARC records, SHA-256 manifest, legal pedigree, signing spec exists). **margo** recommends directory-of-files (simpler, fewer dependencies).

**Resolution: WACZ.** The complexity delta is smaller than it appears. WACZ *is* a directory of files inside a ZIP with a `datapackage.json` manifest containing SHA-256 hashes. The manifest IS the verification mechanism -- you don't need to build one from scratch. The legal pedigree (Harvard LIL, Library of Congress, Starling Lab) is free value. The key insight from gru: "WACZ makes all other decisions reversible" -- the format accommodates upgrades (signing, better timestamps, fuller capture) without changing the container. The MVP implementation can use a simplified WACZ (HTML + headers + screenshot packaged with warcio.js), not the full forensic-grade capture that Scoop produces.

#### 2. Auth for MVP

**margo** says no auth for MVP. **security-minion** says API keys for capture endpoint.

**Resolution: Static API key for capture endpoint.** This is not "auth" in the user-management sense -- it's a single bearer token stored as an environment variable. One `if` statement in the request handler. The capture endpoint launches a headless browser (expensive, SSRF-capable). Without a kill switch, rate limiting alone is insufficient (attackers rotate IPs). Margo's own contribution acknowledges "at most a static API key." The verification endpoint remains fully public and unauthenticated. No user management, no registration, no OAuth.

#### 3. Signing Approach

**gru** recommends RFC 3161 via FreeTSA as part of MVP. **security-minion** recommends Ed25519 over SHA-256 manifest with extensible signatures array. **lucy** says defer TSA to post-MVP.

**Resolution: Ed25519 self-signing for MVP, RFC 3161 deferred.** The MVP signs capture bundles with Ed25519 over a SHA-256 content hash manifest. This proves integrity and WRL authorship. The manifest includes a `signatures` array that accommodates future RFC 3161 timestamps without format changes. TSA integration is the first post-MVP enhancement for legal admissibility. This balances gru's upgrade-path thinking with margo's simplicity principle. The verification endpoint clearly indicates timestamps are "self-asserted" so consumers know what they're getting.

#### 4. Capture Scope

**lucy** advises deferring screenshots (heavy dependency on headless browser). **gru** and **iac-minion** both assume headless browser (Cloudflare Browser Rendering) is in scope.

**Resolution: Screenshots are in scope.** The headless browser is already in the architecture (Cloudflare Browser Rendering, managed service, no infrastructure to self-manage). Since the browser is there for HTML rendering anyway, screenshots are essentially free -- one additional API call. The WACZ bundle includes screenshot + HTML + headers. Resource manifests (CSS/JS/images captured individually) are OUT -- that's the real complexity escalation.

---

### Task 1: Write MVP Scope Document (docs/MVP.md)

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: plan
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This document defines what is and is not in the MVP. Every downstream task depends on these scope decisions. Hard to reverse once implementation begins. High blast radius (all tasks depend on it).
- **Prompt**: |

    Write the MVP scope document for the Web Resource Ledger (WRL) project at `docs/MVP.md`.

    ## Context

    WRL is a tool for tamper-evident archival of web resources with proof of state at a point in time. The full product vision is in PRODUCT.md, but the MVP is radically smaller.

    The MVP goal (verbatim from the kickoff prompt): "The smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture."

    ## Three Core Requirements

    | ID | Requirement |
    |----|-------------|
    | R1 | Capture a URL (produce an immutable snapshot of a web resource) |
    | R2 | Store it immutably (persist the capture so it cannot be altered) |
    | R3 | Let a third party verify the capture (public verification without requiring an account) |

    ## Document Structure

    Use this structure for `docs/MVP.md`:

    ```
    # WRL Minimum Viable Product

    ## Goal
    <one sentence restating the MVP goal>

    ## What's In

    ### Capture (R1)
    <bulleted list of what's included in a capture>

    ### Immutable Storage (R2)
    <how captures are stored>

    ### Verification (R3)
    <how third parties verify>

    ### API Surface
    <the endpoints>

    ## What's Out (and Why)
    <table: feature | why it's out>

    ## Gray Zone Decisions
    <features that could go either way, and the decision made>

    ## Technology Stack
    <summary of chosen technologies>

    ## Constraints
    <non-functional requirements and engineering principles>
    ```

    ## Scope Decisions (these are resolved -- document them, don't re-debate)

    ### IN Scope

    **Capture contents (R1):**
    - HTML snapshot (rendered DOM from headless browser)
    - Screenshot (full-page PNG from headless browser)
    - HTTP response headers (captured via separate fetch)
    - Content hash (SHA-256 of each artifact + bundle hash)
    - Server-generated timestamp (self-asserted for MVP)

    **Bundle format:** WACZ (Web Archive Collection Zipped). A ZIP file containing WARC records, a CDXJ index, and a `datapackage.json` with SHA-256 hashes of every file. This format has legal pedigree (Harvard LIL, Library of Congress, Starling Lab) and built-in integrity verification. The MVP uses a simplified WACZ -- HTML + screenshot + headers packaged with warcio.js -- not the full forensic-grade capture.

    **Signing:** Ed25519 signature over SHA-256 content hash manifest. Each artifact gets its own SHA-256 hash. A `bundleHash` is computed from the canonical JSON of the artifacts object. The Ed25519 signature covers the bundleHash. The manifest includes a `signatures` array that accommodates future RFC 3161 timestamps without format changes.

    **Storage (R2):** Cloudflare R2 with content-addressed keys (`captures/{sha256}.wacz`). Bucket locks for retention. Zero egress fees (critical for verification traffic).

    **API surface (4 endpoints):**
    - `POST /captures` -- submit a URL for capture (202 Accepted, returns capture ID and status URL). Requires API key.
    - `GET /captures/{id}/status` -- poll capture progress (pending/complete/failed). Requires knowing the capture ID.
    - `GET /captures/{id}` -- retrieve capture metadata and artifact links. Requires knowing the capture ID.
    - `GET /verify/{id}` -- public verification endpoint. No authentication. Returns verification result with metadata.

    **Auth:** Single static API key (environment variable) for the capture endpoint only. Not a user management system -- just a bearer token and kill switch. The verification endpoint is fully public and unauthenticated.

    **Verification (R3):** The verify endpoint recomputes SHA-256 hashes of stored artifacts, compares against the manifest, verifies the Ed25519 signature, and returns a structured result (verified: true/false with capture metadata and artifact links). A minimal static verification page (single HTML file, vanilla JS) renders the result for non-technical third parties.

    **Security (non-negotiable):**
    - SSRF prevention: URL scheme allowlist (http/https only), DNS pre-resolution with private IP blocking, DNS pinning, redirect chain re-validation
    - Browser isolation: fresh incognito context per capture, resource limits (30s timeout, 50MB page limit, 200 subresource cap)
    - Rate limiting: 10 captures/min per IP, 60 verifications/min per IP, 3 concurrent captures per IP
    - Input validation: URL length limit (2048 chars), URL normalization, system-generated capture IDs

    **Infrastructure:** Cloudflare-native. Single Worker for all API routes. Cloudflare Browser Rendering for headless capture. R2 for storage. KV for metadata. Manual deployment via `wrangler deploy`. Total cost approximately $5/month.

    ### OUT of Scope

    | Feature | Why It's Out |
    |---------|-------------|
    | Scheduled captures (cron-style) | Additional trigger method. On-demand API is sufficient for MVP. |
    | Webhooks (inbound triggers) | Additional trigger method. Not needed for core value prop. |
    | MCP (AI-agent-driven triggers) | Additional trigger method. Can layer on top of the API later. |
    | Watch lists / bulk monitoring | PRODUCT.md calls this "the sticky use case" but single URL capture is table stakes. MVP is table stakes. |
    | Change detection / diffing | Requires multiple captures over time. Depends on monitoring mode (also out). |
    | Notifications | API response is the notification for on-demand captures. No event system needed. |
    | Multi-tenancy / RBAC | Zero users. MVP is single-operator. |
    | Social signup / user management | No identity system needed. Static API key suffices. |
    | Billing & quotas | No monetization for MVP. |
    | Resource manifest (CSS/JS/images) | Dramatically increases capture complexity. HTML + screenshot + headers prove content state. |
    | Full HTTP exchange capture | MVP uses rendered DOM + separate header fetch. Forensic-grade proxy capture (Scoop-style) is post-MVP. |
    | RFC 3161 timestamps / TSA | MVP uses self-asserted timestamps. TSA integration is the first post-MVP enhancement. Upgrade is a URL change + adding an entry to the signatures array. |
    | eIDAS / legal admissibility | Depends on TSA (also out). The bundle format (WACZ) and signing approach (extensible signatures array) are designed to accommodate this later. |
    | OpenAPI spec | 4 endpoints documented in markdown. Formal spec when the API surface is stable and external consumers need it. |
    | CI/CD pipeline | Manual `wrangler deploy` for single-developer MVP. Add GitHub Actions when it hurts. |
    | Database | Write-once, read-by-ID access pattern. KV for metadata, R2 for bundles. No SQL database needed. |
    | List/search captures | No `GET /captures` endpoint. Must know the capture ID. First addition post-MVP. |
    | Autoscaling | Cloudflare handles this. No scaling configuration needed. |
    | WORM-certified storage | R2 bucket locks are adequate. S3 Object Lock for regulated customers is post-MVP. |

    ### Gray Zone Decisions

    | Feature | Decision | Rationale |
    |---------|----------|-----------|
    | Screenshot | IN | Cloudflare Browser Rendering is already in the architecture for HTML capture. Screenshot is one additional API call -- essentially free once the browser is there. |
    | WACZ bundle format | IN | The complexity delta over directory-of-files is small (ZIP + manifest). Provides built-in integrity verification, legal pedigree, and ensures all future upgrades are additive. |
    | Static verification page | IN | A single HTML file with vanilla JS that calls the verify API. This is the difference between "developers can verify via curl" and "anyone can verify by clicking a link." R3 says "third party" -- that includes non-technical people. |
    | Ed25519 signing | IN | Proves integrity and WRL authorship. The manifest's `signatures` array accommodates TSA timestamps later without format changes. |
    | API key for capture | IN | Not user management -- a single env var bearer token. The capture endpoint is resource-intensive (headless browser) and SSRF-capable. A kill switch is necessary. |
    | RFC 3161 timestamps | OUT | Ed25519 self-signing is sufficient for MVP integrity verification. TSA adds temporal proof but requires ASN.1 parsing and external service dependency. Upgrade path is designed and documented. |
    | Resource manifest | OUT | Capturing CSS/JS/images individually is a significant complexity escalation. HTML + screenshot prove content state for MVP. |
    | OpenAPI spec | OUT | Write routes first, spec after. Consistent with "more code, less blah blah." |

    ### Technology Stack

    | Concern | Technology | Rationale |
    |---------|------------|-----------|
    | API server | Cloudflare Worker | Zero-ops, edge-distributed, JS-native, <300ms reads |
    | Headless browser | Cloudflare Browser Rendering | Managed Chrome, Puppeteer API, no infrastructure to maintain |
    | Bundle format | WACZ (via warcio.js) | Standards-based, built-in integrity, legal pedigree, upgrade path |
    | Signing | Ed25519 (Web Crypto API) | Fast, small signatures, deterministic, no padding oracle attacks |
    | Content hashing | SHA-256 | Standard for content integrity. Built into Web Crypto API. |
    | Blob storage | Cloudflare R2 | Zero egress, bucket locks, content-addressed keys, same network |
    | Metadata | Workers KV | Simple key-value, globally replicated, included in Workers plan |
    | Deployment | `wrangler deploy` (manual) | One command. No CI/CD infrastructure needed for MVP. |

    ### Constraints

    - **YAGNI**: Every feature traces to R1, R2, or R3. No speculative additions.
    - **KISS**: Simplest storage, simplest API, simplest deployment.
    - **<300ms latency**: Verification and retrieval endpoints. Capture is async (inherently slower).
    - **JS over TS**: Plain JavaScript unless a specific component requires TypeScript.
    - **Vanilla-first**: No React/Vue/Tailwind. Static verification page is plain HTML + vanilla JS.
    - **Evolution log**: Every phase documented in `docs/evolution/`. Entries are mandatory but terse (bullet points, not essays).

    ## Writing Guidelines

    - Keep it concise. This is a reference document, not an essay.
    - Use tables where they improve scanability.
    - Every "in" item should trace back to R1, R2, or R3.
    - Every "out" item should have a one-sentence rationale.
    - Do NOT add features or scope beyond what is listed above. The scope decisions are final.
    - Do NOT include implementation details (code examples, file structures). This is a scope document.
    - Do NOT create an OpenAPI spec or API reference. The 4 endpoints are listed with their purpose, not their full request/response shapes.

- **Deliverables**: `docs/MVP.md`
- **Success criteria**: Document covers all three sections (in/out/gray zone), every in-scope item traces to R1/R2/R3, every out-of-scope item has a rationale, technology stack is listed.

---

### Task 2: Write Technology Decisions Document (docs/evolution/0001-kickoff/decisions.md)

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: plan
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: Technology choices (bundle format, signing approach, infrastructure platform) are hard to reverse once implementation begins. Multiple downstream tasks depend on these decisions. High blast radius.
- **Prompt**: |

    Write the technology decisions document at `docs/evolution/0001-kickoff/decisions.md`.

    ## Context

    This is the evolution log for the WRL MVP kickoff phase. The decisions.md file captures key decisions made during scoping, alternatives considered, and rationale. Per CLAUDE.md convention, evolution log entries must be terse -- bullet points with rationale, not essays. A decision entry should be 3 lines: what, why, what was rejected.

    ## Format

    Use this format:

    ```
    # 0001: Kickoff Decisions

    Decisions made during MVP scoping. Each entry: what was decided, why, and what was rejected.

    ## <Decision Title>
    - **Decision**: <what>
    - **Why**: <rationale, 1-2 sentences>
    - **Rejected**: <alternatives and why they were rejected>
    ```

    ## Decisions to Document

    Record these decisions. Keep each entry to 3-5 bullet points maximum. Do not write paragraphs.

    ### 1. Bundle Format: WACZ

    - **Decision**: WACZ (Web Archive Collection Zipped) as the capture bundle format.
    - **Why**: ZIP container with WARC records and SHA-256 manifest. Built-in integrity verification (hash every file, hash the manifest). Legal pedigree: Harvard LIL, Library of Congress, Starling Lab. All future upgrades (signing, timestamps, fuller capture) are additive -- the format does not change.
    - **Rejected**:
      - Directory-of-files with JSON metadata: simpler but no standardization, no legal precedent, must build integrity verification from scratch.
      - MHTML: browser-specific, no integrity metadata, no signing support. Dead end.
      - Custom JSON bundle: violates KISS (reinventing what WACZ provides). Zero legal precedent.
      - Raw WARC (without WACZ container): ISO 28500 but not self-contained (loose files), no built-in manifest or signing spec. WACZ contains WARC, so you get ISO compatibility for free.

    ### 2. Signing: Ed25519 Self-Signing (TSA Deferred)

    - **Decision**: Ed25519 signature over SHA-256 content hash manifest. Extensible `signatures` array in manifest for future RFC 3161 timestamps.
    - **Why**: Proves integrity and WRL authorship. Fast (important for <300ms verification), small signatures (64 bytes), deterministic, no randomness pitfalls. The `signatures` array design means adding TSA timestamps later is adding an entry, not changing the format.
    - **Rejected**:
      - RFC 3161 via FreeTSA in MVP: adds ASN.1 parsing, external service dependency, and complexity. The upgrade path is a URL change + array entry. Defer until legal admissibility is needed.
      - HMAC/internal signing: zero legal weight, self-attested. Ed25519 at least provides verifiable authorship.
      - Blockchain-anchored timestamps: violates KISS. Gas fees, confirmation times, inconsistent court acceptance.
      - RSA: larger keys, larger signatures, slower, padding oracle risk. Ed25519 is the modern default.

    ### 3. Infrastructure: Cloudflare-Native Serverless

    - **Decision**: Entire stack on Cloudflare. Single Worker (all routes), Browser Rendering (headless Chrome), R2 (storage), KV (metadata).
    - **Why**: Zero servers, zero containers, zero certificates, zero scaling config. One deployment command (`wrangler deploy`). Approximately $5/month. R2 has zero egress fees (critical for verification traffic). Browser Rendering eliminates the need to manage headless Chrome infrastructure.
    - **Rejected**:
      - Self-hosted Playwright + VPS: must manage OS, Docker, Chrome binary, TLS, uptime. More ops burden for similar cost.
      - AWS Lambda + Fargate: $15-30/month, two services to manage, ECR, IAM roles, API Gateway. More complex.
      - Fastly Compute: no equivalent to Browser Rendering or R2. Could serve as CDN layer later.

    ### 4. Storage: R2 with Content-Addressed Keys

    - **Decision**: Object key = SHA-256 hash of WACZ bundle (`captures/{sha256}.wacz`). R2 bucket locks for retention.
    - **Why**: Content-addressed naming provides immutability by construction (modifying content changes the hash, which changes the key). Deduplication by default. Verification without metadata lookup. Bucket locks prevent accidental deletion.
    - **Rejected**:
      - S3 with Object Lock: SEC 17a-4 WORM compliance, but more expensive (egress fees), more complex (IAM). Add as secondary storage for regulated customers post-MVP.
      - Database for metadata: write-once, read-by-ID pattern. KV is sufficient. Database adds schema design, migrations, connection management, ORM.
      - D1 (edge SQLite): overkill for key-value lookup. Consider when listing/filtering is needed.

    ### 5. Auth: Static API Key for Capture Only

    - **Decision**: Single static API key (env var) for the capture endpoint. Verification endpoint is fully public.
    - **Why**: The capture endpoint is resource-intensive (headless browser) and SSRF-capable. A kill switch is necessary. This is not user management -- it's one bearer token. Verification must be unauthenticated (core value prop: "third parties can independently confirm capture authenticity").
    - **Rejected**:
      - No auth at all: rate limiting alone is insufficient. Attackers rotate IPs trivially. No kill switch for abuse.
      - OAuth/user management: zero users exist. Introduces database, session management, permission checks. Massive scope explosion.

    ### 6. API Design: 4 Endpoints, Async Polling

    - **Decision**: POST /captures (202), GET /captures/{id}/status, GET /captures/{id}, GET /verify/{id}. Capture is async with polling.
    - **Why**: Minimum surface for R1/R2/R3. Async because page rendering takes 5-30 seconds. Polling is stateless (no webhooks, no SSE, no message queues). Verify on separate path from captures (different auth boundaries, clean shareable URL).
    - **Rejected**:
      - Synchronous capture: HTTP timeouts at 5-30s render times. Poor UX.
      - Server-Sent Events: adds connection management. Overkill for single-consumer polling.
      - Webhooks/callbacks: requires callback URL registration, retry logic, signature verification.
      - Verify nested under /captures/{id}/verify: mixes auth boundaries (captures is authenticated, verify is public).

    ### 7. Capture Scope: HTML + Screenshot + Headers (No Resource Manifest)

    - **Decision**: MVP capture includes rendered HTML, full-page screenshot, and HTTP response headers. Resource manifest (individual CSS/JS/images) is out.
    - **Why**: Screenshot is essentially free once Browser Rendering is in the architecture. Resource manifest dramatically increases complexity (crawling, storage, CORS). HTML + screenshot prove content state for MVP.
    - **Rejected**:
      - HTML only (no screenshot): screenshot is trivial to add with Browser Rendering already present. Visual proof is compelling for non-technical verifiers.
      - Full resource manifest: each subresource needs its own fetch, storage, and hash. CORS issues. Storage multiplication. Post-MVP enhancement.

    ### 8. OpenAPI Spec: Deferred

    - **Decision**: Document 4 endpoints in markdown (MVP.md). Formal OpenAPI spec when API surface is stable and external consumers need it.
    - **Why**: "More code, less blah blah" (Helix Manifesto). 4 endpoints do not justify spec tooling overhead. Spec ossifies quickly during rapid iteration.
    - **Rejected**:
      - Spec-first development: creates documentation bottleneck. Writing the spec before routes exist is waterfall.

    ## Do NOT include in this document

    - Implementation details (code, file structures, function signatures)
    - Full specialist analysis (that's in the planning scratch files)
    - Post-MVP roadmap (that belongs in a separate document)

    ## Writing Guidelines

    - Maximum 5 bullet points per decision entry
    - One sentence per bullet point where possible
    - "What, why, rejected" structure for every entry
    - This is a reference document for future developers. Someone should be able to understand why a choice was made in under 30 seconds per entry.

- **Deliverables**: `docs/evolution/0001-kickoff/decisions.md`
- **Success criteria**: All 8 decisions documented with what/why/rejected structure. Each entry is 3-5 bullet points. No paragraphs.

---

### Task 3: Write Implementation Plan

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: plan
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |

    Write a sequenced implementation plan for the WRL MVP. This will be written to `docs/MVP.md` as an additional section appended after the scope content (which Task 1 already wrote), OR as a separate `docs/IMPLEMENTATION.md` file -- use your judgment on which is cleaner. If you append to MVP.md, add it under a clear `## Implementation Plan` heading.

    ## Context

    The MVP scope is defined in `docs/MVP.md` (written by Task 1). The technology decisions are in `docs/evolution/0001-kickoff/decisions.md` (written by Task 2). Read both before writing.

    The implementation plan must satisfy this constraint from the kickoff prompt: "Sequence matters -- each step should produce something runnable."

    ## Structure

    Each step produces a runnable artifact. Steps are ordered by dependency -- each builds on the previous.

    ```
    ## Implementation Plan

    ### Step N: <Title>
    **Produces**: <what is runnable after this step>
    **Depends on**: <previous step(s), or "none">

    <3-5 bullet points describing the work>

    **Verification**: <how to confirm this step is complete and working>
    ```

    ## Implementation Sequence

    Use these steps. Each produces something you can test.

    ### Step 1: Project Scaffold and Cloudflare Worker

    Set up the project structure and deploy a minimal Cloudflare Worker that responds to requests.

    - Initialize `wrangler.toml` with Worker name, R2 bucket binding, KV namespace binding, Browser Rendering binding
    - Create the basic Worker entry point with route handling (vanilla JS, no framework)
    - Implement health check endpoint (`GET /health`)
    - Deploy with `wrangler deploy` and verify it responds
    - **Produces**: A deployed Worker that responds to HTTP requests. `curl https://wrl.yourdomain.com/health` returns 200.

    ### Step 2: URL Validation and SSRF Prevention

    Build the URL validation module as a standalone, testable library. This is the most security-critical component.

    - URL scheme allowlist (http/https only, reject file/ftp/data/javascript/blob/gopher)
    - DNS pre-resolution with private IP range blocking (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 127.0.0.0/8, ::1)
    - URL normalization via the URL constructor (prevents encoding tricks)
    - URL length limit (2048 characters)
    - Redirect chain validation (re-apply all checks at each hop, max 5 redirects)
    - Unit tests with SSRF bypass attempts (hex IP, octal IP, decimal IP, IPv6-mapped IPv4, DNS to localhost, double encoding)
    - **Produces**: A tested URL validation module that can be imported by the capture endpoint.

    ### Step 3: Capture Endpoint and Browser Rendering

    Implement the capture flow: accept a URL, validate it, render it with Browser Rendering, collect artifacts.

    - `POST /captures` endpoint: accept URL in request body, validate with Step 2 module
    - API key authentication (single bearer token from env var, 401 if missing/invalid)
    - Generate capture ID (`cap_` prefix + random hex)
    - Invoke Cloudflare Browser Rendering: navigate to URL, take full-page screenshot (PNG), extract rendered HTML
    - Capture HTTP response headers via Workers fetch
    - Store capture status in KV (pending -> complete/failed)
    - Rate limiting: 10 captures/min per IP, 3 concurrent per IP
    - Return 202 Accepted with capture ID and status URL
    - **Produces**: `POST /captures` accepts a URL, renders it, and stores the artifacts. `GET /captures/{id}/status` shows pending/complete/failed.

    ### Step 4: WACZ Bundling and Signing

    Package captured artifacts into a signed WACZ bundle and store in R2.

    - Write WARC records from captured artifacts (HTML, screenshot, headers) using warcio.js
    - Generate CDXJ index
    - Compute SHA-256 hash of each artifact
    - Generate `datapackage.json` manifest with artifact hashes
    - Compute bundleHash (SHA-256 of canonical JSON artifacts object)
    - Sign bundleHash with Ed25519 (Web Crypto API, keypair from env var)
    - Create manifest with `signatures` array containing the self-signature
    - Package as WACZ (ZIP containing WARC + index + manifest)
    - Store WACZ in R2 with content-addressed key (`captures/{sha256}.wacz`)
    - Store metadata in KV (capture ID -> R2 key mapping + capture metadata)
    - **Produces**: Captures produce signed WACZ bundles stored in R2. Each bundle is tamper-evident.

    ### Step 5: Retrieval Endpoint

    Serve capture metadata and artifact links.

    - `GET /captures/{id}` endpoint: look up capture ID in KV, return metadata with artifact links
    - `GET /captures/{id}/status` endpoint: return capture status from KV
    - Artifact serving: proxy from R2 or return signed redirect URLs
    - 404 (structured, RFC 9457 format) for unknown IDs
    - <300ms response time target
    - **Produces**: Complete capture lifecycle: submit URL, poll status, retrieve results.

    ### Step 6: Verification Endpoint

    The core value prop -- public, unauthenticated integrity verification.

    - `GET /verify/{id}` endpoint: no authentication required
    - Fetch WACZ bundle from R2
    - Recompute SHA-256 hashes of each artifact
    - Compare against manifest hashes
    - Verify Ed25519 signature over bundleHash
    - Return structured result: verified true/false, capture metadata, artifact links
    - Rate limiting: 60 verifications/min per IP
    - Cache headers: `Cache-Control: public, immutable, max-age=31536000`
    - **Produces**: Third parties can verify capture integrity via a public endpoint.

    ### Step 7: Static Verification Page

    A minimal HTML page for non-technical verifiers.

    - Single static HTML file served at `/verify/{id}` when `Accept: text/html` (content negotiation)
    - Vanilla JS: calls the verify API, displays result (URL, timestamp, hash, verified/failed)
    - Displays screenshot thumbnail and link to full HTML snapshot
    - No framework, no build step, no npm dependencies
    - **Produces**: Non-technical third parties can verify a capture by opening a link in a browser.

    ### Step 8: Security Hardening and Error Handling

    Cross-cutting security and reliability concerns.

    - Browser isolation: fresh incognito context per capture, navigation timeout (30s), page size limit (50MB), subresource cap (200)
    - DNS pinning for browser requests (pass pre-validated IP to Browser Rendering)
    - Security headers on all responses (HSTS, X-Content-Type-Options, X-Frame-Options)
    - Structured error responses (RFC 9457 format) across all endpoints
    - Global backpressure: 503 + Retry-After when capacity exceeded
    - Public key endpoint: `GET /.well-known/signing-key` (Ed25519 public key for independent verification)
    - **Produces**: Hardened service ready for external use.

    ## Notes for the Implementation Plan Document

    - Each step should note what is testable after completion
    - Steps 1-6 are sequential (each builds on the previous)
    - Step 7 can run in parallel with Step 6 (different files, no dependency)
    - Step 8 is partially parallel (security hardening can begin alongside Steps 5-7)
    - Keep the plan concise. 3-5 bullet points per step. No code examples.
    - Note that evolution log entries (decisions.md updates, outcome.md) happen during implementation, not as separate steps

- **Deliverables**: Implementation plan section in `docs/MVP.md` or separate `docs/IMPLEMENTATION.md`
- **Success criteria**: 8 sequenced steps, each produces something runnable/testable, dependencies are explicit.

---

### Task 4: Create GitHub Issues

- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3
- **Approval gate**: no
- **Prompt**: |

    Create GitHub issues for the WRL MVP implementation plan. Read `docs/MVP.md` (and `docs/IMPLEMENTATION.md` if it exists) for the full scope and implementation sequence.

    ## Context

    The WRL MVP has been scoped and planned. The implementation plan has 8 sequential steps. Each step should become one GitHub issue. The issues should be self-contained: a developer (or agent) can pick up any issue and execute it without reading the full planning documents, as long as predecessor issues are complete.

    ## Issue Format

    For each implementation step, create a GitHub issue using `gh issue create`.

    **Title format**: `MVP Step N: <concise title>`

    **Body structure**:
    ```
    ## Goal
    <one sentence: what this step produces>

    ## Context
    <1-2 sentences: what exists before this step, what this step adds>

    ## Work Items
    - [ ] <checkbox item 1>
    - [ ] <checkbox item 2>
    ...

    ## Acceptance Criteria
    - <criterion 1>
    - <criterion 2>
    ...

    ## Dependencies
    - Blocked by: #<issue number> (or "none")
    - Blocks: #<issue number> (or "none")

    ## Technical Notes
    <2-3 bullet points of key technical context the implementer needs>
    ```

    **Labels**: Add labels `mvp` and `enhancement` to each issue. Create the `mvp` label first if it does not exist (`gh label create mvp --description "Minimum viable product" --color 0E8A16`).

    ## Issues to Create

    Create 8 issues, one per implementation step. The steps are:

    1. **Project Scaffold and Cloudflare Worker** -- wrangler.toml, Worker entry point, health check, first deploy
    2. **URL Validation and SSRF Prevention** -- standalone module, scheme allowlist, DNS validation, private IP blocking, unit tests with bypass attempts
    3. **Capture Endpoint and Browser Rendering** -- POST /captures, API key auth, Browser Rendering integration, KV for status, rate limiting
    4. **WACZ Bundling and Signing** -- warcio.js WARC records, SHA-256 hashing, Ed25519 signing, R2 storage with content-addressed keys
    5. **Retrieval Endpoint** -- GET /captures/{id} and /captures/{id}/status, artifact serving from R2, <300ms target
    6. **Verification Endpoint** -- GET /verify/{id}, public/unauthenticated, hash recomputation, signature verification, cache headers
    7. **Static Verification Page** -- single HTML file, vanilla JS, content negotiation, screenshot thumbnail
    8. **Security Hardening and Error Handling** -- browser isolation, DNS pinning, security headers, RFC 9457 errors, backpressure, public key endpoint

    ## Technical Notes for Issues

    Include these key technical details in the relevant issues:

    **Issue 1 (Scaffold)**:
    - Cloudflare Worker with vanilla JS (no framework)
    - wrangler.toml bindings: R2 bucket, KV namespace, Browser Rendering
    - Plain JS, not TypeScript

    **Issue 2 (SSRF Prevention)**:
    - This is the most security-critical component in the entire system
    - Must block: private IP ranges (10/8, 172.16/12, 192.168/16), link-local (169.254/16), loopback (127/8, ::1)
    - Must handle: hex IP encoding, octal encoding, decimal encoding, IPv6-mapped IPv4, DNS to localhost
    - Must re-validate after redirects (max 5 hops)
    - Extract as standalone module with its own test suite

    **Issue 3 (Capture)**:
    - API key: single bearer token from env var (CAPTURE_API_KEY), 401 if missing/invalid
    - Capture ID format: `cap_` prefix + random hex (crypto.randomUUID or crypto.getRandomValues)
    - Cloudflare Browser Rendering: use REST API for screenshot (/screenshot) and HTML (/snapshot), Workers fetch for headers
    - Async: return 202 immediately, store status in KV, update on completion
    - Rate limits: 10/min and 3 concurrent per IP

    **Issue 4 (WACZ)**:
    - Use warcio.js for WARC record creation
    - Each artifact gets SHA-256 hash in manifest
    - bundleHash = SHA-256 of canonical JSON of artifacts object (sort keys, no whitespace)
    - Ed25519 signing via Web Crypto API (key from env var)
    - R2 object key: `captures/{sha256-of-wacz}.wacz`
    - Manifest includes `signatures` array with type "self" entry
    - Manifest version: "1"

    **Issue 5 (Retrieval)**:
    - KV lookup for metadata, R2 for artifact content
    - Return artifact links, not inline content
    - 404 uses RFC 9457 format: `{ "type": "...", "title": "...", "status": 404, "detail": "..." }`

    **Issue 6 (Verify)**:
    - Fully public, no authentication
    - Recompute all hashes, verify Ed25519 signature
    - Response: `{ "verified": true/false, "capture": {...}, "artifacts": {...} }`
    - Cache-Control: public, immutable, max-age=31536000
    - Rate limit: 60/min per IP

    **Issue 7 (Verification Page)**:
    - Content negotiation: serve HTML when Accept includes text/html, JSON otherwise
    - Single HTML file, inline CSS, inline JS (no external dependencies)
    - Show: URL, capture timestamp, hash, verified/failed badge, screenshot thumbnail
    - Must work without JavaScript disabled (progressive enhancement)

    **Issue 8 (Security)**:
    - Fresh incognito browser context per capture, destroyed after
    - Navigation timeout: 30s, page size: 50MB max, subresource cap: 200
    - Security headers: HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY
    - `GET /.well-known/signing-key` returns the Ed25519 public key (base64-encoded)
    - All errors use RFC 9457 format, no stack traces leaked

    ## Execution Notes

    - Create the `mvp` label first, then create issues in order (1 through 8)
    - After creating each issue, note its number so you can reference it in the Dependencies section of subsequent issues
    - Issue 1 blocks Issue 2, Issue 2 blocks Issue 3, etc. (mostly sequential)
    - Issue 7 is blocked by Issue 5 (needs capture data to display) but not by Issue 6
    - Issue 8 is blocked by Issue 3 (needs the capture endpoint to harden)
    - Do NOT create issues for post-MVP work. Only the 8 MVP implementation steps.

- **Deliverables**: 8 GitHub issues created with proper labels, dependencies, and technical context
- **Success criteria**: All 8 issues exist, each has work items and acceptance criteria, dependencies reference actual issue numbers, `mvp` label applied to all.

---

### Task 5: Write Evolution Log Outcome (docs/evolution/0001-kickoff/outcome.md)

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: plan
- **Blocked by**: Task 4
- **Approval gate**: no
- **Prompt**: |

    Write the evolution log outcome document at `docs/evolution/0001-kickoff/outcome.md`.

    ## Context

    This is the outcome document for the 0001-kickoff phase of WRL development. This phase scoped the MVP, made technology decisions, wrote an implementation plan, and created GitHub issues.

    The prompt for this phase is at `docs/evolution/0001-kickoff/prompt.md`. The decisions are at `docs/evolution/0001-kickoff/decisions.md`. The MVP scope is at `docs/MVP.md`. Read all three before writing.

    ## Format

    Per CLAUDE.md convention, evolution log entries must be terse. The outcome.md should be 10-20 lines maximum. Bullet points, not paragraphs.

    ```
    # 0001: Kickoff Outcome

    ## What Was Produced
    - <deliverable 1>
    - <deliverable 2>
    ...

    ## Key Numbers
    - <metric>

    ## Surprises
    - <anything unexpected>

    ## Next
    - <what happens after this phase>
    ```

    ## Content to Include

    **What Was Produced:**
    - `docs/MVP.md` -- scope document (what's in, what's out, why)
    - `docs/evolution/0001-kickoff/decisions.md` -- 8 technology decisions with rationale
    - Implementation plan with 8 sequenced steps, each producing something runnable
    - GitHub issues for all 8 implementation steps (reference issue numbers from the repo)

    **Key Numbers:**
    - 4 API endpoints (POST /captures, GET /captures/{id}/status, GET /captures/{id}, GET /verify/{id})
    - 8 implementation steps
    - Approximately $5/month infrastructure cost (Cloudflare Workers paid plan)
    - 0 databases, 0 containers, 0 certificates to manage

    **Surprises:**
    - Check if there were any. Read the decisions.md to see if anything deviated from initial assumptions. Common surprises in this type of planning:
      - WACZ format being chosen over simpler directory-of-files (the complexity delta was smaller than expected)
      - API key being included despite "no auth" YAGNI pressure (security-minion's SSRF argument was convincing)
      - RFC 3161 timestamps being deferred despite being part of the core value prop (self-signed integrity is sufficient for MVP)
      - Cloudflare Browser Rendering eliminating the need for container infrastructure entirely

    **Next:**
    - Begin implementation with Step 1 (project scaffold and Cloudflare Worker)
    - Implementation follows the sequenced plan: each step produces something runnable
    - Evolution log continues: each implementation step may warrant its own phase entry if significant decisions are made

    ## Writing Guidelines

    - Maximum 20 lines total
    - Bullet points only, no paragraphs
    - Reference actual file paths and issue numbers (read them from the repo)
    - Include one honest "surprise" -- something that was not obvious at the start
    - Do NOT repeat the full scope or decisions -- reference the documents instead

- **Deliverables**: `docs/evolution/0001-kickoff/outcome.md`
- **Success criteria**: Terse (under 20 lines), references actual deliverables and issue numbers, includes at least one surprise/deviation.

---

### Cross-Cutting Coverage

| Dimension | Coverage | Justification |
|-----------|----------|---------------|
| **Testing** | Not a separate task | This orchestration produces planning documents, not code. Test strategy is documented in the implementation plan (each step has verification criteria). test-minion will be involved during implementation phases. |
| **Security** | Embedded in Task 1 and Task 4 | Security controls (SSRF prevention, browser isolation, rate limiting, API keys) are part of the MVP scope and have dedicated implementation steps (Issues 2, 8). security-minion's full analysis is incorporated into the scope document. |
| **Usability -- Strategy** | Embedded in Task 1 | The verification page (R3 for non-technical users) and API design (async polling, structured errors) address the user journey. ux-strategy review happens at Phase 3.5. |
| **Usability -- Design** | Not applicable | No UI design in this phase. The static verification page (Step 7) is minimal vanilla HTML. ux-design-minion reviews during implementation. |
| **Documentation** | Tasks 1, 2, 3, 5 are all documentation | The entire orchestration is documentation-focused. software-docs-minion is the primary agent for 4 of 5 tasks. |
| **Observability** | Deferred to implementation | MVP uses Cloudflare dashboard + Workers analytics (built-in). Structured logging added when debugging becomes painful. Not needed for planning documents. |

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. This orchestration produces planning documents and GitHub issues, not code or runtime components. No UI components are produced (ux-design-minion not needed). No web-facing HTML is produced (accessibility-minion not needed). No runtime services are produced (sitespeed-minion, observability-minion not needed). No end-user behavior changes (user-docs-minion not needed).
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Risks and Mitigations

| Risk | Source | Mitigation |
|------|--------|------------|
| SSRF is the existential security threat | security-minion | URL validation module is a dedicated implementation step (Step 2 / Issue 2) with comprehensive bypass testing. Extracted as standalone library. |
| Headless browser is the complexity iceberg | margo | Cloudflare Browser Rendering eliminates infrastructure management. Managed service, not self-hosted. |
| WACZ tooling dependency (warcio.js) | gru | Small maintainer team but spec is simple. Could fork/reimplement if abandoned. The spec matters more than the library. |
| Self-asserted timestamps are legally meaningless | security-minion | Accepted for MVP. Verification endpoint clearly indicates "self-asserted" timestamps. Upgrade path to RFC 3161 is designed (signatures array). |
| FreeTSA has no SLA (when TSA is eventually added) | gru | Use multiple TSAs for redundancy. WACZ-Auth spec supports this. |
| Bundle format decision locks in early | lucy | WACZ is specifically chosen because it makes all other decisions reversible. Upgrades are additive. |
| "Showcase" motivation inflating scope | lucy | Scope document explicitly lists what's out. The showcase value comes from process visibility (evolution log), not product features. |

### Execution Order

```
Batch 1: Task 1 (MVP Scope Document)
  [GATE: MVP scope approval]
    |
    v
Batch 2: Task 2 (Technology Decisions)
  [GATE: Technology decisions approval]
    |
    v
Batch 3: Task 3 (Implementation Plan)
    |
    v
Batch 4: Task 4 (GitHub Issues)
    |
    v
Batch 5: Task 5 (Evolution Log Outcome)
```

All tasks are sequential. Each builds on the deliverables of the previous.

### Verification Steps

After all tasks complete:
1. `docs/MVP.md` exists and covers in-scope, out-of-scope, gray zone, technology stack, constraints, and implementation plan
2. `docs/evolution/0001-kickoff/decisions.md` exists with 8 decisions in what/why/rejected format
3. `docs/evolution/0001-kickoff/outcome.md` exists, under 20 lines, references deliverables
4. 8 GitHub issues exist with `mvp` label, sequential dependencies, work items, and acceptance criteria
5. `docs/evolution/README.md` references the 0001-kickoff phase (already exists)
