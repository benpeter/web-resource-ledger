# IAC Minion -- HAR Recording Feasibility on Cloudflare Workers

## Summary

Playwright's `recordHar()` is architecturally incompatible with `@cloudflare/playwright` on Cloudflare Workers. The HAR recording pipeline depends on `node:fs` filesystem writes at multiple critical points, and the Workers runtime does not provide a real filesystem. Even if the recording could be made to work, the resulting HAR files (with embedded response bodies) would likely exceed the Worker's memory limits for non-trivial pages. WRL is not currently using Playwright's HAR recording -- it builds its own WARC records from captured artifacts.

---

## Detailed Analysis

### (a) Does `@cloudflare/playwright` support `browserContext.recordHar()`?

**No, not in any usable way.** The analysis of the `@cloudflare/playwright@1.1.2` source code reveals three blocking incompatibilities:

1. **`HarRecorder` requires a real filesystem.** The server-side `HarRecorder` (in `lib/playwright-core/src/server/har/harRecorder.js`) constructs an `Artifact` whose `localPath` is computed as `path.join(context._browser.options.artifactsDir, ...)`. When flushing, it calls `fs.writeFileSync()` (for zip mode) or `fs.promises.writeFile()` (for uncompressed mode) to write the HAR data to disk. Workers do not have a writable filesystem -- `node:fs` operations are shimmed through `unenv` and will fail at write time.

2. **`harExport()` returns an `Artifact` that references a file path.** The client-side export flow (`browserContext.js` lines 415-428) calls `this._channel.harExport()`, gets back an `Artifact`, then calls `artifact.saveAs(path)`. The `saveAs` implementation on the server side (`artifact.js` line 58) uses `saveCallback(this._localPath)` which copies from one filesystem location to another. On the client side, the remote path uses `fs.createWriteStream()`. Both paths require filesystem access.

3. **Uncompressed HAR explicitly blocked for thin clients.** The client-side code at line 423 throws: `"Uncompressed har is not supported in thin clients"`. The `@cloudflare/playwright` connection model is in-process (not technically a "thin client"), but the underlying Playwright code treats connections without `localUtils` as thin. The `createInProcessPlaywright()` call in `lib/index.js` passes no `localUtils` argument to the `Connection` constructor, meaning `this._connection.localUtils()` returns `undefined/null`, which blocks the uncompressed HAR codepath.

4. **`routeFromHAR()` is also blocked.** Both `BrowserContext` and `Page` throw `"Route from har is not supported in thin clients"` when `localUtils` is absent.

**Bottom line:** Even though `@cloudflare/playwright` includes all the Playwright HAR code in its bundle, the code paths are inoperable on Workers. The `recordHar` option on `browser.newContext({ recordHar: { path: '...' } })` would attempt filesystem operations that will crash.

### (b) Storage and memory implications of HAR files

Even if the filesystem issue were solved (e.g., by streaming to an in-memory buffer), HAR files with full response bodies are significantly larger than WRL's current artifact set:

- **HAR captures all subresource bodies.** A HAR file in `"full"` mode embeds every HTTP response body (images, scripts, stylesheets, fonts) as base64-encoded strings. For a typical web page that loads 50-100 subresources, this easily reaches 5-30 MB of base64 content.
- **Base64 encoding inflates by ~33%.** A page with 10 MB of binary assets would produce ~13 MB of HAR JSON just for the bodies.
- **Worker memory limit is 128 MB.** The current capture pipeline already holds: a full-page PNG screenshot (can be several MB), the rendered HTML (typically <1 MB), HTTP headers (negligible), and the WACZ assembly buffers. Adding a full HAR file risks memory pressure, especially for media-heavy pages.
- **WRL already limits pages to 50 MB total and 200 subresources.** These limits help, but a page at those limits would produce a HAR file in the 30-60 MB range (with base64 inflation), which is a significant fraction of the 128 MB Worker memory budget.
- **The 30s `ctx.waitUntil` budget.** HAR recording adds serialization overhead at context close time. The `HarRecorder.flush()` method must finalize all entries, serialize to JSON, and optionally zip. For large HAR files, this serialization time is non-trivial and eats into the already-tight 5s headroom between the 25s NAV_TIMEOUT and the 30s `ctx.waitUntil` deadline.

### (c) Where does the HAR file land?

In standard Playwright: the HAR file lands on the local filesystem, at the path specified in `recordHar.path`.

In `@cloudflare/playwright` on Workers:

- **There is no real filesystem.** The `node:fs` module is polyfilled via `unenv` (part of `@cloudflare/unenv-preset`), but these polyfills are stubs that throw or no-op on write operations.
- **The `artifactsDir` is set to `/tmp/tests`** (seen in `lib/internal.js` for the test runner), but this path does not exist in the Worker runtime outside of the test framework.
- **The HarRecorder constructs an `Artifact` at `path.join(artifactsDir, guid + '.har')`**, then attempts `fs.writeFileSync()` or `fs.promises.writeFile()` to that path during `flush()`. Both will fail.
- **The in-process architecture** (`createInProcessPlaywright`) means the server-side code runs in the same isolate as the client-side code -- both are in the Worker. There is no separate browser server process with its own filesystem. The HAR recording, flushing, and artifact saving all happen within the Worker's V8 isolate.

**Theoretical workaround:** One could monkey-patch `HarTracer` to accumulate entries in memory and export them as a buffer rather than writing to disk. But this would require forking `@cloudflare/playwright` or adding significant wrapper code -- well beyond a configuration change.

