# Changelog

All notable changes to the WRL API are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions before 1.0.0 were pre-release. Breaking changes were shipped as minor
versions per [SemVer convention](https://semver.org/spec/v2.0.0.html#spec-item-4).

## [Unreleased]

### Added

- The dashboard suggests a schedule: a capture's page links to the schedule form with its URL filled in, and the captures list offers the same once a capture finishes in an account without schedules
- `GET /v1/schedules` returns the account's schedule limit as `limit`, and MCP `list_schedules` starts with "N of LIMIT schedules"

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

[Unreleased]: https://github.com/benpeter/web-resource-ledger/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/benpeter/web-resource-ledger/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/benpeter/web-resource-ledger/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/benpeter/web-resource-ledger/releases/tag/v1.0.0
[0.1.0]: https://github.com/benpeter/web-resource-ledger/releases/tag/v0.1.0
