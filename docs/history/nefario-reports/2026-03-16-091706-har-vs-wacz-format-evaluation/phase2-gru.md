# Gru: HAR vs WACZ Format Evaluation for WRL

## TL;DR

HAR is **not a replacement** for WACZ/WARC -- it is a different tool for a
different job. WARC has ISO 28500 standardization and institutional adoption
across preservation organizations; HAR was abandoned by W3C and has zero legal
evidence pedigree. However, Playwright's `recordHar()` API is a low-cost way
to capture rich network data (full request/response bodies, timing, cookies,
headers for every sub-resource) that WRL currently lacks. The architecturally
sound move is a **hybrid approach**: use `recordHar()` to capture network data,
then embed the HAR JSON as an additional WARC metadata record inside the
existing WACZ container. This gets partial credit on three dropped backlog items
with minimal complexity. But there is a **blocking platform question**: whether
`recordHar()` works on Cloudflare Workers' `/tmp` filesystem needs a spike test
before any planning proceeds.

---

## (a) Spec Maturity and Legal Standing

### WARC/WACZ: Strong Legal Pedigree

| Attribute | Status |
|-----------|--------|
| Standard | WARC: ISO 28500:2009, revised 2017 |
| Maintainers | IIPC (International Internet Preservation Consortium), IETF |
| Institutional adoption | Library of Congress, British Library, BnF, National Library of Australia, Internet Archive |
| NARA mandate | WARC is the *only* acceptable format for long-term preservation of website records (Bulletin 2014-04) |
| WACZ signing | Harvard Library Innovation Lab (Scoop capture engine), Starling Lab (authenticated archives) |
| Legal use | Perma.cc (used by courts and law reviews for link rot prevention), Starling Lab evidence submissions |

**Ring: Adopt.** WARC is the ISO standard for web archiving. WACZ adds the
packaging, indexing, and signing layer that makes WARC bundles portable and
verifiable. WRL is already using both correctly.

### HAR: Industry Convention, Not a Standard

| Attribute | Status |
|-----------|--------|
| Standard | HAR 1.2 spec published 2011 as a "frozen" community spec |
| W3C status | **Abandoned.** Draft submitted to W3C Web Performance WG in 2012; never published as a Recommendation |
| Maintainers | No active standards body. Community-maintained spec at softwareishard.com |
| Institutional adoption | Zero preservation institutions. Used by browser DevTools, performance tools, HTTP Archive project |
| Legal standing | **None.** No court has recognized HAR as an evidence format. No chain-of-custody tooling exists |
| Evidence use | Not designed for evidence; designed for performance analysis and debugging |

**Ring: Hold (as an archive format).** HAR has no path to becoming an evidence
standard. It was designed for a fundamentally different purpose (performance
measurement, not preservation). Using HAR *as the archive format* would
undermine WRL's "evidence-grade" positioning.

**Ring: Adopt (as a data capture mechanism).** Every major browser and Playwright
support HAR recording natively. The *data* it captures is valuable even if the
*format* is not suitable as a primary archive container.

### Key Distinction

Legal admissibility of digital evidence depends on chain of custody, integrity
verification, and established forensic standards -- not the file format per se.
But format recognition matters for institutional acceptance. WARC/WACZ has this;
HAR does not. The question is not "which format?" but "can we capture HAR's
richer data and preserve it within WARC's established container?"

---

## (b) HAR as Replacement vs Complement

**Verdict: Complement, never replacement.**

| Dimension | HAR | WARC/WACZ |
|-----------|-----|-----------|
| Primary purpose | Performance analysis, debugging | Long-term preservation |
| Data model | HTTP transactions (request + response + timing) | Arbitrary web resources + metadata |
| Content scope | Network-level: every HTTP exchange the browser makes | Archive-level: resources + rendering output |
| Signing | None | Ed25519 / X.509 via WACZ-Auth |
| Integrity | None (plain JSON, trivially editable) | SHA-256 per record, signed bundle hash |
| ISO standard | No | Yes (ISO 28500) |
| Replay | Via browser DevTools or mock server | Via ReplayWeb.page, Wayback Machine, pywb |
| Compression | Not specified | WARC supports gzip per-record |
| Extensibility | `_custom` fields (convention only) | WARC record types (standardized extension) |