### (d) Would HAR recording conflict with `context.route('**/*')`?

**Yes, it would create complex interactions.** Analysis of both code paths:

- **WRL's route interceptor** (`capture.js` lines 295-318) uses `context.route('**/*')` to block cross-domain navigation and enforce subresource/size limits via `route.continue()` and `route.abort()`.
- **`HarTracer`** (`harTracer.js`) registers event listeners on `BrowserContext` for request/response events, including `BrowserContext.Events.Request`, `BrowserContext.Events.Response`, and frame navigation events.
- **Both systems observe the same request pipeline.** HarTracer hooks into the lower-level network events (CDP-level), while `context.route()` operates at the request interception layer. In standard Playwright, they coexist because `route.continue()` passes the request through and HAR traces the underlying network events.
- **Aborted requests would create partial HAR entries.** When WRL aborts requests (cross-domain navigation, subresource limit, size limit), the HarRecorder would see those as failed/incomplete entries. The resulting HAR file would contain entries without response bodies or with error states -- not a clean archive.
- **The interplay is untested on Workers.** Since `@cloudflare/playwright` has never supported HAR recording, the interaction between route interception and HAR tracing has not been validated in the Workers CDP-over-WebSocket model.

---

## Recommendations

### R1: Do not attempt native Playwright `recordHar()` on Workers

The approach is blocked by filesystem dependencies at multiple levels of the Playwright internals. This is not a configuration issue -- it is an architectural mismatch between Playwright's HAR recording design (filesystem-centric) and Workers' execution model (no filesystem).

### R2: If HAR output is desired, build it from existing captured data

WRL already intercepts all requests via `context.route('**/*')` and monitors responses via `page.on('response', ...)`. These event streams contain the same data that `HarTracer` captures. A custom HAR builder could:

1. Collect request/response metadata from the existing route interceptor and response listener
2. Optionally capture response bodies (careful: memory implications per analysis above)
3. Serialize to HAR 1.2 JSON format in-memory
4. Store to R2 alongside existing artifacts

This would be a pure application-level solution that stays within Workers constraints. However, it duplicates functionality that already exists in the WACZ pipeline (WARC records contain the same information, structured differently).

### R3: Evaluate whether the format question (WACZ vs HAR) should be answered at the storage/export layer, not the capture layer

The capture pipeline already collects: screenshot (PNG), rendered HTML, HTTP headers. The WACZ format wraps these in WARC records with a signed manifest. If HAR is desired as an output format, it could be generated from the same source data at retrieval/export time rather than at capture time. This avoids the real-time memory and timing constraints of the capture pipeline.

### R4: Consider response body capture separately from format choice

The key functional difference between WRL's current WACZ (which contains rendered HTML + screenshot + headers) and a full HAR (which would contain all subresource bodies) is **response body capture**. If the goal is to archive subresource content:
- This requires intercepting response bodies during page load (via `route.fulfill()` patterns or CDP interception)
- The memory implications are significant (see section b)
- The current 200-subresource and 50 MB limits would need to account for in-memory body buffering
- This is independent of whether the output format is WACZ or HAR

---

## Proposed Tasks

| # | Task | Effort | Dependency |
|---|------|--------|------------|
| 1 | Document that Playwright HAR recording is not feasible on Workers (decision record) | S | None |
| 2 | If HAR format is needed: build a lightweight in-memory HAR serializer from existing request/response events | M | Requires scope decision on response body capture |
| 3 | If response body capture is needed: extend route interceptor to buffer response bodies with memory-aware limits | L | Architecture decision on memory budget |
| 4 | If HAR is needed as export format: build HAR generation from stored WACZ/artifact data at retrieval time | M | None |

---

## Risks and Concerns

### Hard Blockers

1. **`@cloudflare/playwright` HAR recording is non-functional on Workers.** The `node:fs` dependency chain in `HarRecorder -> Artifact -> fs.writeFileSync/fs.promises.writeFile` cannot be satisfied. This is not a bug -- it is a fundamental design assumption in Playwright (HAR goes to disk).

2. **No Cloudflare roadmap visibility.** There is no public indication that Cloudflare intends to add HAR recording support to their Playwright Workers binding. The `unsupportedOperations.js` file only blocks `launch`, `launchPersistentContext`, `launchServer`, and `connect` -- HAR-related operations are not explicitly blocked because they fail naturally via filesystem errors.

### Operational Risks (if HAR recording were somehow made to work)

3. **Memory pressure.** Full HAR files with embedded response bodies could consume 30-60% of the Worker's 128 MB memory limit for complex pages, leaving insufficient headroom for the screenshot, HTML, and WACZ assembly.

4. **Timing budget.** HAR serialization during `context.close()` adds latency that competes with the 30s `ctx.waitUntil` budget. The current pipeline uses 25s for navigation + ~5s for screenshot/HTML/WACZ. HAR serialization for a large page could consume 1-3s of that headroom.

5. **Partial captures from aborted requests.** The safety limits (`context.route('**/*')` blocking cross-domain and enforcing subresource limits) would produce HAR files with incomplete entries, reducing their archival value.

---

## Additional Agents Needed

- **data-minion**: Should evaluate whether HAR 1.2 or WACZ 1.1 is the better archival format for WRL's use case, considering: legal admissibility, tooling ecosystem, replay capabilities, and long-term preservation standards. The format choice is a data architecture decision, not an infrastructure one.
- **gru**: Should weigh in on whether response body capture (the key functional delta between current WACZ and full HAR) is in scope for MVP or should remain on the backlog. This is a product scope decision with significant engineering cost.
