---
layout: layouts/doc.njk
title: WRL vs the Wayback Machine
description: How WRL and the Internet Archive's Wayback Machine differ as a record of a web page, and when to use which, or both.
---

# WRL and the Wayback Machine

The [Wayback Machine](https://web.archive.org) is the Internet Archive's public web archive. It has archived more than one trillion pages since 1996, it is free, and anyone can ask it to save a page with Save Page Now. For "what did this page look like last year?" it is usually the first place to look, and courts have accepted its copies, often together with an affidavit from the Internet Archive.

WRL (Web Resource Ledger) does something narrower. It captures a page when you ask, signs the capture and has it timestamped by an independent authority, so anyone can later check that the copy is unchanged and when it was made. This page sets the two side by side.

## At a glance

| | WRL | Wayback Machine |
|---|---|---|
| Cost | 200 captures a month free, then €0.05 down to €0.015 per capture | Free |
| Pages from before you needed them | No, only from the time you capture | Yes, back to 1996 for many sites |
| Signature on each capture | Ed25519, over a SHA-256 hash of every file | None |
| Timestamp | RFC 3161 from DigiCert; eIDAS-qualified as an option | The archive's own crawl time |
| Who can find a capture | Only people you give its link to; captures are not listed or searchable | Everyone |
| How long a copy stays | While your account is active | The Internet Archive removes pages when site owners ask |
| Checking a copy | Public verification page, or `npx @w-r-l/verify` on your own machine | Trust in the Internet Archive |
| Format | WACZ (WARC inside) | WARC |
| API | REST API and MCP server | Public API, rate-limited (15 requests a minute) |
| Affidavit or testimony | No | Affidavits from the Internet Archive, for a fee |

Facts about the Wayback Machine were checked against its public documentation in November 2026; see [How WRL compares](/compare/) for the full table and sources.

## Where the Wayback Machine is the better choice

It has the past. If a page changed before anyone thought to save it, the Wayback Machine may have a copy, and WRL cannot help: it only captures from the moment you ask.

It costs nothing and is widely recognised. Judges, journalists and researchers know the Wayback Machine, and the Internet Archive answers requests for affidavits about its copies. For many questions, that institutional standing is enough.

It is public on purpose. A Wayback copy is a public record that anyone can cite and link to, which is what you want when the point is to preserve the page for everyone.

## Where WRL is different

The proof travels with the copy. A Wayback copy is trustworthy because the Internet Archive is. A WRL capture has its own evidence: SHA-256 hashes of every file, an Ed25519 signature over them, and an RFC 3161 timestamp from DigiCert, an independent timestamp authority. Anyone can check those without asking WRL whether the capture is genuine. An archive that is not signed asks its readers to trust whoever stores the copy; the [compare page](/compare/#why-a-signature-made-at-capture-time-matters) describes what happened when that trust broke at archive.today.

Nobody finds it unless you share it. Saving a page to the Wayback Machine tells the world, including the site owner, that someone saved it. WRL does not list or index captures: a capture is reached through its link, which has a random ID, and only the people you give that link to can open it. That matters in an investigation or before a dispute is public.

It stays while you need it. The Internet Archive removes pages from the Wayback Machine when site owners ask, so a copy you rely on can disappear later. WRL keeps captures for as long as your account is active and does not take them down at the request of the site you captured; the exceptions are in [Data Retention](/security/data-retention/), such as captures flagged by threat detection.

It records how the page was captured. Each WRL capture says whether the page loaded fully, whether the screenshot was cut off, how a cookie banner was handled, and which Cloudflare data center and country the browser loaded the page from. These records are inside the signed bundle.

It is built for software. WRL has a REST API, batches of up to 20 URLs, schedules, webhooks and an MCP server for AI agents. The Wayback Machine's public API is rate-limited to 15 requests a minute.

## Using both

They do not exclude each other. For a page that matters, capture it with WRL for a signed, timestamped copy you control, and also save it to the Wayback Machine so a public copy exists that anyone can find. If a page has already changed, look in the Wayback Machine first; WRL can then capture what the page shows today.

## Further reading

- [Are screenshots admissible in court?](/screenshots-in-court/)
- [Legal Evidence](/legal-evidence/): how WRL captures map to FRE 901 and 902 and to eIDAS Article 41
- [Verification](/verification/): what each check confirms
- [How WRL compares](/compare/) with ten tools and approaches