HAR captures *different data* than WARC, not *better data*. WARC can contain
everything HAR contains (as metadata records), but HAR cannot contain what WARC
provides (integrity, signing, institutional compatibility).

---

## (c) Playwright `recordHar()` vs Current WRL Capture

### What WRL Currently Captures

From `src/capture.js` (defaultRenderer + captureHeaders):

| Artifact | Source | What it contains |
|----------|--------|------------------|
| `screenshot.png` | `page.screenshot()` | Full-page visual capture |
| `rendered.html` | `page.content()` | DOM after JS execution |
| `headers.json` | Separate `fetch()` call | Status, statusText, response headers for main URL only |

**Critical gaps in current approach:**
1. `captureHeaders()` makes a *separate* HTTP request (not the browser's
   actual request) -- it may see different headers due to different UA,
   cookies, TLS negotiation, CDN routing, etc.
2. Only captures headers for the *main document* -- no sub-resource headers
3. No request headers captured (only response)
4. No timing data
5. No response bodies for sub-resources
6. No cookie exchange data
7. No redirect chain data (uses `redirect:'manual'`)

### What `recordHar()` Would Capture

Playwright's `recordHar()` records the *actual browser network traffic*:

| Data | Available | Notes |
|------|-----------|-------|
| Full request headers (per resource) | Yes | Including cookies, UA, referrer |
| Full response headers (per resource) | Yes | The actual headers the browser received |
| Response bodies | Yes (configurable) | `content: 'embed'` or `content: 'attach'` |
| Request bodies (POST data) | Yes | Form data, JSON payloads |
| HTTP timing (DNS, connect, TLS, wait, receive) | Yes | Per-resource breakdown |
| Redirect chains | Yes | Each hop is a separate entry |
| Cookie details | Yes | Domain, path, expiry, httpOnly, secure flags |
| Cache state | Yes | Before/after cache info per resource |
| Content MIME types and sizes | Yes | Actual vs. transferred size |

### Configuration Options in @cloudflare/playwright

```javascript
const context = await browser.newContext({
  recordHar: {
    path: '/tmp/capture.har',  // Must be /tmp on Workers
    mode: 'full',              // 'full' or 'minimal'
    content: 'embed',          // 'embed', 'attach', or 'omit'
    urlFilter: undefined,      // Optional: filter by URL pattern
  },
});
```

Key options:
- `mode: 'full'` -- captures everything (timing, cookies, security, etc.)
- `content: 'embed'` -- embeds response bodies inline as base64 in the HAR JSON
- `content: 'omit'` -- captures metadata without bodies (much smaller output)
- `content: 'attach'` -- stores bodies as separate files in a ZIP (requires `.zip` path extension)

### Platform Constraint: Cloudflare Workers Filesystem

**This is the blocking unknown.** Playwright's `recordHar()` writes to the
filesystem. On Cloudflare Workers, `fs` only supports writing into `/tmp`.
The documentation confirms `/tmp` works for tracing (`/tmp/trace.zip`), which
is architecturally similar to HAR recording. However:

1. `/tmp` size limits are undocumented for Browser Rendering
2. HAR files with embedded content can be large (all sub-resource bodies)
3. No confirmed production usage of `recordHar()` on @cloudflare/playwright
4. The "not yet fully supported" features list does not mention HAR (neither
   as supported nor unsupported), and Cloudflare notes the list is "not exhaustive"

**This needs a spike test before any architectural commitment.**

---

## (d) Ecosystem Tooling

### WARC/WACZ Ecosystem

| Tool | Purpose | Maturity |
|------|---------|----------|
| ReplayWeb.page | Client-side WACZ replay | Production (Webrecorder) |
| pywb | Server-side WARC replay | Production (Internet Archive) |
| Heritrix / Browsertrix | WARC crawlers | Production |
| wacz-auth | Signing and verification | Emerging (Harvard LIL) |
| py-wacz | WACZ creation/validation in Python | Production |
| cdxj-indexer | CDXJ index generation | Production |
| Wayback Machine | WARC replay at scale | Production (billions of records) |

### HAR Ecosystem

| Tool | Purpose | Maturity |
|------|---------|----------|
| Chrome DevTools | HAR recording/viewing | Production |
| Firefox DevTools | HAR recording/viewing | Production |
| Playwright | HAR recording/replay | Production |
| Charles Proxy | HAR export | Production |
| har-validator | HAR schema validation | npm package, maintained |
| har-to-warc | HAR to WARC conversion | Available but niche |
| Google HAR Analyzer | Performance analysis from HAR | Production |

