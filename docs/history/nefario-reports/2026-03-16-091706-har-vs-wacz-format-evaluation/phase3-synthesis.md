# Advisory Report: HAR Format Evaluation for WRL

**Question**: Should WRL switch its archive format to HAR? Is WRL already taking advantage of Playwright's HAR recording capability?
**Confidence**: HIGH
**Recommendation**: Do not switch to HAR. Do not attempt Playwright's native `recordHar()` on Cloudflare Workers -- it is non-functional. If richer network metadata is desired in the future, build an application-level HAR serializer from existing request/response events already flowing through the route interceptor.

## Executive Summary

WRL should stay on WACZ/WARC. The format question is settled: WARC has ISO 28500 standardization, institutional adoption (Library of Congress, Internet Archive, British Library), Ed25519 signing support, and chain-of-custody tooling. HAR has none of these -- it was abandoned by W3C in 2012 and has zero legal evidence pedigree. Switching would be a significant regression in WRL's evidence-grade positioning.

WRL is **not** using Playwright's `recordHar()`, and it **cannot** -- iac-minion's source-code analysis of `@cloudflare/playwright@1.1.2` identifies three independent blockers: `HarRecorder.flush()` calls `fs.writeFileSync()` (unavailable on Workers), the Artifact model assumes filesystem paths for save/export, and `localUtils` is null in the in-process Playwright connection (blocking the uncompressed HAR codepath entirely). This is not a configuration gap or an untested edge case -- it is an architectural incompatibility between Playwright's filesystem-centric HAR design and Workers' execution model.

The valuable insight from this evaluation is not about format switching but about data enrichment. WRL's current capture pipeline has real gaps: `captureHeaders()` makes a separate fetch (different from the browser's actual request), captures only the main document's response headers, and records no timing, cookies, redirect chains, or sub-resource metadata. These gaps map to five items in the Dropped Items section of the backlog. If WRL ever needs richer network provenance, the path forward is an application-level serializer built on the request/response events already flowing through `context.route('**/*')` and `page.on('response')` -- not Playwright's native HAR API.

## Team Consensus

1. **HAR is not a replacement for WACZ/WARC.** Both specialists agree the formats serve fundamentally different purposes (performance analysis vs. preservation). HAR lacks standardization, integrity mechanisms, signing, and institutional recognition.
2. **WRL is not using Playwright HAR recording.** The current pipeline (`src/capture.js`) captures screenshots, rendered HTML, and HTTP headers via a separate fetch. No HAR recording is configured.
3. **The data HAR captures is valuable even if the format is not.** Full request/response headers per sub-resource, timing data, redirect chains, and cookie exchanges are genuine gaps in WRL's current capture. Both specialists acknowledge these gaps.
4. **Memory and timing budgets are tight.** The current pipeline operates within a 30s `ctx.waitUntil` budget with 25s allocated to navigation. Any data enrichment must fit within the remaining ~5s headroom. Worker memory is capped at 128 MB, and the current artifact set (screenshot + HTML + WACZ assembly) already consumes a meaningful share.
5. **The separate `captureHeaders()` fetch should be kept.** It provides a complementary perspective (server response to a non-browser client) and serves as graceful degradation if any future enrichment mechanism fails.

## Dissenting Views

- **Spike test feasibility**: gru recommended a spike test to determine whether `recordHar()` works on Cloudflare Workers' `/tmp` filesystem, noting that tracing (`/tmp/trace.zip`) works and is architecturally similar. iac-minion countered with definitive source-code evidence: `HarRecorder.flush()` calls `fs.writeFileSync()`, the Artifact model uses `saveCallback(this._localPath)` which copies between filesystem locations, and `createInProcessPlaywright()` passes no `localUtils` (causing the uncompressed HAR path to throw `"Uncompressed har is not supported in thin clients"`). **Resolution: iac-minion's analysis is dispositive.** The blockers are at the source-code level, not the platform-capability level -- the code will fail before it ever reaches `/tmp`. A spike test would confirm what the source already proves. gru's observation about tracing working on `/tmp` is valid but irrelevant: tracing uses a different code path (`Tracing` class) that was explicitly adapted for Workers, while HAR recording was not. No spike test is needed; the answer is already known.

## Supporting Evidence

### Standards and Legal Standing (gru)

WARC is ISO 28500:2009 (revised 2017), maintained by IIPC and IETF, mandated by NARA (Bulletin 2014-04) as the only acceptable format for long-term website preservation. It is used by Perma.cc for court citations and by Starling Lab for authenticated evidence submissions. HAR 1.2 was frozen in 2011 as a community spec. Its W3C draft was never published as a Recommendation. No preservation institution uses it. No court has recognized it as an evidence format. WRL's WACZ investment (Ed25519 signing, CDXJ indexing, WARC record assembly) is aligned with the institutional standard.

### Platform Incompatibility (iac-minion)

Three independent blockers in `@cloudflare/playwright@1.1.2`:

1. **Filesystem dependency**: `HarRecorder` -> `Artifact` -> `fs.writeFileSync()` / `fs.promises.writeFile()`. Workers' `node:fs` is polyfilled via `unenv` with stubs that throw on write operations.
2. **Artifact model**: `harExport()` returns an `Artifact` with a `localPath`. Both server-side `saveAs()` (copies files) and client-side `saveAs()` (uses `fs.createWriteStream()`) require filesystem access.
3. **Thin client guard**: `createInProcessPlaywright()` passes no `localUtils`, so `this._connection.localUtils()` returns null, and the code throws `"Uncompressed har is not supported in thin clients"` before reaching any filesystem operation.

Additionally, `routeFromHAR()` (HAR-based request mocking) is also blocked by the same `localUtils` absence.

### Current Capture Gaps

WRL's `captureHeaders()` (lines 189-222 of `src/capture.js`) makes a separate `fetch()` with a different User-Agent (`WRL/0.1`), different TLS negotiation, and `redirect:'manual'`. It captures only the main document's response headers. The route interceptor (`context.route('**/*')`, lines 295-318) and response listener (`page.on('response')`, lines 323-329) already observe every sub-resource request and response but only extract `content-length` for the size budget -- they discard all other metadata.

