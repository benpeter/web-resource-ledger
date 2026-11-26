---
layout: layouts/doc.njk
title: Verification
description: How to verify a WRL capture using the CLI or REST API, what each check confirms, and how the Ed25519 and RFC 3161 trust model works.
---

# Verification

Every WRL capture produces a WACZ bundle signed with Ed25519 and timestamped by an independent RFC 3161 authority. Verification confirms the capture has not been modified since it was created and that an independent party recorded the time.

## How to verify

### Command-line (offline, independent)

The `@w-r-l/verify` CLI runs entirely on your machine. It fetches the WACZ bundle, resolves the signing key from the operator's public endpoint, and performs all checks without trusting the WRL server for the verification decision itself.

Pass the capture URL directly:

```bash
npx @w-r-l/verify https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

Or download the WACZ file first and verify it locally:

```bash
npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com
```

Requires Node.js 20 or later. No installation needed: `npx` fetches the package on demand.

**Example output (all checks passing):**

```
Fetching capture from https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/wacz
Verified  https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6

  File integrity        pass
  Bundle integrity      pass
  Digital signature     pass
  Time verification     pass
  Timestamp chain       pass

  Page      https://example.com/
  From      LAX, US (Cloudflare data center)
  Signed    2026-03-22T10:30:12.350Z
  TSA       http://timestamp.digicert.com
  Key       ab487612 (from api.webresourceledger.com)
  Hash      sha256:e3b0c44298fc1c14...

Verdict: All 5 cryptographic checks passed. This capture has not been modified since it was signed by the capture service.
```

Exit code `0` means all checks passed. Exit code `1` means one or more checks failed. Exit code `2` means a usage error (bad arguments, missing file, or network failure fetching the key or bundle).

`Page` is the captured page and `From` where WRL's browser loaded it from (see [Where the capture was made from](#where-the-capture-was-made-from)); both come from the signed `datapackage.json`. When the capture service recorded something a reader should know (a partial render, a screenshot that shows only the top of the page, or an error status from the site), a `Note` line says so. These lines need `@w-r-l/verify` 0.5.0 or later; `npx` fetches the latest.

For machine-readable output, add `--json`. For a legal report, add `--legal` (see below). For full CLI options, see the [verify package README](https://github.com/benpeter/web-resource-ledger/tree/main/packages/verify).

### Legal report

Add `--legal` to produce a structured plain-text report formatted for use in legal proceedings or formal documentation:

```bash
npx @w-r-l/verify https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 --legal
```

The report contains seven sections: a plain-language summary, a subject description, per-check explanations, a chain of custody narrative, applicable legal standards, a methodology description, and full technical details. All cryptographic values are untruncated. No ANSI color codes are written, so the output is safe to redirect to a file or paste into a document.

Add `--json` alongside `--legal` for a machine-readable JSON version with the same seven sections as structured fields.

For the legal context behind the report, including how WRL captures map to FRE 901(b)(9) and eIDAS Art. 41, see [Legal Evidence](/legal-evidence/).

### REST API (server-side)

The `GET /v1/verify/{id}` endpoint runs the same checks on the server and returns JSON. No authentication required.

```bash
curl https://api.webresourceledger.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

```json
{
  "verified": true,
  "capture": {
    "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "url": "https://example.com/terms",
    "createdAt": "2026-03-22T10:30:00.000Z",
    "completedAt": "2026-03-22T10:30:12.481Z",
    "renderQuality": "full"
  },
  "signing": {
    "bundleHash": "sha256:e3b0c44298fc1c149afbf4c8996fb924...",
    "signedAt": "2026-03-22T10:30:12.350Z",
    "timestamp": {
      "genTime": "2026-03-22T10:30:12.481Z",
      "tsa": "http://timestamp.digicert.com"
    }
  },
  "checks": [
    { "name": "artifactHashes", "status": "pass" },
    { "name": "bundleHash",     "status": "pass" },
    { "name": "signature",      "status": "pass" },
    { "name": "timestamp",      "status": "pass" }
  ]
}
```

> **Note:** A `200` response does not mean the capture is verified. Always check the `verified` field. A `200` with `"verified": false` means the endpoint ran successfully but one or more checks failed.

The `verifyUrl` included in every capture record also renders as a human-readable browser page. Share it freely; no account is needed to view it.

