# Phase 2: Infrastructure and Deployment Strategy (iac-minion)

## Deployment Strategy Evaluation

### Step 0: Serverless-First Assessment

The WRL MVP has four components. Each must be evaluated independently against the serverless-first cascade.

| Component | Blocking Concern? | Verdict |
|-----------|-------------------|---------|
| HTTP API server (capture trigger, retrieval) | None. Stateless request/response. | **Serverless** |
| Public verification endpoint | None. Read-only, latency-sensitive, globally distributed. | **Serverless (edge)** |
| Immutable blob storage | None. Object storage is inherently managed/serverless. | **Serverless (R2)** |
| Headless browser capture | **Yes -- execution environment constraints.** Headless Chrome requires 500MB+ memory, CPU-intensive rendering, 5-30s execution time. Also requires a browser binary that exceeds typical FaaS deployment size limits. | **Escalation required** |

The headless browser is the only component that triggers a blocking concern. However, Cloudflare now offers **Browser Rendering** as a managed service integrated with Workers, which eliminates the need for self-managed infrastructure while keeping us in the Cloudflare ecosystem.

### Recommended Architecture: Cloudflare-Native, Hybrid Serverless

```
                 CAPTURE FLOW                          VERIFY / RETRIEVE FLOW

  Client                                         Client
    |                                               |
    v                                               v
  CF Worker (API)                               CF Worker (Verify/Retrieve)
    |                                               |
    +---> CF Browser Rendering                      +---> R2 (read bundle)
    |        (headless Chrome)                      |
    |             |                                 +---> Compute hash, compare
    |             v                                 |
    |        screenshot, HTML,                      v
    |        headers, resources                   Response (<300ms)
    |             |
    +---> Hash + sign artifacts
    |
    +---> Store bundle in R2
    |
    +---> Store metadata (KV or D1)
    |
    v
  Return capture ID
```

Everything runs on Cloudflare. No containers. No VPS. No Docker. No Terraform. One platform, one bill, one deployment mechanism (`wrangler deploy`).

---

## Component-by-Component Breakdown

### 1. HTTP API (Cloudflare Worker)

**What:** A single Worker handles all API routes -- capture submission, retrieval, verification.

