# Changelog

All notable changes to the WRL API are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions before 1.0.0 were pre-release. Breaking changes were shipped as minor
versions per [SemVer convention](https://semver.org/spec/v2.0.0.html#spec-item-4).

## [Unreleased]

### Changed

- A page that has not finished loading after 20 seconds gets the same steps as one that has, before WRL captures it as `partial`: the wait for open requests, the scroll that loads lazy images, and the cookie banner step, so `captureSettings.consent` is there and `render.stages` has `settleMs`, `scrollMs` and `consentMs`. Before, WRL took one screenshot the moment the 20 seconds were up, so such captures could show a cookie banner and unloaded images

### Fixed

- On a site that reloads itself once its cookie banner is declined (theguardian.com), the capture's screenshot and HTML showed the page halfway through reloading, with most images missing, while the screenshot from before the banner had them all. WRL now waits for the page to come to rest after a banner is dismissed, and after a reload scrolls it again, before the second screenshot. `render.stages.postConsentMs` has the time that took
- The SWGDE alignment page said partial captures skip the cookie banner step, which is no longer so, and named that step as the only thing WRL does to a page. It now lists all three (the scroll, loading lazy images at once, which shows as `loading="eager"` in the stored HTML, and declining cookies) and what WRL blocks (service workers, navigation to another site, requests past 2000)
- A page that timed out and was blank, or showed a Cloudflare bot check, was stored as a partial capture and counted. It now fails with the same reason as a page that finished loading ("The page loaded but showed nothing (blank page)")

## [1.5.0] - 2026-11-15

### Added

- A capture records the HTTP status the site answered WRL's browser with, as `render.httpStatus` (signed into the WACZ `captureQuality`). When it is 400 or higher, the verification page, the dashboard and MCP `get_capture` and `verify_capture` say that the capture shows an error answer, which can be an error page or a block page. Before, a block page such as "Access Denied" was stored as a full capture with nothing to tell it from the real page. A blank page that came with an error status fails with "The site answered HTTP 403 and the page showed nothing (blank page)"
- A verification link pasted into Slack, Teams, LinkedIn, X, WhatsApp, Discord, Telegram, Mastodon or Bluesky shows a preview card that names the captured page and the capture time ("Verified capture of example.com/pricing"). The verification page has Open Graph and Twitter tags for it, and those services get the page instead of JSON although they ask for `*/*`. The card image is the Web Resource Ledger card, never the screenshot
- `openapi.yaml` describes webhook deliveries in an OpenAPI 3.1 `webhooks` section: the request WRL sends to your endpoint, its five headers and the `WebhookEventPayload` body, and what WRL does with your answer. The API reference shows it as "Event delivery to your endpoint" under Webhooks
- `/.well-known/security.txt` (RFC 9116) on webresourceledger.com names the reporting channel and points to `SECURITY.md`; `api.`, `verify.` and `docs.webresourceledger.com` redirect to it

### Changed

- A page can make 2000 requests instead of 500 while WRL loads it, so front pages of large news sites (around 1000 requests) are captured whole. A page past the cap is captured as `partial` with what loaded before it, and `render.subresourceLimitReached` says so (also signed into the WACZ `captureQuality`, shown on the verification page and in MCP `get_capture`). Before, such a page failed with "Page exceeded 500 subresource limit" when it finished loading within 20 seconds and was captured as partial when it didn't, so pages like nytimes.com failed on some runs and not on others. A page over 50 MB now fails either way; before, it was captured as partial when it also timed out
- Captures use `@cloudflare/playwright` 1.4.0 (Playwright 1.62), which talks plain CDP to Cloudflare Browser Run instead of its own chunked protocol. The Worker loads it only when a capture opens a browser, so requests that never capture (the API, verify pages, `/health`) start faster than before

### Fixed

- The MCP endpoint answers `resources/list`, `resources/templates/list` and `prompts/list` without a key with "method not found" instead of 401. WRL offers tools only, and MCP directories that ask for all three lists read the 401 as a server that needs sign-in before it says what it has
- webresourceledger.com printed typed double hyphens in every page title ("Privacy Policy -- Web Resource Ledger"), in the homepage text, in the FAQ structured data that search engines show, and in `llms.txt`. Titles now use " — Web Resource Ledger", like the docs titles; the homepage sentences use a comma, colon, semicolon, parentheses or a new sentence
- The API reference printed 45 typed double hyphens from `openapi.yaml` descriptions, such as "Store this value now -- it cannot be retrieved after this response". Response descriptions now use the "Service Unavailable — service is at capacity" form the rest of the spec uses, and other descriptions a comma, colon, semicolon or parentheses
- Docs pages printed a typed double hyphen wherever a dash was meant, on 123 lines such as "the brief window where both keys are valid is safe -- old captures remain accessible"; they now use a comma, colon, semicolon, parentheses or a new sentence. Limits & Quotas also says plainly that each URL of a batch counts against the rate limit
- The webhooks guide linked the captures list endpoint with an anchor (`#tag/captures/GET/v1/captures`) that the API reference page doesn't have, so the link opened the top of the page instead of `GET /v1/captures`
- The API reference didn't describe the extra fields of problem responses (`limitType` and `quota` on a 429, `threatTypes` on a 422 from threat screening, `quarantineReason` and `quarantinedAt` on a 451), so clients generated from `openapi.yaml` dropped them. It also left out the 451 that `GET /v1/verify/{captureId}` and the diff route answer for a quarantined capture, and its 451 examples gave a `detail` WRL doesn't send
- Broken links: Data Retention linked to Authentication and Security pages under `/security/` that don't exist, and the subprocessors page linked to DigiCert's and Coralogix's privacy policies at addresses that now answer 404
- The Security and Compliance overview left the emailed sign-in link out of the authentication methods the whitepaper covers, and referred to "Section on Operational Model" of the incident response policy without a link
- The subprocessors page put Coralogix's EU2 region in Frankfurt; it is AWS eu-north-1 in Stockholm, also in the EU
- Why Captures Fail left out "Queue dispatch failed", the error of a capture WRL accepted but couldn't put in its capture queue, and the form "<last attempt's reason>. WRL then lost track of the capture." of a capture still pending after 24 hours; the API reference and the MCP guide quoted only the shorter form
- The privacy policy said usage counters are kept for the current and previous billing periods; WRL keeps the current period and the 12 before it, as the Data Retention page says. It also said sign-in link hashes are deleted after use; they are deleted a day after the link expires
- The security whitepaper left out Pirsch, which receives the raw IP of page views and sign-ups and doesn't store it, and said IPs are pseudonymized before they reach any analytics system. It also said `VERIFY_RATE_LIMITER` is per tenant (it is per IP, except for MCP `verify_capture`) and `AUTH_RATE_LIMITER` counts failed sign-ins (it counts every request), that quarantined artifacts stay intact (they answer 451 and are purged 90 days after quarantine), that email addresses are stored only for notification opt-ins, and that there are 9 alert rules (there are 11); the dashboard sign-in heading named a browser extension that doesn't exist
- Capture events sent to Pirsch (First Capture, Capture Completed, Capture Failed) gave the captured site's resolved address as the visitor's ip; they now send none. No such event was sent yet: every capture since the events started came from a tenant excluded from analytics
- Data Retention's details for infosec reviewers said expired sessions are never deleted from D1; an hourly job deletes them, as the table on the same page says. They also left the emailed sign-in identities out of the deletion order and of the personal fields
- How WRL Was Built said the evolution log documents 60+ development phases, and the README said more than 140; it has more than 170. The 60+ stays for the first 10 days, when WRL went from first commit to production
- The security whitepaper said the Worker has no npm runtime dependencies besides `@cloudflare/playwright` and `@duckduckgo/autoconsent`; it also bundles `@modelcontextprotocol/sdk`, `zod`, `croner`, `diff-match-patch-es`, `pdf-lib` and `fflate`, and the section now lists them. `fflate`, which zips and unzips WACZ bundles in the Worker, was declared as a development dependency and is now a runtime dependency
- `SECURITY.md` said WRL publishes no versioned releases; releases are tagged since 1.0.0, and only the deployed service is supported. Private vulnerability reporting on GitHub, which `SECURITY.md` and the Support page point to, was turned off and is now on
- The diagrams on the Architecture page and in the security whitepaper never rendered: the pages loaded Mermaid from a CDN in an inline script, which the docs Content-Security-Policy (`script-src 'self'`) blocks, so readers saw the diagram source as code, and every docs page logged a CSP error. The diagrams are now SVG images rendered from `site/diagrams/*.mmd` with `npm run docs:diagrams`. The whitepaper diagrams also said sessions live in Workers KV (they are in D1), showed a browser extension that doesn't exist, and left out the emailed sign-in link; one had a syntax error that kept it from rendering at all
- The nightly re-scan against Google Web Risk checked most captured URLs only every second night: a check from the previous run was a few seconds short of 24 hours old when the next run started, so the run skipped it. URLs not checked in the last 12 hours are now checked, so each one is checked every night, as the security whitepaper says. The whitepaper also gave DigiCert's timestamp address as `https://`; WRL uses `http://timestamp.digicert.com`
- The MCP `get_usage` tool gave storage in two units ("2560014 KB / 10240 MB"); it now gives both in GB, as the quota messages do. Its description promised the date the quota resets, which the output left out; it now has a `Resets:` line
- The example output of the `@w-r-l/verify` CLI on Getting Started and Verification matched no released version ("Verification PASSED", a "Captured URL" line, a TSA name); it now shows what `npx @w-r-l/verify` prints. The MCP `get_certificate` example gave the timestamp states as `ok` and `none`, which it never prints (`present`, `skipped` or `error`), and the `verify_capture` example padded its check lines
- The authentication guide said keys issued by the admin API start with `wrl_live_`; every key does, including the first key and keys created in Settings
- A capture still pending 24 hours after it was submitted is marked failed, but it sent neither the `capture.failed` webhook nor the failure email; it now sends both. The webhook guide and the API reference showed `retryable: true` for a capture that failed after all its attempts, where it is `false`, and gave `content_policy` as a quarantine reason, which WRL never sets: `quarantineReason` names the Google Web Risk threat lists (`MALWARE`, `SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE`)
- Two use-case guides said a capture takes a few seconds; captures usually take 20-60 seconds, as the other guides say
- The architecture page showed two ways to authenticate, GitHub and API keys; its sequence diagram now has the emailed sign-in link too
- The authentication guide gave the diff route as `/v1/captures/{id}/diff/{baseId}`, the wrong way round: the first ID is the base (`/v1/captures/{baseId}/diff/{targetId}`), as in the API reference. Data Retention said rate limit counters live 60-120 seconds; each one expires 2 minutes after the last request it counted
- The MCP `get_capture` example padded its artifact lines, and the `diff_captures` example left out the `HTML hunks` section the tool prints whenever the HTML changed. `list_captures` now has an example output too

### Security

- The docs site build used Eleventy, liquidjs, markdown-it, js-yaml, fast-uri and other packages with 38 open Dependabot alerts (1 critical, 20 high); they are updated and the built pages are unchanged. These packages run only when the docs site is built, not in a Worker

## [1.4.1] - 2026-11-14

### Added

- A docs page, Email Notifications, lists the emails WRL sends (capture failures, approaching limit, limit reached, invoice, payment failure, weekly digest), when each goes out, where they go and how to turn them off; the docs didn't mention them

### Changed

- The comparison page compares ProofSnap, which now has an API, an MCP server and optional eIDAS-qualified timestamps, describes DEPT and its evidx capture tool, explains with the archive.today removal from Wikipedia why a signature made at capture time matters, and points to ProofSnap and evidx for pages behind a login

### Fixed

- Expired sessions and sign-in links were deleted only when someone next signed in, so with few sign-ins their rows stayed for weeks, while the data retention page says a sign-in link's row goes a day after it expires. An hourly job now deletes both; the session query also kept sessions that had expired earlier the same day, because it compared ISO timestamps with SQLite's `datetime('now')`
- Limits & Quotas said WRL retries a failed capture a few minutes apart; it waits 10, 20 and then 40 seconds after a failed attempt
- The MCP `capture_url` and `batch_capture` tools and the docs said captures complete in 5-15 seconds; on-demand captures take 36 seconds at the median and 1% finished within 15 seconds, so they now say 20-60 seconds. The MCP guide said WRL retries a failed attempt up to four times (it makes four attempts in all)
- The batch docs and the OpenAPI description said URLs over the rate limit or the monthly quota get per-item `429` results while the rest are accepted. With an API key, a batch with more URLs than are left of the minute, or one that would go past the quota, is refused as a whole with one `429`; per-item `429` results come only from a self-hosted operator's legacy key. The quota example submitted a batch of 50 URLs, which the 20-URL maximum refuses first, and the per-tenant rate limit was called a rolling window; it starts again at the start of each minute
- `HEAD` requests got a 404 on every route, so link checkers and uptime monitors saw verification links, capture records and `/health` as missing. `HEAD` now answers like `GET` without a body on `/health`, `/ui`, `/v1/verify/{id}`, `/v1/captures/{id}` with its status, certificate and artifacts, and the signing keys
- The comparison page gave SUCHO's archive as 5,400+ sites (SUCHO says more than 5,000), named Harvard Library instead of the Harvard Law School Library as Perma.cc's maintainer and called Perma.cc free for all institutions (only courts and academic institutions), and described TrueScreen as mobile apps only (it also has a forensic browser and a browser extension)
- The comparison pages marked PageFreezer's format as PDF only and its timestamps as not RFC 3161; PageFreezer exports WARC as well as PDF and describes a time stamp authority synchronized with a Stratum-1 time server. They also said Hanzo documents no integrity approach (it documents SHA-256 hashes), called Page Vault's capture tool a browser extension, and linked MirrorWeb, which has combined with Red Oak
- The comparison page said it covered 13 tools and the landing page linked to it as 14, while its table compared WRL with 9; both pages now give the number of tools in the table
- The MCP `verify_capture` description names the eIDAS-qualified timestamp check, and `delete_schedule` says it answers "Schedule not found." for an unknown or another account's schedule; it said it returns 404, which MCP callers never see

## [1.4.0] - 2026-11-14

### Added

- A new account's empty captures list says what a capture produces, offers Wikipedia's "Link rot" article as an example URL to fill in, and links the API quick start and the MCP setup guide; it said only "Submit a URL above to create your first capture"
- Links to the landing page, its policy pages and the docs show a preview image when shared; the landing page asked for a large preview card but named no image

### Changed

- The weekly digest goes to every account with captures that week, not only to accounts with an active schedule; captures from the dashboard, the API or MCP get their own row beside the schedules

### Removed

- `tenant_id` from schedule responses (create, list, get, update): an internal field that the API reference never listed, holding the caller's own tenant id

### Fixed

- The webhooks guide lists every delivery header, including `X-WRL-Event` and `X-WRL-Delivery` (the event id, the same on every retry), and says an endpoint can receive an event more than once; it named only the signature and timestamp headers
- The MCP server reports the WRL release in `serverInfo.version` (it said `0.2.0` since March), the same release as `/health`
- The "Sign in" and "Get started free" buttons on the landing page and in the docs open the sign-in page, which offers GitHub and an emailed link; they started GitHub sign-in directly, so the emailed link added on 2026-10-23 never showed to visitors coming from the website
- The subprocessor list, the DPA and the privacy policy name Sectigo (Europe) SL in Spain, the provider of the eIDAS-qualified timestamps according to its certificates, instead of Sectigo Limited in the USA
- The MCP endpoint answers `server/discover` without a key with "method not found" instead of 401; MCP directories that try it before `initialize` recorded WRL as asking for sign-in and never listed its tools
- The API reference lists the `qualifiedTimestamp` verification check, which captures with an eIDAS-qualified timestamp get, and `signing.qualifiedTimestamp`; a client validating verify responses against the reference rejected them. It also documents `capture.url` in verify responses, `html.additions`, `html.deletions` and `headers.changes` in change summaries, `changeSummary` and `updatedAt` on schedules, and `updatedAt` in the admin usage history
- The API reference and the schedules guide say a paused schedule keeps its `nextRunAt`; the reference said it was null

## [1.3.0] - 2026-11-14

### Added

- The dashboard suggests a schedule: a capture's page links to the schedule form with its URL filled in, and the captures list offers the same once a capture finishes in an account without schedules
- `GET /v1/schedules` returns the account's schedule limit as `limit`, and MCP `list_schedules` starts with "N of LIMIT schedules"

### Changed

- Evidence bundles name the WRL release and commit that made them, such as `WRL/1.3.0+564eae4`, in `datapackage.json`, the signed `datapackage-digest.json` and the WARC `warcinfo` record. Every bundle said `WRL/0.1`. The fetch of a page's HTTP headers sends the same value as its User-Agent

### Removed

- The unread `STRIPE_PUBLISHABLE_KEY` variable (checkout and the billing portal are Stripe-hosted pages)

### Fixed

- Staging emails (email confirmation, unsubscribe, billing) and staging webhook payloads link to staging. They linked to production, where staging captures and tokens don't exist
- The data-retention page says what Cloudflare's edge cache holds: verification responses of verified captures, for up to 24 hours. It said capture artifacts, which are not edge-cached
- OPERATIONS.md and INTERNALS list every secret and variable the Worker reads, including `PIRSCH_ACCESS_KEY`, `VERIFICATION_BASE_URL`, `MAX_BATCH_SIZE` and `ANALYTICS_EXCLUDE_TENANTS`; a sync test keeps them in step with the code
- The webhooks guide says WRL waits 10 seconds for an endpoint to answer before it counts the delivery as failed and retries
- The README and the MCP guide count five verification checks for captures with a qualified timestamp; they said four
- The dashboard's schedule panel shows the account's real schedule limit. It read `limit` from `GET /v1/schedules`, which didn't send one, so it always showed 10 and refused an eleventh schedule in the browser even when an operator had raised the limit

## [1.2.0] - 2026-11-14

### Added

- Admin routes for account deletion: `POST /v1/admin/tenants/{tenantId}/deletion` requests it (captures answer 403 and schedules are skipped from then on), `DELETE` on the same path cancels it, and `DELETE /v1/admin/tenants/{tenantId}` removes all of the tenant's data 30 days or more after the request. The admin tenant detail shows `deletionRequestedAt`

### Security

- `@w-r-l/verify` requires fflate 0.8.3 or later; with 0.8.0 to 0.8.2 a malformed ZIP64 archive could make it loop forever while unzipping (GHSA-px8p-9vwx-vf98). The service already ran 0.8.3
- MCP `capture_url` and `batch_capture` screen URLs with Google Web Risk before capturing, like the REST endpoints; before, an MCP client could capture a flagged page, which the daily re-scan quarantined up to a day later
- `GET /v1/account/first-key` answers 403 until the terms of service are accepted, like the other account routes; before, the first API key could be fetched and used without accepting them
- A request without credentials no longer runs as the previous caller of the same Worker instance: keyless reads of public captures returned 404 after an authenticated request, and the diff endpoint accepted a keyless request as that caller

### Fixed

- The SWGDE page says the browser process is reused between captures (each capture still gets its own browser context), that WRL declines cookie banners and keeps a screenshot from before, that the bundle doesn't name the browser version, and that bundles download without an API key; it said every capture got a fresh browser, the browser version was logged and downloads needed authentication
- The API reference documents `GET` and `PUT /v1/admin/tenants/{tenantId}/config`, which the limits page already described; the limits page said a single override could be set to `null` to remove it, which answers `400`
- `POST /v1/schedules` over the schedule limit answers `429` with `limitType: "schedules"`, as the API reference and the schedules guide say; the field was missing
- `PUT /v1/admin/tenants/{tenantId}/config` answers `400` for a `schedules.maxSchedules` below 1 or above 100; it answered 500
- The schedules guide and the limits page state the limit of 10 schedules and how operators change it; the landing and compare pages said WRL has no scheduled monitoring, and the schedules guide was hidden from search engines
- Batch captures, MCP captures and scheduled captures get a qualified (eIDAS) timestamp when the account has qualified timestamps turned on; only `POST /v1/captures` requested one
- The security overview and whitepaper say eleven alert rules (they said nine), the subprocessor list covers email sign-in and Pirsch, and the whitepaper says which capture paths are screened
- The legal-evidence page and the verify README describe what the `--legal` report contains; they listed an operator identity, the timestamp token and the TSA certificate chain, which the report doesn't include, and said every capture has a timestamp
- MCP `capture_url` and `batch_capture` check the monthly quota and the account state, like the REST capture endpoints; before, an MCP client could capture past the 200 free captures, and a blocked account could still capture through MCP
- MCP `get_usage` shows the real numbers for an account that is blocked, has a pending deletion or is past a limit; it showed 0 captures, billing status `free` and an unknown period
- The limits page quotes the actual quota and rate-limit 429 responses, and explains the 403 for accounts that can't capture
- Captures for an account blocked for non-payment answer 403 with a message saying so; they answered 429 with a storage-quota message and an invalid `Retry-After` date
- The DPA, security whitepaper and data-retention page cover email sign-in and the stored notification address; the legal-evidence page says a capture made while the timestamp authority is unreachable has no timestamp
- The authentication guide's scope table lists the sitemap, schedule, diff, certificate and usage endpoints, and says which scope each needs
- The incident-response page and the security whitepaper list all eleven alert rules (they said nine and lacked Captures Dead-Lettered and New API Key Created) with their actual thresholds

## [1.1.0] - 2026-11-14

### Added

- MCP: `initialize`, `ping` and `tools/list` answer without an API key, so MCP directories and clients can list WRL's tools; tool calls still need a key. Keyless requests are limited to 60 a minute per IP
- `PATCH /v1/schedules/{id}` edits a schedule's name, URL or cron and pauses or resumes it; resuming sets the next run from now
- MCP tool `update_schedule`; `list_captures` takes `schedule_id`
- Dashboard: Pause/Resume and Edit on each schedule, and a Captures link that lists only that schedule's captures
- Sign in with an emailed link instead of GitHub; a first sign-in with the verified email of an existing account signs into that account
- `POST /v1/sitemap` and MCP tool `read_sitemap`: read up to 200 page URLs from a sitemap or sitemap index
- Dashboard: capture a pasted list of URLs or a sitemap, submitted at the tenant's rate limit
- Support page in the docs: where to ask, what to include, and that no plan includes an SLA
- Captures quarantined by threat detection are deleted 90 days after quarantine, and usage counters older than 12 billing periods are removed, as the data-retention page describes
- Landing hero links to a real capture (Wikipedia's "Link rot" article) that visitors can verify without an account
- Captures record what the screenshot covers (`render.pageHeight`, `render.screenshotHeight`, `render.screenshotClipped`), also in the WACZ's `captureQuality`; the verification page and MCP `get_capture` say when a screenshot shows only the top of a taller page
- MCP guide: how to get an API key for an agent; authentication guide: creating and revoking keys in Settings → API Keys
- Every WACZ bundle records `captureQuality` (`renderQuality`, `waitUntilReached`, `timedOut`) in its signed `datapackage.json`
- The verification page shows a "Page load" row for a partial capture, and MCP `verify_capture` prints the render quality

### Privacy

- Analytics events (signup, captures, schedules, payment activation) no longer include tenant, capture or Stripe ids; the privacy policy says so

### Removed

- `POST /v1/webhooks/coralogix` and the GitHub Actions alert-investigation workflow; Coralogix alerts notify by email only

### Changed

- Data, deletion, refund and takedown requests go to hello@webresourceledger.com instead of a personal address
- Free tier storage limit raised from 1 GB to 10 GB per month, so the 200 free captures fit at up to 50 MB each
- `429` for a free tenant at the storage limit now states storage used and limit and says to add a payment method
- The first API key shown after signup is kept for 24 hours instead of 1 hour; it is still shown once
- Captures of a Cloudflare bot check ("Just a moment...") now fail with a message instead of completing; they aren't counted against the quota and no timestamp is spent on them
- Failed captures keep the reason of the last attempt, followed by "WRL tried 4 times.", instead of "Capture permanently failed after all retry attempts", in the API, webhooks, failure emails and the dashboard
- Screenshots render at 2x device scale instead of 4x, so the largest is 2,560 by 16,000 pixels and screenshots take about a quarter of the space
- Partial captures (the page timed out after its HTML loaded) get a signed, timestamped WACZ bundle, a verification link and a certificate, like full captures; with qualified timestamps turned on they use one too

### Fixed

- `X-RateLimit-Limit` on sign-in, account, billing, unsubscribe and verify-email routes said 20 or 30 requests a minute; they share a limit of 10 a minute per IP address, and the header now says 10. The limits page lists the per-IP limits
- The API reference listed `GET` and `PUT /v1/account/notifications` as needing no authentication; they take a dashboard session only and refuse API keys. The API key description says where keys come from (first sign-in, Settings → API Keys)
- The API reference didn't list `timestamps` (which timestamps a capture's bundle holds) on capture records and list items, or `render.stages.scrollMs`
- The weekly digest's subject and heading showed the period as timestamps ("2026-11-02T09:00:19.051Z - 2026-11-09T09:00:19.051Z"); they show dates ("Nov 2 - Nov 9")
- Captures whose queue message was lost stayed `pending` for good (8 in production since July); a capture still pending 24 hours after it was submitted is now marked failed with "WRL lost track of this capture before it finished." and `retryable: true`
- MCP `capture_url` and the MCP guide said a capture still pending after 30 seconds may have failed; retries can keep it pending for a few minutes, and resubmitting creates a second capture
- The `capture.complete` webhook sent a `verificationUrl` for partial captures that answered 404; partial captures now verify
- MCP `list_schedules` shows whether each schedule is active or paused, and `(paused)` instead of a next run for paused schedules
- The MCP guide documents `update_schedule` and the `schedule_id` filter on `list_captures`, and its `get_usage` example matches the output
- `GET /v1/account/usage` answered 401 to API keys although the API reference documents bearer auth; it now takes an API key with the `read` scope, like the MCP tool `get_usage`. The API reference now lists the fields the endpoint returns (`billingStatus`, `hasPaymentMethod`, `gracePeriodEnd`, `billing`) instead of `tierDisplay`, which it never sent
- A schedule's `lastCaptureStatus` stayed `pending`; it now becomes `complete` or `failed` with its capture
- The dashboard's schedule badge showed "Active" after a failed capture; it shows Error, Skipped (quota) and Blocked (unsafe URL)
- Change detection compared captures of different URLs after a schedule's URL changed; it compares captures of the same URL only
- Docs headings have ids, so links to a section (for example /limits/#why-captures-fail) open at that section
- The weekly digest ran on Sundays (Cloudflare numbers weekdays from 1 = Sunday); it now runs on Mondays
- Scheduled captures due at the weekly cron could run twice
- Plain-HTTP requests to the landing page and docs were served without a redirect; every WRL host now redirects HTTP to HTTPS, and the landing page sends `Strict-Transport-Security` like docs and the API
- Scheduled captures counted twice toward the monthly limit and the Stripe meter (once when queued, once when complete); they now count once, when complete
- Captures of pages taller than 8,000 px no longer fail with "Unable to capture screenshot"; the screenshot covers the top 8,000 px and the HTML the whole page

- Reaching the free storage limit now sends the `limit_reached` email with a storage variant; before, only the capture limit did
- Scheduled captures skipped because the free limit is reached now send the `limit_reached` email instead of skipping silently
- Dashboard capture form names the limit that was hit (captures or storage), shows the reset date, and points free tenants to adding a payment method
- Welcome screen: when the first API key is no longer available, it offers to create a new key in place instead of only linking to Settings

### Security

- `/mcp` refuses request bodies over 256 KiB (413) and tool arguments with more than 1,000 array elements and object keys, and runs on MCP SDK 1.32.2 and zod 4.6.7 (GHSA-46jr-4wx8-v453, GHSA-f897-62hf-6gxq, GHSA-mrhx-c7xc-m3w5)

## [1.0.0] - 2026-03-25

### Added

- `WRL-API-Version` response header on all responses, reflecting the current API version
- Deprecation header mechanism per RFC 9745 (`Deprecation: @timestamp`) for signalling deprecated endpoints
- Sunset header per RFC 8594 (`Sunset: HTTP-date`) with minimum 6-month notice commitment
- `Link` header with `rel="deprecation"` pointing to migration guides when deprecation is active
- DEPRECATION-POLICY.md with formal breaking-change definitions and 6-month minimum notice commitment
- CHANGELOG.md with retroactive API history from 0.1.0 onward
- CI enforcement of version sync between openapi.yaml and package.json
- Pull request template with API changelog checklist

### Changed

- Version synchronized across openapi.yaml (was 0.8.0), package.json (was 0.1.0), and git tags to 1.0.0

## 0.8.0 - 2026-03-24

### Added

- `GET /v1/captures/{id}/certificate` — FRE 902(13) certification PDF for legal evidence use cases (#176)
- `GET /v1/notifications/preferences` and `PUT /v1/notifications/preferences` — per-tenant notification preference management (#178)
- `POST /v1/notifications/unsubscribe` — token-based unsubscribe endpoint for email notifications (#178)
- Email notification delivery for operational events (capture complete, capture failed) and billing events
- Build identity metadata fields (`commitSha`, `deployedAt`, `environment`) in `GET /health` response (#171)

### Removed

- Share token endpoints (`POST /v1/captures/{id}/share`, `DELETE /v1/captures/{id}/share/{tokenId}`) — access model simplified to public individual captures and authenticated list (#174)
- `shareToken` query parameter support on `GET /v1/captures/{id}` (#174)
- `tokens` array from capture metadata responses (#174)

## 0.7.0 - 2026-03-23

### Added

- `POST /v1/schedules` — create recurring capture schedules with cron expressions (#151)
- `GET /v1/schedules`, `GET /v1/schedules/{id}`, `PUT /v1/schedules/{id}`, `DELETE /v1/schedules/{id}` — schedule management CRUD (#151)
- `threatCheck` field on capture responses — Google Web Risk content security scan result with `status` and `threatType` (#155)
- Share token endpoints (`POST /v1/captures/{id}/share`, `DELETE /v1/captures/{id}/share/{tokenId}`) for access-controlled capture sharing (#157)
- `shareToken` query parameter on `GET /v1/captures/{id}` for unauthenticated access via share token (#157)
- `qualifiedTimestamp` field on capture responses — eIDAS-qualified RFC 3161 timestamp from a qualified TSA (#158)
- `GET /v1/settings/eidas` and `PUT /v1/settings/eidas` — per-tenant eIDAS qualified timestamp opt-in (#158)

## 0.6.0 - 2026-03-22

### Added

- `POST /v1/webhooks` — register webhook endpoints for event delivery (#130)
- `GET /v1/webhooks`, `GET /v1/webhooks/{id}`, `PUT /v1/webhooks/{id}`, `DELETE /v1/webhooks/{id}` — webhook management CRUD (#130)
- Webhook event delivery with HMAC-SHA256 payload signing via `X-WRL-Signature` header (#130)
- `GET /v1/admin/usage` — tenant usage metrics endpoint (#129)
- `X-RateLimit-Tenant-*` headers on all authenticated responses reflecting per-tenant quota status (#135)
- Custom API domain: `api.webresourceledger.com` replaces `wrl.benpeter.workers.dev` (#140)

## 0.5.0 - 2026-03-17

### Added

- Per-tenant API keys with scoped access (`capture`, `read`, `admin`) (#90)
- `POST /v1/admin/keys` — provision API keys with explicit tenant and scope (#90)
- `DELETE /v1/admin/keys/{keyId}` — revoke API keys (#90)
- `POST /v1/captures/batch` — submit up to 10 capture requests in a single call, returns 207 Multi-Status (#119)
- Stripe-based usage metering; capture events reported to `captures` and `eidas_timestamps` meters (#129)

## 0.4.0 - 2026-03-16

### Added

- RFC 3161 timestamp in every WACZ bundle; `timestamp` field in capture responses with `value` (base64 DER), `tsa`, and `algorithm` (#63)
- `captureSettings` field on capture responses reflecting effective browser configuration used during capture (#65)
- `screenshots` array on capture responses with `full` and `viewport` entries for dual-screenshot captures (#65)

## 0.3.0 - 2026-03-16

### Added

- CORS preflight support (`OPTIONS`) on all endpoints (#57)
- `X-RateLimit-Limit` and `X-RateLimit-Remaining` response headers on all endpoints (#57)
- `Strict-Transport-Security` header (`max-age=31536000; includeSubDomains; preload`) on all responses (#57)
- `partial` capture status for timeout fallback: WACZ is produced with whatever was captured before the timeout (#60)

### Fixed

- 13 discrepancies between OpenAPI spec and actual API behavior (#62)

## 0.2.0 - 2026-03-16

### Added

- `GET /v1/captures` — list captures for the authenticated tenant with cursor-based pagination and status filtering (#51)
- Key versioning: signing keys include a `kid` (key ID) field; `GET /v1/signing-key` returns current active key (#54)
- `GET /v1/signing-key/archive` — retrieve all historical public keys by `kid` (#54)
- Staging environment at `wrl-staging.benpeter.workers.dev` (#55)
- Terms of Service (`/terms`) and Content Policy (`/content-policy`) endpoints (#55)

## [0.1.0] - 2026-03-13

### Added

- `POST /v1/captures` — submit a URL for capture; returns a capture ID and `processing` status
- `GET /v1/captures/{id}` — retrieve capture metadata including status, screenshot URL, WACZ URL, and verify URL
- `GET /v1/captures/{id}/screenshot` — proxy artifact endpoint for screenshot image
- `GET /v1/captures/{id}/wacz` — proxy artifact endpoint for WACZ bundle
- `GET /v1/verify/{id}` — verify the integrity and signature of a captured resource; returns HTML or JSON per `Accept` header
- `GET /v1/signing-key` — retrieve the current Ed25519 public key for independent verification
- `GET /health` — health check endpoint
- WACZ bundle construction with Ed25519 signature over canonical JSON datapackage
- SSRF prevention on capture URLs (private IP ranges, localhost, link-local blocked)
- `Content-Security-Policy`, `X-Content-Type-Options`, and `X-Frame-Options` security headers on all responses
- Global rate limiter (100 requests per 10 seconds per IP) via Cloudflare Rate Limiting API
- RFC 9457 Problem Details error responses across all endpoints

---

[Unreleased]: https://github.com/benpeter/web-resource-ledger/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/benpeter/web-resource-ledger/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/benpeter/web-resource-ledger/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/benpeter/web-resource-ledger/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/benpeter/web-resource-ledger/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/benpeter/web-resource-ledger/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/benpeter/web-resource-ledger/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/benpeter/web-resource-ledger/releases/tag/v1.0.0
[0.1.0]: https://github.com/benpeter/web-resource-ledger/releases/tag/v0.1.0
