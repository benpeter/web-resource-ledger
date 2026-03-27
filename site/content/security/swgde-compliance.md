---
layout: layouts/doc.njk
title: SWGDE Alignment
description: How WRL's automated capture pipeline maps to SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024) -- SHA-256 hashing, automated collection documentation, and RFC 3161 timestamps.
---

# SWGDE Best Practices: Mapping to WRL

SWGDE (Scientific Working Group on Digital Evidence) is a professional body that publishes consensus best practices for digital forensics practitioners. This page maps Web Resource Ledger's automated capture capabilities to the requirements in *SWGDE Best Practices for Acquiring Online Content, 21-F-001, Version 1.1 (March 15, 2024)*, available at [swgde.org](https://www.swgde.org/documents/published-complete-listing/21-f-001-best-practices-for-acquiring-online-content/). Readers should verify they are consulting the current version of that document directly at swgde.org, as SWGDE revises its publications over time.

**SWGDE does not certify tools, vendors, or services, and does not grant compliance status.** This page demonstrates where WRL's design aligns with the document's requirements and where responsibility remains with the examiner or tenant. It is not a certification claim and should not be represented as one.

---

## How to read this mapping

SWGDE 21-F-001 was written for a human examiner manually operating tools on a forensic workstation. The document's recurring subject is "the examiner" -- a qualified individual making real-time judgments about configuration, scope, documentation, and preservation. WRL is a fully automated, API-driven capture service. No human examiner operates the capture pipeline; a tenant submits a URL via API and receives a signed, timestamped WACZ bundle in return.

This architectural difference matters for how the mapping works. Where the document says "the examiner should configure the device," the equivalent in WRL is the automated pipeline design itself -- a fixed, documented, deterministic configuration applied to every capture. Where SWGDE describes examiner judgment (legal authority, investigation scope, supplemental preservation decisions), no automated tool can substitute for that judgment, and WRL makes no claim to do so.

Section 8.1.1 of SWGDE 21-F-001 is worth reading carefully in this context. It explicitly identifies API-based acquisition as the most inclusive acquisition method -- preferred over web browser capture or screenshots -- and notes that API calls can capture both visible content and critical metadata unavailable through page-level access. WRL is an API-based acquisition service; this section is where the alignment is strongest.

Three compliance postures appear throughout the mapping below:

- **Fully addressed** -- WRL's automated pipeline directly satisfies the requirement as stated.
- **Addressed differently** -- WRL achieves the same evidentiary goal through a different mechanism than a manual examiner would use; the underlying intent is met.
- **Tenant/examiner responsibility** -- the requirement involves judgment, legal authority, or scope decisions that fall outside an automated capture tool's proper role.

---

## Summary mapping table

| SWGDE Section | Title | Alignment | Details |
|---|---|---|---|
| 3.1 | Principles of Digital Evidence | Fully addressed | Relevance, reliability, sufficiency; auditable and repeatable pipeline |
| 3.4 | Evidence Contamination | Fully addressed | Fresh ephemeral browser per capture; no plugins, cache, or history |
| 4.1 | Configuration | Addressed differently | Fixed deterministic config; no configurable geolocation or user agent |
| 4.2 | Content Volatility | Addressed differently | Scheduled captures and batch API enable multiple acquisitions |
| 4.3 | Tool Validation | Addressed differently | Source-available verifier; CI test suite; documented pipeline |
| 7.2 | Format | Fully addressed | WACZ (open-standard ZIP/WARC); native content and metadata preserved |
| 7.3 | Hashing | Fully addressed | SHA-256 (NIST-approved) per artifact and bundle |
| 7.5 | Collection Documentation | Fully addressed | URL, timestamp, access metadata, and process description in every capture |
| 8.1.1 | Utilities / API | Fully addressed | API-based acquisition; strongest SWGDE alignment point |
| 9 | Preservation | Addressed differently | WACZ bundle is the preservation format; not a forensic disk image |