### Alternative Path: Application-Level Serializer

If richer network metadata is ever needed, WRL already has the event streams to build it. The route interceptor sees every request (URL, headers, resource type). The response listener sees every response (status, headers). Building a lightweight in-memory HAR 1.2 serializer from these existing hooks would:

- Stay within Workers constraints (no filesystem, no Playwright internals)
- Capture the browser's actual request/response headers (not a separate fetch)
- Add timing data via `performance.now()` deltas
- Record redirect chains from navigation request sequences
- Fit naturally as a WARC metadata record inside the existing WACZ container

This is an M-sized work item that does not require any Playwright HAR APIs.

## Risks and Caveats

1. **The application-level serializer path is untested.** While the data is available in the route interceptor and response listener, serializing it into HAR 1.2 format during capture adds memory allocation and serialization time. The ~5s headroom between navigation timeout and `ctx.waitUntil` deadline is not generous.
2. **Cloudflare could add HAR support in a future `@cloudflare/playwright` release.** If they do, the native API would be simpler than a custom serializer. However, there is no public roadmap indication this is planned, and the architectural changes required (in-memory HAR accumulation, buffer export instead of file export) would be non-trivial on Playwright's side.
3. **HAR sanitization is harder than header sanitization.** Current `captureHeaders()` redacts only `Set-Cookie` on one response. A HAR file covering 200 sub-resources would need sanitization across hundreds of entries, covering cookies, `Authorization` headers, sensitive query parameters, and POST body data. The sanitization surface area is an order of magnitude larger.
4. **The five dropped backlog items were dropped for good reasons.** "Full HTTP exchange capture", "sub-resource archiving", "certificate info capture", "network timing capture", and "resource manifest" were all assessed and dropped as beyond current scope. Partially addressing them via HAR data does not change the scope decision -- it creates a maintenance commitment for partial coverage.

## Next Steps

If the recommendation is adopted (stay on WACZ, do not pursue HAR recording):

1. **Document the decision.** Add an evolution log entry recording the format evaluation, the `recordHar()` incompatibility finding, and the decision to stay on WACZ. This prevents the question from being re-litigated without new evidence.
2. **Annotate dropped backlog items.** Add a note to the five capture-fidelity dropped items: "Evaluated HAR recording path (Phase NNNN); blocked by `@cloudflare/playwright` filesystem dependency. Application-level serializer is a viable future path if demand emerges."
3. **No code changes.** The current capture pipeline is unchanged. No spike test, no feature branch, no new dependencies.
4. **Revisit trigger.** Re-evaluate if (a) Cloudflare announces native HAR support in `@cloudflare/playwright`, or (b) a concrete user or integration partner requests richer network metadata in capture artifacts.

## Conflict Resolutions

**Spike test vs. source-code analysis**: gru recommended a spike test for `recordHar()` on Workers. iac-minion provided definitive source-code evidence that the code paths are inoperable (three independent blockers at the code level, not the platform level). Resolution: iac-minion's analysis supersedes the need for a spike test. The blockers are deterministic -- `fs.writeFileSync()` will throw, `localUtils` is null, `Artifact.saveAs()` requires filesystem paths. A spike test would confirm the failure but not reveal anything the source code analysis hasn't already shown. The recommendation is to skip the spike and treat the incompatibility as a known fact.