### Key Observation

HAR tooling is *developer-oriented* (debugging, testing, performance). WARC
tooling is *preservation-oriented* (archiving, replay, legal). There is
essentially no overlap. This reinforces the "complement, not replacement"
conclusion.

---

## (e) Hybrid Approach Assessment

### Proposed Architecture

```
  Playwright BrowserContext
  +------------------------------------------+
  |  recordHar: { path: '/tmp/capture.har',  |
  |               mode: 'full',              |
  |               content: 'omit' }          |
  |                                          |
  |  page.goto(url)                          |
  |  page.screenshot()                       |
  |  page.content()                          |
  +------------------------------------------+
            |
            v
  Read /tmp/capture.har (JSON)
            |
            v
  Strip sensitive data (Set-Cookie values, etc.)
            |
            v
  Pass to buildWarc() as additional artifact:
    artifacts.har = harJsonString
            |
            v
  warc.js: new WARC metadata record
    WARC-Type: metadata
    Content-Type: application/json
    WARC-Target-URI: <url>
    (body: sanitized HAR JSON)
            |
            v
  Existing WACZ pipeline unchanged
  (datapackage.json gets one more resource entry)
```

### Why `content: 'omit'`

Embedding all sub-resource response bodies would massively inflate the WACZ
bundle. For evidence purposes, what matters is:
- Which resources were loaded (URLs, MIME types, sizes)
- What headers were exchanged (request AND response)
- Timing data (proves contemporaneous capture)
- Redirect chains (proves what the browser actually followed)
- Cookie exchanges (proves session state)

The rendered HTML + screenshot already capture the *content outcome*. The HAR
without bodies captures the *network provenance* -- what the browser talked to
and how. This is the data the dropped backlog items were asking for.

### What This Addresses from Dropped Items

| Dropped Item | Coverage via HAR | Notes |
|--------------|-----------------|-------|
| Full HTTP exchange capture | ~80% | Full request+response headers for every resource. Missing: raw TCP/TLS data |
| Resource manifest (CSS/JS/images) | ~90% | HAR entries list every loaded resource with URL, MIME type, size, timing |
| Network timing capture | 100% | HAR timing object has DNS/connect/TLS/wait/receive per resource |
| Certificate info capture | 0% | HAR does not capture TLS certificate details |
| Sub-resource archiving | 0-100% | `content: 'omit'` = 0%; `content: 'embed'` = 100% but at significant size cost |

### Architectural Risks

1. **Platform risk (HIGH)**: `recordHar()` may not work on Cloudflare Workers.
   If `/tmp` write fails or if HAR recording is in the "not yet supported"
   category, the entire approach is blocked. Spike test required.

2. **Size risk (MEDIUM)**: Even with `content: 'omit'`, a HAR file for a
   complex page with 200 sub-resources could be 200-500KB of JSON. With
   `content: 'embed'`, it could be multiple MB. This affects the 30-second
   `ctx.waitUntil` budget (ZIP assembly, SHA-256 hashing, R2 upload).

3. **Privacy risk (LOW-MEDIUM)**: HAR captures cookies, auth headers, and
   potentially sensitive request data. The existing `captureHeaders()` already
   redacts Set-Cookie. HAR sanitization would need to be equally thorough --
   and applied across potentially hundreds of entries, not just one.

4. **Timing budget risk (MEDIUM)**: Reading back the HAR file from `/tmp`,
   parsing it, sanitizing it, and encoding it into a WARC record all add
   time to the capture pipeline. Current pipeline already operates within
   tight margins (25s navigation timeout in a 30s budget).

5. **Complexity risk (LOW)**: The change is well-contained -- add `recordHar`
   to `newContext()`, read the file back, pass as artifact to `buildWarc()`,
   add one WARC record. No new dependencies. No architectural changes to the
   WACZ pipeline.

### What This Does NOT Replace

The separate `captureHeaders()` fetch should be kept even if HAR recording is
added. Reasons:
- It captures the server's response to a *non-browser* client (different
  perspective, complementary evidence)
- It works independently of `recordHar()` (graceful degradation)
- Removing it is a breaking change to the WACZ structure

---

## Recommendations

### 1. Do NOT switch from WACZ to HAR

**Ring: Hold** for HAR as a primary archive format.