**Sections not mapped.** The following sections address requirements outside an automated web capture tool's scope:

- **3.2 Accessibility** -- restricted sites, hidden URLs, and credential-gated content require investigator judgment; WRL captures publicly accessible URLs.
- **3.3 Supplemental Preservation** -- relates to legal process against Electronic Service Providers; a parallel investigative track, not a capture tool function.
- **3.5 Legal Authority** -- the examiner retains responsibility for establishing appropriate legal authority before initiating a capture. WRL does not assess or enforce legal authority.
- **5 Goals of Acquisition** -- investigative scoping (what to capture and why) is a human judgment preceding tool use.
- **6 Categories** -- static, dynamic, and ephemeral content classification is an investigator determination; WRL captures any publicly accessible URL.
- **7.1 Screen Captures** -- WRL produces WARC-format captures, not screen recordings; screenshots are taken for display but WACZ is the evidentiary artifact.
- **7.4 Network Documentation** -- packet capture and network traffic logging are examiner-side controls; WRL logs metadata about the capture request but does not instrument the network path.
- **8.1.2 Web Browser / Plug-ins / Extensions** -- browser extension-based acquisition is a different methodology; WRL is an API-driven service.
- **8.1.3 Screenshots** -- SWGDE positions screenshots as the least forensically sound method; WRL produces WACZ bundles instead.

---

## Section 3.1 -- Principles of Digital Evidence

SWGDE 21-F-001 Section 3.1 states that digital evidence is governed by three basic principles: relevance, reliability, and sufficiency. It requires that all acquisition processes be auditable and repeatable -- that applying the same method to the same content should produce reproducible results.

**Relevance and sufficiency** are investigator judgments that precede tool use. The examiner decides which URLs to capture and whether the captured content is sufficient for the investigation. WRL does not assess relevance or sufficiency; those determinations belong to the tenant or examiner submitting the capture request.

**Reliability and repeatability** are where WRL's automated design is directly applicable. Every WRL capture runs through the same documented pipeline: URL validation and threat screening, headless Chromium rendering with a fixed configuration, WACZ assembly with SHA-256 hashing of each artifact, Ed25519 signing, and RFC 3161 timestamping. This process is identical for every capture; no examiner configures it differently between runs.

The pipeline is **auditable** in two senses. First, the source code is publicly available and the capture process is described in [Architecture](/architecture/) and the [Security Whitepaper](/security/whitepaper/). Second, the output of every capture is independently verifiable: any party can run `npx @w-r-l/verify` against the capture bundle and confirm all integrity checks without contacting WRL. The verification decision is made by the verifier, not by WRL's infrastructure.

The pipeline produces **repeatable** results in the sense that the same URL captured at the same time through the same process produces the same deterministic output structure, with all artifacts hashed and the bundle signed and timestamped. Independent re-capture of a live URL at a later time will produce a different result if the content has changed -- which is the point: captures are point-in-time records. The process that produced them is verifiably consistent.

For how these reliability properties map to legal authentication standards, see [Legal Evidence](/legal-evidence/).

---

## Section 3.4 -- Evidence Contamination

SWGDE 21-F-001 Section 3.4 requires examiners to understand how their collection tools affect the integrity of the target site -- specifically, that browser plugins, cached data, stored credentials, MAC addresses, and browser fingerprints may alter what content is displayed or may alert the target site to the investigation.

WRL's capture pipeline addresses this through its isolated browser architecture. Each capture runs in a fresh, ephemeral browser instance with no plugins, no cache, no cookies, and no browsing history. The `BrowserContext` is opened per-capture and closed in a `try/finally` block that discards all state -- cookies, local storage, and session storage -- when the capture completes. No state carries over between captures.

The pipeline uses headless Chromium with no extensions installed. There is no translator plugin to modify displayed text, no ad blocker to hide page elements, and no password manager to inject credentials. The browser presents the target URL as an unauthenticated visitor with a standard Chromium user agent.