Pasted into Slack, Teams, LinkedIn, X, WhatsApp, Discord, Telegram, Mastodon or Bluesky, the link shows a preview card: "Verified capture of example.com/pricing", the capture time, and the Web Resource Ledger card image. The card never shows the screenshot. Those services fetch the link with `Accept: */*`, so WRL recognises them by their user agent and serves them the page; every other client that doesn't ask for `text/html` still gets JSON.

### What each check confirms

| Check | What it confirms |
|-------|-----------------|
| **File integrity** (`artifactHashes`) | Every file in the WACZ archive matches its recorded SHA-256 hash. No individual artifact has been modified. |
| **Bundle integrity** (`bundleHash`) | The archive manifest (`datapackage.json`) has not been altered. The hash covers the canonical form of the manifest. |
| **Digital signature** (`signature`) | The bundle was signed by the operator's Ed25519 private key. The signature is over the bundle hash. |
| **Time verification** (`timeVerification`) | An independent timestamp authority recorded the time of capture. Shows the strongest available tier: qualified electronic timestamp (eIDAS Art. 41) when present, otherwise standard RFC 3161 timestamp. |
| **Timestamp chain** (`timestampChain`) | The timestamp was signed by a certificate authority in a trusted chain (CLI only). Confirms the TSA itself is legitimate. |

The browser page and the CLI's readable output show time verification as one row. In the JSON of `GET /v1/verify/{id}` and of the CLI's `--json` it is two checks: `timestamp` for the RFC 3161 timestamp, and `qualifiedTimestamp` for captures that also have an eIDAS-qualified one.

When all checks pass, you know: every byte matches what was captured; the WACZ was assembled by the operator who holds the signing key; and an independent authority recorded the time at capture, so the capture cannot have been backdated. WRL's SHA-256 hashing and documentation practices align with SWGDE Best Practices for Acquiring Online Content sections 7.3 and 7.5; see [SWGDE Alignment](/security/swgde-compliance/) for the full mapping.