HAR lacks standardization, integrity mechanisms, signing support, and
institutional recognition. Switching would be a significant regression in
WRL's evidence-grade positioning. The WACZ investment is sound and should be
maintained.

### 2. DO investigate Playwright HAR recording as a data enrichment

**Ring: Assess** (pending spike test; upgrade to Trial if spike succeeds).

The `recordHar()` API is a near-zero-cost way to capture network-level data
that WRL currently lacks. The data maps directly to three dropped backlog items.
The hybrid approach (HAR data embedded as WARC metadata) is architecturally
clean.

### 3. Spike test first, plan second

**Proposed spike scope:**
- Add `recordHar: { path: '/tmp/capture.har', mode: 'full', content: 'omit' }`
  to the `newContext()` call in `defaultRenderer()`
- After `context.close()`, attempt to read `/tmp/capture.har` via `node:fs`
- Deploy to Cloudflare Workers and test against 3-5 real URLs
- Measure: Does it work? What is the file size? What is the timing impact?
- This spike should take < 1 day

**If spike succeeds:**
- Upgrade to Trial ring
- Plan the WARC metadata record integration (estimated: S-M sized work item)
- Add HAR sanitization (redact Set-Cookie values, Authorization headers,
  sensitive query parameters)
- Re-evaluate the three dropped backlog items with "partially addressed via
  HAR recording" annotation

**If spike fails:**
- Stay on current architecture
- The dropped items remain dropped for the right reasons (complexity)
- Revisit when Cloudflare expands Browser Rendering filesystem capabilities

### 4. Re-evaluation timeline

- Spike: immediate (can be done in next development cycle)
- If spike succeeds: Trial for 2-3 phases, then decide on Adopt
- Re-evaluate HAR spec status: 12 months (no movement expected)
- Re-evaluate WACZ: no action needed (stable, well-invested)

---

## Proposed Tasks

1. **Spike: Playwright `recordHar()` on Cloudflare Workers** -- S-sized.
   Test whether `recordHar()` writes to `/tmp` and can be read back in the
   Workers runtime. Measure file sizes and timing impact. This gates all
   subsequent work.

2. **If spike passes: HAR sanitization module** -- S-sized. Strip
   Set-Cookie values, Authorization headers, and configurable sensitive
   fields from HAR JSON before embedding in WARC.

3. **If spike passes: WARC metadata record for HAR data** -- S-sized. Add
   a new WARC metadata record type to `warc.js` that embeds the sanitized
   HAR JSON. Update `wacz.js` resource manifest accordingly.

4. **Backlog annotation** -- XS-sized. Update `docs/backlog.md` dropped
   items with notes on partial coverage via HAR recording (if spike passes).

---

## Risks and Concerns

| Risk | Severity | Mitigation |
|------|----------|------------|
| `recordHar()` does not work on Cloudflare Workers `/tmp` | HIGH | Spike test before any commitment. If it fails, the entire HAR approach is blocked with no wasted investment. |
| HAR file size exceeds `/tmp` capacity on complex pages | MEDIUM | Use `content: 'omit'` (no response bodies). Enforce MAX_SUBRESOURCES limit (already in place at 200). Measure in spike. |
| HAR sanitization misses sensitive data | MEDIUM | Define explicit allowlist of headers to preserve (not blocklist). Security-minion review of sanitization logic. |
| Timing budget exceeded (30s ctx.waitUntil) | MEDIUM | Measure in spike. HAR reading/parsing adds ~10-50ms for typical files. If tight, make HAR recording optional/degradable like current WACZ bundling. |
| HAR format changes break parsing | LOW | HAR 1.2 has been frozen since 2011. Playwright's output is stable. No format evolution expected. |

---

## Additional Agents Needed

- **edge-minion**: To execute the spike test on Cloudflare Workers and measure
  `/tmp` filesystem behavior, HAR file sizes, and timing impact within the
  Browser Rendering runtime.
- **security-minion**: To review HAR sanitization requirements -- HAR captures
  significantly more sensitive data (cookies, auth headers, POST bodies) than
  the current `captureHeaders()` flow. Need a threat model for what to strip
  vs. preserve.
- **margo (code review)**: To review the WARC metadata record integration for
  spec compliance -- ensure the new record type and CDXJ index entries conform
  to WARC/1.1 and WACZ 1.1.1.