WRL captures originate from Cloudflare's network. The capture does not originate from the tenant's IP address or the examiner's workstation. This architectural separation means the examiner's own network presence is not exposed to the target site during capture. However, the capture does originate from Cloudflare infrastructure with a standard Chromium user agent; the target site may log the request with Cloudflare egress IP addresses. This should be understood and accounted for in the investigation.

WRL does not support configuring the browser to present specific geolocation signals or custom user agent strings. For investigations where the target site serves different content based on visitor location or identity, the examiner should assess whether WRL's standard capture configuration is appropriate for that specific collection goal.

---

## Section 4.1 -- Configuration

SWGDE 21-F-001 Section 4.1 requires that the capture device be equipped with appropriate tools and free of extraneous applications that could interfere with acquisition or alter displayed content. It also recommends configuring the device to mimic the target audience -- using regional settings, browser agent strings, and IP addresses consistent with investigation goals -- and using sanitized environments to avoid cross-contamination.

WRL's pipeline provides a standardized, fixed configuration for every capture:

- Headless Chromium with no extensions, no plugins, and no user data directory
- No cookies or cached data from prior sessions
- Standard Chromium user agent string
- Google Web Risk threat screening before each capture
- Capture originates from Cloudflare's network

This configuration satisfies the "sanitized environment" requirement: there is no pre-existing data, extraneous software, or cross-capture contamination. The `BrowserContext` isolation described in Section 3.4 above applies here as well.

The SWGDE document's recommendation to mimic the target audience -- presenting a specific location, user agent, or IP profile -- is a configurable behavior in manual forensic workflows. WRL currently does not support configurable geolocation, custom user agent overrides, or proxy routing to present a specific geographic origin. Captures present Cloudflare egress IPs with a standard Chromium user agent.

For investigations where the target content is gated behind geographic or identity signals, this limitation is material and the examiner should assess whether alternative acquisition methods are appropriate.

For the complete capture pipeline configuration, see [Architecture](/architecture/).

---

## Section 4.2 -- Content Volatility

SWGDE 21-F-001 Section 4.2 notes that content volatility or tampering may require multiple acquisitions to document content changes.

WRL supports this directly. Scheduled captures ([Schedules](/schedules/)) allow tenants to configure recurring captures of a URL on defined intervals -- hourly, daily, or custom cadences. The batch API ([Batch](/batch/)) allows submitting large sets of URLs for capture in a single request, supporting efficient acquisition of many URLs at once.

Each individual capture is a discrete signed, timestamped record. Comparing two captures of the same URL at different times produces two independently verifiable records that can demonstrate content change between those points in time. The SHA-256 bundle hash changes if any content changes; two captures with identical hashes confirm the content was identical at both capture times.

For volatile or ephemeral content, the schedules feature is the primary mechanism for documenting change over time. For one-time captures of many URLs, the batch API supports efficient acquisition without multiple individual API calls.

---

## Section 4.3 -- Tool Validation

SWGDE 21-F-001 Section 4.3 refers to the companion document *SWGDE Minimum Requirements for Testing Tools used in Digital and Multimedia Forensics* for tool validation guidance. That document establishes that forensic tools should be tested, and results should be repeatable and reproducible.

WRL's approach to tool validation operates across three layers:

**Source availability.** WRL's capture pipeline is source-available. The code that performs URL validation, browser rendering, WACZ assembly, hashing, signing, and timestamping can be read and audited at [github.com/benpeter/web-resource-ledger](https://github.com/benpeter/web-resource-ledger). Every security claim in the [Security Whitepaper](/security/whitepaper/) cites the specific source file implementing it.

**Independent verification.** The `@w-r-l/verify` package is a separate, source-available verifier that runs independently of WRL's infrastructure. Any party can verify a capture bundle by fetching it and running the verifier locally. The verifier resolves the signing key from WRL's public key endpoint and validates the RFC 3161 timestamp against DigiCert's certificate chain. This verification does not require trusting WRL for the pass/fail decision. See [Verification](/verification/) for the full verification protocol.