For how these technical properties map to legal authentication standards (FRE 901/902, eIDAS), see [Legal Evidence](/legal-evidence/). To obtain a certification document designed to support a Rule 902(13) self-authentication foundation, use `GET /v1/captures/{captureId}/certificate` or the "Download Certificate" button in the web UI; see [Certified records](/legal-evidence/#rule-902-13-certified-records).

### Partial captures

WRL captures a page as it stands, instead of failing, in two cases:

- The page has not finished loading after 20 seconds but its HTML has (the browser fired `DOMContentLoaded`).
- The page made more than 2000 requests. WRL lets the first 2000 through and blocks the rest (see [Requests and Page Size](/limits/#requests-and-page-size)).

Either way the capture has `"renderQuality": "partial"`. Images, fonts or content that would have loaded later may be missing from the screenshot and the HTML.

A page that ran into the 20 seconds still gets every step a loaded page gets: WRL waits up to 3 seconds for open requests, scrolls the page so lazy images load, and handles the cookie banner, so the capture has `captureSettings.consent` and, when a banner was dismissed, the screenshot from before it. It also fails for the same reasons: a blank page or a Cloudflare bot check is not stored as a capture. Until 15 November 2026 WRL took one screenshot the moment the 20 seconds were up, without those steps, so older partial captures can show a cookie banner or unloaded images, and their `render.stages.settleMs` and `consentMs` are `null`.

A partial capture is signed and timestamped like a full one, and every check above runs the same way. The bundle's `datapackage.json` records how far the page got, so that record is covered by the signature too:

```json
"captureQuality": {
  "renderQuality": "partial",
  "waitUntilReached": "domcontentloaded",
  "timedOut": true
}
```

A page that hit the request cap records `"subresourceLimitReached": true`; when it finished loading otherwise, `"waitUntilReached"` is `"load"` and `"timedOut"` is `false`. Captures made before 15 November 2026 don't have that field. A page whose responses added up to more than 50 MB records `"sizeLimitReached": true` in the same way; captures made before 25 November 2026 don't have it.

`requestsHeldBack` counts the requests the page started while WRL took its screenshots, which WRL held back so the screenshot doesn't wait for them; they are mostly ads, and an ad slot that would only have filled then is empty in the screenshot. It doesn't make a capture partial. When it is above 0, the verification page says so under the screenshot, MCP `get_capture` mentions it, and `@w-r-l/verify` 0.6.0 and later show a note. Captures made before 25 November 2026 don't have it.

A full capture records `"renderQuality": "full"`, `"waitUntilReached": "load"` and `"timedOut": false`. Captures made since November 2026 also record `pageHeight`, `screenshotHeight` and `screenshotClipped`, which say whether the screenshot shows the whole page or only its top 8,000 pixels (see [Screenshot Size](/limits/#screenshot-size)). `GET /v1/verify/{id}` returns `capture.renderQuality`, and the verification page shows a partial capture with a "Page load" row under the checks.

### Cookie banners

WRL acts on the page in one way: it declines cookies. It never accepts them and never clicks anything outside the cookie banner. Where a banner has no "Reject" button, declining takes more than one click: the rule opens the banner's settings, unticks what is ticked and saves.

After the page has loaded and been scrolled, WRL takes a screenshot. Then it runs [@duckduckgo/autoconsent](https://github.com/duckduckgo/autoconsent), which looks for a cookie banner it knows and chooses the opt-out. autoconsent knows a banner from one of about 1,000 rules: some cover a consent tool that many sites use (OneTrust, Cookiebot, Sourcepoint, CookieHub), others one site. When the opt-out worked, WRL takes a second screenshot. The capture's `captureSettings.consent` says what happened:

| `result` | What it means | Screenshots |
|---|---|---|
| `notDetected` | No banner that autoconsent knows was showing. When `cmpDetected` is there, that consent tool is on the page but showed no banner within 5 seconds; many tools only ask visitors from some countries. | One. A banner autoconsent does not know is still in it. |
| `success` | A banner was found and declined; `cmpDetected` names the rule that matched, for example `Onetrust` or `cookiehub`. | Two: `artifacts.screenshot` is the page without the banner, `artifacts.screenshotBefore` is the page with it. |
| `failed` | A banner was found but could not be declined, for example one that only offers "Accept", or declining it took longer than 10 seconds. Also when WRL could not start looking for a banner within 15 seconds, which can happen on a page with hundreds of ad frames. | One. A banner that was showing is in it. |

Setting the step up in the page takes well under a second on most pages and has 15 seconds at most. From then on the step takes 2 seconds on a page without a consent tool, and up to 6 on a page that keeps the browser so busy that autoconsent has not been through its rules once by then. When autoconsent detects a consent tool, its banner has until 5 seconds after the step began to show, and until 10 seconds to be declined, because some banners need their settings opened first.

Some sites reload themselves once a choice is made (theguardian.com does), and many change the page. Before the second screenshot WRL waits for that: up to 2 seconds for a reload to start, then up to 3 seconds for the page's requests to finish. After a reload, whether it started in the 2 seconds or in the 3 after them, WRL waits for the new page to load and scrolls it again so lazy images load. A reload that starts later, while WRL takes the second screenshot or reads the HTML, is noticed: WRL then does the wait, the scroll, the screenshot and the HTML over, once, on the reloaded page. The HTML artifact is read after the second screenshot, so it matches it.

Both screenshots and `captureSettings`, with the autoconsent version, are in the WACZ bundle and covered by its signature. Captures made until 15 November 2026 knew only the 11 consent tools autoconsent detects in code and gave the whole step 2 seconds, so many of them say `notDetected` or `failed` for a banner that a capture made today declines. They also took the second screenshot the moment the banner was gone; on a site that reloads, that screenshot can show the page halfway through loading, with images missing, while `screenshotBefore` shows it whole.

### Captures of an error answer

WRL captures what the site answers, also when that is an error. A page that answers `404` or `410` is often exactly what you want on record, and a site that blocks automated visitors may answer `403` with a block page ("Access Denied"). Such a capture completes and is signed like any other, so check `render.httpStatus` on the capture: it is the status of the page's own response as WRL's browser received it, after redirects. With a 4xx or 5xx status the verification page shows a "Site answer" row under the checks ("The site answered with HTTP 403"), the dashboard shows the status in the capture's details, and MCP `get_capture` and `verify_capture` say so. The status is signed into the bundle as `captureQuality.httpStatus`. Captures made before 15 November 2026 don't have it.

The headers artifact can show a different status. WRL fetches the headers in a request of its own, without a browser and without following redirects, so a site may answer that request with a redirect and the browser with a block page.

An error answer with an empty page fails instead, with a reason such as "The site answered HTTP 403 and the page showed nothing (blank page)".

Partial captures made before November 2026 have no WACZ bundle, because partial captures were not signed then. They cannot be verified, and `GET /v1/verify/{id}` returns `404` for them.

---

<details>
<summary>Under the hood: how the trust model works</summary>

### Where the capture was made from

Cloudflare runs WRL's browsers in several data centers and picks one for each browser session; so far they have all been in the United States (Los Angeles, Dallas, San Jose). What a site shows can depend on where the visitor is. For example, theguardian.com, slashdot.org and samsung.com showed a cookie banner to WRL's browser in Los Angeles and none to the one in Dallas in November 2026.

Each capture records where its browser went out to the web, as Cloudflare's trace page (`https://www.cloudflare.com/cdn-cgi/trace`) reported it to that browser: `captureSettings.browserLocation`, with `colo`, the data center's three-letter airport code, and `country`, a two-letter country code. The verification page shows it under "Capture details" ("Captured from: LAX, US (Cloudflare data center)"), and so do the dashboard, the certification PDF and MCP `get_capture` and `verify_capture`. It is in the WACZ bundle's `datapackage.json` with the rest of `captureSettings`, covered by the signature.

You cannot choose the place. When the browser could not read the trace page, the capture has no `browserLocation`. Captures made before 25 November 2026 don't have it.

### Ed25519 signatures

When WRL completes a capture, it signs the WACZ bundle using an Ed25519 private key held by the operator. The signature covers the SHA-256 hash of the bundle manifest. Ed25519 is a modern elliptic-curve signing algorithm; the signature is 64 bytes and the public key is 32 bytes.

What a valid signature proves: the operator who holds the corresponding private key signed this exact bundle hash. If any byte of the bundle changes after signing, the signature will not verify.

What a valid signature does not prove: that the operator is trustworthy, that the captured page is accurate, or that the page has not since changed. The signature attests to the operator's action, not to the content's meaning.

The operator's current public key is available at `GET /.well-known/signing-key`. Third-party verifiers can fetch it independently rather than trusting the key embedded in the WACZ bundle itself.

### RFC 3161 timestamps

After signing the bundle, WRL submits the bundle hash to a third-party Timestamp Authority (TSA), currently DigiCert, using the RFC 3161 protocol. The TSA records the hash along with the current time and signs the result with its own certificate.

What this timestamp proves: DigiCert observed this exact bundle hash at this specific time. Because the timestamp is bound to the hash, it cannot be transferred to a different bundle. Because DigiCert signed the timestamp, it cannot be forged without DigiCert's private key.

Why this matters: a capture signed only by the operator could theoretically be backdated, because the operator controls the clock. An RFC 3161 timestamp from an independent TSA removes that possibility. A third party (DigiCert) independently confirms when the bundle hash existed.

The TSA identity and the raw timestamp are embedded in the WACZ bundle's `datapackage-digest.json`. The CLI performs full CMS/PKCS#7 certificate chain validation to confirm the TSA certificate is legitimate.

### WACZ bundle structure

A WRL WACZ bundle is a ZIP archive containing:

```
datapackage.json           Manifest: file list with SHA-256 hashes for each artifact
datapackage-digest.json    Signing metadata: bundle hash, Ed25519 signature, RFC 3161 timestamp
pages/pages.jsonl          Page records
archive/                   WARC file(s) containing the captured content
```

The hash chain works bottom-up: each artifact file is hashed individually and recorded in `datapackage.json`. The canonical JSON of `datapackage.json` is then hashed to produce the bundle hash. The bundle hash is what gets signed and timestamped. Verification runs the chain in reverse: verify individual files against the manifest, verify the manifest hash, verify the signature over the manifest hash, verify the timestamp over the same hash.

### Key rotation

Old captures continue to verify after the operator rotates signing keys. Each capture records which key signed it. The key archive at `GET /.well-known/signing-keys` lists all historical public keys. During verification, the correct historical key is looked up automatically; you do not need to manage this yourself.

Rotating the signing key does not break existing captures or existing verification links.

</details>