**Why Worker, not a Node.js container:**
- Zero cold starts (V8 isolates, not containers)
- Global edge deployment -- every Cloudflare PoP, 300+ locations
- No server to manage, no scaling to configure
- Retrieval and verification will comfortably hit <300ms since R2 reads from the same network
- JS-native (aligns with project's JS preference)

**Constraints to know:**
- Workers have a 30s CPU time limit on paid plan (128ms on free). The capture Worker does NOT run the browser itself -- it delegates to Browser Rendering and waits. Wall-clock time for waiting on I/O does not count against CPU time.
- 128MB memory limit per Worker. Sufficient since the Worker is orchestrating, not rendering.

### 2. Headless Browser (Cloudflare Browser Rendering)

**What:** Cloudflare's managed headless Chrome, invoked from Workers via Puppeteer binding or REST API.

**Why this over self-managed Chrome:**
- No Docker image to build or maintain
- No server to provision or scale
- Cloudflare manages the browser binary, security patches, sandbox
- Puppeteer API -- same API we'd use on a VPS, so migration path exists if we outgrow it
- Integrated with Workers -- the browser session runs in Cloudflare's infrastructure, the Worker orchestrates it

**Pricing (current):**
- Free tier: 10 minutes/day of browser time, 3 concurrent browsers
- Paid tier: 10 hours/month included, then $0.09/hour. 10 concurrent browsers included, then $2/browser.
- MVP math: If average capture takes 15 seconds, 10 hours/month = ~2,400 captures/month included. That is more than enough for MVP and early traction.

**Limits to watch:**
- 30 concurrent browsers max on paid plan (can request increase)
- 10-minute max session keep-alive
- 60-second default inactivity timeout (extendable to 10 minutes)
- A single capture (navigate, wait for render, screenshot, extract HTML/headers) should complete in 10-30 seconds -- well within limits.

**deviation-reason for Browser Rendering over pure serverless:** The browser rendering service IS Cloudflare's answer to the "execution environment constraints" blocking concern. We're not self-managing the escalation -- Cloudflare manages the browser infrastructure, we just call it. This is the best of both worlds: no operational burden, but access to a real browser engine.

### 3. Immutable Blob Storage (Cloudflare R2)

**What:** S3-compatible object storage for capture bundles. Each capture is stored as an immutable object with a content-hash-derived key.

**Why R2:**
- Zero egress fees -- critical for a verification service where third parties read capture data. S3 egress costs would directly scale with verification traffic.
- Same Cloudflare network as Workers -- low-latency reads for the verification endpoint.
- $0.015/GB/month storage. MVP will store negligible data.
- **Bucket Locks** (shipped March 2025) -- retention policies that prevent deletion/overwrite for a configurable period or indefinitely. Not as feature-complete as S3 Object Lock compliance mode, but sufficient for MVP. The content-hash-based keys provide additional integrity (you can't modify content without changing the hash).
- S3-compatible API -- if we ever need to migrate to S3 (e.g., for legal admissibility requiring true WORM compliance), the migration path is straightforward.

**Immutability approach for MVP:**
1. Content-addressed storage: object key = hash of bundle contents. Overwriting would change the hash, making tampering self-evident.
2. Bucket lock with indefinite retention: prevents accidental deletion.
3. For legal-admissibility upgrades later: add S3 Object Lock (compliance mode) on AWS, or wait for R2 to ship equivalent features.

### 4. Metadata Storage

**Options within Cloudflare:**

| Option | Pro | Con | Verdict |
|--------|-----|-----|---------|
| **Workers KV** | Dead simple key-value, global replication, low-latency reads | Eventually consistent (not ideal for capture-then-immediately-read), no querying beyond key lookup | Good for verification lookups |
| **D1** (edge SQLite) | SQL queries, relational data, transactional | Still in open beta, SQLite semantics | Good for MVP metadata if we need listing/filtering |
| **R2 metadata** | No additional service -- store JSON alongside bundles | No querying, no indexing | Minimal but limiting |

**Recommendation:** Start with **KV** for MVP. The access pattern is simple: write metadata at capture time, read by capture ID at retrieval/verification time. KV's eventual consistency is acceptable -- a capture that takes 10-30 seconds to render can tolerate a few seconds of propagation delay before the verification link becomes active.

If the MVP needs listing captures (e.g., "show me all captures for this URL"), upgrade to D1. But per YAGNI, start with KV.

### 5. Verification Endpoint

The verification endpoint is read-only and latency-sensitive. Running on a Cloudflare Worker at the edge means:
- <300ms is achievable globally. Worker cold start is <5ms. R2 read from the same network is fast. KV read is <10ms at the edge.
- No caching needed to hit the latency target. Caching is a bonus for cost reduction.
- Third parties access verification without authentication -- the endpoint is fully public.

---

## Single Service or Split?

**Recommendation: Single Worker, single codebase, single deployment.**

For MVP, there is no reason to split. A single Worker with route-based handling:

```
POST /captures       -> trigger capture
GET  /captures/:id   -> retrieve capture
GET  /verify/:hash   -> public verification
```

The Worker is stateless. Cloudflare handles routing, TLS, DDoS protection. One `wrangler.toml`, one `wrangler deploy`.

Split into multiple Workers only when: (a) the capture orchestration logic becomes complex enough to warrant its own deployment lifecycle, or (b) you need different scaling/security policies per endpoint. Neither applies at MVP.

---

## CI/CD for MVP

**Recommendation: Manual deployment is acceptable for MVP. Add CI/CD when it hurts.**

The deployment mechanism is `wrangler deploy`. It takes seconds. For a single developer iterating on an MVP, the workflow is:

1. Write code locally
2. Test locally with `wrangler dev` (local dev server with Workers runtime)
3. Deploy with `wrangler deploy`

**When to add CI/CD:** When any of these become true:
- More than one person is deploying
- You want automated testing before deploy
- You want preview deployments on PRs
- You've been burned by deploying something broken

When that time comes, a GitHub Actions workflow is trivial:

```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
      - run: npm ci
      - run: npm test
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

This can be added in 15 minutes when the need arises. Building it on day one is YAGNI.

---

## Cost Estimate for MVP

| Service | Monthly Cost (MVP usage) | Notes |
|---------|--------------------------|-------|
| Workers Paid Plan | $5/month base | 10M requests included |
| Browser Rendering | $0 (included) | 10 hours/month = ~2,400 captures |
| R2 Storage | $0.015/GB | Negligible at MVP scale (maybe 1GB) |
| R2 Operations | ~$0 | Minimal request volume |
| KV | $5/month (Workers paid includes KV) | 1GB storage, 10M reads, 1M writes |
| **Total** | **~$5/month** | Essentially just the Workers paid plan |

Compare this to alternatives:
- Hetzner CX22 VPS + Docker: ~EUR4/month, but you manage OS updates, Docker, Chrome binary, TLS certs, uptime monitoring, scaling. More ops burden for similar cost.
- AWS Lambda + Fargate (for Chrome): ~$15-30/month at MVP scale, plus operational complexity of managing two services, ECR, IAM roles, API Gateway.

The Cloudflare-native approach wins on both cost and operational simplicity.

---

## What About Fastly?

The project has a preference for Fastly alongside Cloudflare. For this MVP:

- Fastly Compute (their edge compute platform) supports WASM-compiled languages, not V8/JS natively. It could work via JS-to-WASM compilation, but it adds friction.
- Fastly has no equivalent to Browser Rendering.
- Fastly has no equivalent to R2 (no object storage product).

Fastly could serve as a CDN/edge cache layer in front of the verification endpoint later, but for MVP it adds complexity without value. The entire stack runs on Cloudflare with zero infrastructure to manage.

**Recommendation:** Use Cloudflare exclusively for MVP. Evaluate Fastly for the CDN/caching layer when traffic justifies it.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CF Browser Rendering limits hit (30 concurrent browsers) | Low for MVP | Capture queue backs up | Implement queuing in the Worker; request limit increase from CF |
| R2 bucket locks insufficient for legal admissibility | Medium (future) | Can't claim WORM compliance | Content-addressed keys provide application-level integrity; migrate to S3 Object Lock when legal admissibility is in scope |
| Cloudflare vendor lock-in | Medium (future) | Painful migration | Worker code is standard JS. R2 is S3-compatible. The main lock-in is Browser Rendering, but Puppeteer API is portable. |
| Browser Rendering pricing changes | Low | Cost increase | At $0.09/hour, even 10x price increase is manageable at MVP scale. Re-evaluate at scale. |
| Worker CPU time limit (30s) for complex captures | Low | Capture times out | Browser session time is I/O wait, not CPU time. Only hash computation counts against CPU limit, and that's fast. |

---

## Migration Path (Post-MVP)

If the product grows beyond what Cloudflare can handle:

1. **Capture service** can move to a container (Docker + Playwright on Cloud Run or Hetzner VPS) if Browser Rendering limits become a constraint. The Puppeteer API is nearly identical.
2. **Storage** can migrate from R2 to S3 with Object Lock for WORM compliance. S3-compatible API makes this mechanical.
3. **API + Verification** can stay on Workers indefinitely -- they're stateless and globally distributed.
4. **Metadata** can migrate from KV to a proper database if query patterns demand it.

The architecture is modular enough that each component can be migrated independently. No big-bang replatforming required.

---

## Summary: Recommended MVP Architecture

| Concern | Technology | Rationale |
|---------|------------|-----------|
| API server | Cloudflare Worker | Zero-ops, edge-distributed, JS-native, <300ms reads |
| Headless browser | CF Browser Rendering | Managed Chrome, Puppeteer API, no infra to maintain |
| Blob storage | Cloudflare R2 | Zero egress, bucket locks, S3-compatible, same network |
| Metadata | Workers KV | Simple key-value, globally replicated, included in Workers plan |
| TLS/DDoS | Cloudflare (built-in) | Automatic with Workers |
| Deployment | `wrangler deploy` (manual) | One command, add CI/CD when it hurts |
| CI/CD | Deferred | YAGNI. Add GitHub Actions when >1 developer or when manual deploys cause a problem |
| Infrastructure as Code | Not needed | No infrastructure to codify. Configuration is `wrangler.toml` (checked into git). |
| Monitoring | Cloudflare dashboard + Workers analytics | Built-in. Add structured logging when debugging becomes painful. |

**Total infrastructure cost: ~$5/month.**
**Total infrastructure to manage: zero servers, zero containers, zero certificates, zero scaling rules.**
**Deployment: one command.**

This is the simplest architecture that meets all requirements. A single developer can operate it without any DevOps knowledge beyond `wrangler deploy`.