**CI test suite.** Deployments to production require a passing CI run. The test suite exercises the capture pipeline, hashing, signing, and verification against the Cloudflare Workers runtime using `@cloudflare/vitest-pool-workers`. Tests are run against the real Workers runtime, not a mocked environment.

WRL does not hold a third-party forensic tool certification. Examiners whose agency policies require a certified tool should evaluate WRL's source availability and independent verification capability against those requirements.

---

## Section 7.2 -- Format

SWGDE 21-F-001 Section 7.2 requires that online content be acquired in its native form, file formats, and language. Documentary evidence generated during acquisition should be preserved in standard formats.

WRL captures produce WACZ (Web Archive Collection Zipped) bundles. WACZ is an open standard maintained by the Webrecorder project, built on the established WARC (Web ARChive) format. A WACZ bundle is a ZIP archive containing:

- WARC files with the raw HTTP responses: HTML, CSS, JavaScript, images, and other resources in their native file formats
- CDXJ index files referencing the archived resources
- `pages/pages.jsonl` with page-level metadata
- `datapackage.json` manifest with SHA-256 hashes for every artifact
- `datapackage-digest.json` with the Ed25519 signature, RFC 3161 timestamp, and signing metadata

Content is captured as the browser receives it from the server -- in the native encoding, language, and format served. The bundle preserves both the rendered HTML and the underlying HTTP response data.

SWGDE Section 9 explicitly identifies zip and gzip as acceptable archive formats for preservation. WACZ is a ZIP-based format and satisfies this requirement directly.

For the full WACZ structure and integrity chain, see [Architecture](/architecture/).

---

## Section 7.3 -- Hashing

SWGDE 21-F-001 Section 7.3 requires using NIST-approved secure hash algorithms to calculate digests that validate and uniquely identify the entire collection data set and individual content files.

WRL uses SHA-256 throughout the capture pipeline. SHA-256 is a NIST-approved secure hash algorithm (FIPS 180-4). Hashing is applied at two levels:

- **Per-artifact hashes**: every individual file in the WACZ bundle (WARC files, CDXJ index, pages.jsonl) is hashed with SHA-256 at capture time. Hashes are recorded in `datapackage.json`.
- **Bundle hash**: the canonical JSON of `datapackage.json` is itself hashed with SHA-256 to produce the `bundleHash`. This single hash covers the integrity of all artifact hashes, making it the root of the integrity tree.

The `bundleHash` is the value that is signed with Ed25519 and submitted to the RFC 3161 Timestamp Authority. Verification recomputes the hash chain from individual artifacts through the bundle manifest and confirms the signature and timestamp match.

For the complete verification protocol and what each check confirms, see [Verification](/verification/).

---

## Section 7.5 -- Collection Documentation

SWGDE 21-F-001 Section 7.5 identifies the components that should be documented during the acquisition process:

- The URL, including protocol, domain, subdomains, and path, with session information where available
- Domain registration information
- History of the website from archival resources, if applicable
- Physical location, access IP address, browser, dates, timestamps, and local time zone of website access

WRL records the following documentation automatically for every capture:

| SWGDE 7.5 Item | WRL Record |
|---|---|
| URL (full, with protocol, domain, path) | Captured URL stored in D1 and recorded in WACZ `pages.jsonl` and `datapackage.json` |
| Timestamps | Capture-submitted-at and capture-completed-at in UTC; RFC 3161 timestamp from DigiCert binding the bundle hash to an independently verified time |
| Browser identity | Headless Chromium (version logged per capture) |
| Access IP address | Originates from Cloudflare egress; Cloudflare egress IPs are publicly documented |
| Process description | Automated capture pipeline described in certification PDF and [Architecture](/architecture/) |

Domain registration information and archival history (WHOIS, archive.org) are investigator-side documentation tasks that fall outside automated capture scope. The tenant or examiner is responsible for those records.

WRL generates a certification PDF for every signed capture (`GET /v1/captures/{captureId}/certificate`) that consolidates the process description, operator identity, bundle hash, Ed25519 signature, and RFC 3161 timestamp in a single document. This is designed to support the collection documentation requirement alongside the WACZ bundle. See [Legal Evidence](/legal-evidence/) for how these documentation elements map to legal authentication standards.

---

## Section 8.1.1 -- Utilities / API

SWGDE 21-F-001 Section 8.1.1 identifies API-based acquisition as the most inclusive acquisition method, preferred over web browser capture or screenshots. The document states:

> "APIs are often the most inclusive method of acquiring online content and can be used to search, aggregate, and extract content outside of the standard GUI. A service API call can capture what is being seen on a webpage in plain view as well as critical metadata that are not available through web pages and screen captures."

> "As this methodology can frequently discover the most amount of evidence needed, as well as provide a reasonable amount of guarantee on reliability of evidence, this methodology is preferred over the 'Web Browser Capture' or 'Screenshot' methods."

WRL is an API-first web capture service. Captures are submitted via `POST /v1/captures`, status is polled via `GET /v1/captures/{id}/status`, and completed capture records -- including artifact URLs, bundle hash, signature, and timestamp -- are retrieved via `GET /v1/captures/{id}`. Verification runs independently via `GET /v1/verify/{id}` or the `@w-r-l/verify` CLI.

The API captures both visible page content (rendered HTML, screenshots) and underlying metadata (HTTP headers, resource structure, WACZ manifest with per-artifact hashes). This aligns directly with SWGDE's characterization of API-based acquisition as more complete than browser capture or screenshots.

For the full API reference, see [API Reference](/api-reference/).

---

## Section 9 -- Preservation

SWGDE 21-F-001 Section 9 requires that all online content acquired be preserved, together with the documentary evidence generated during the process, to "a forensically sound image (e.g., .Lx01, .ad1) or other archive (e.g., zip, gzip) using industry standard procedures." The preservation artifact should include the examiner name, acquisition date and time, and evidence descriptions. For cases where the target site is still active, the document recommends preserving a working copy with live links disabled.

WRL's preservation format is the WACZ bundle. WACZ is a ZIP-based archive satisfying SWGDE's explicit acceptance of zip as an archive format. The bundle contains:

- All captured content in its native format (via WARC)
- Per-artifact SHA-256 hashes and the bundle hash in `datapackage.json`
- Ed25519 signature and RFC 3161 timestamp in `datapackage-digest.json`
- Operator identity embedded in the certification PDF available via `GET /v1/captures/{captureId}/certificate`
- Acquisition timestamps (submitted-at and completed-at) in UTC

The WACZ bundle is stored in R2 object storage and accessible via authenticated API. Tenants can download the bundle to long-term storage under their own custody. For preservation beyond WRL's infrastructure, tenants are responsible for downloading and archiving the bundle according to their evidence management procedures. See [Data Retention](/security/data-retention/) for WRL's retention policies.

**What WRL does not produce.** SWGDE references forensic disk images (`.Lx01`, `.ad1`) as one acceptable preservation format. WRL is a web capture service, not a disk imaging tool. The WACZ bundle is the output artifact; no forensic disk image is produced. Examiners whose agency requires a forensic disk image format should account for this in their evidence handling procedures -- for example, by writing the downloaded WACZ bundle into a forensic container using their agency's standard imaging tools.

SWGDE also recommends preserving working copies with live links disabled. WACZ bundles in this context are self-contained archives: the WARC files contain the HTTP responses captured at the time of collection, not live links that will re-fetch from the live site. Replay tools (such as the WACZ replay viewer) serve content from the archive, not the live URL.

---

> **This page is for informational purposes only and does not constitute legal advice.** The applicability of any legal standard depends on your jurisdiction, the specific proceeding, and the rules of the tribunal. Consult qualified legal counsel to evaluate how WRL evidence applies to your matter.
