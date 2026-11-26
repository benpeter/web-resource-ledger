---
layout: layouts/doc.njk
title: Website Records for SEC and FINRA Rules
description: What SEC Rules 17a-4 and 204-2 and FINRA Rule 2210 ask firms to keep of their website, and how signed WRL captures fit next to your archive.
---

# Website records for SEC and FINRA rules

Broker-dealers and investment advisers have to keep copies of what they publish, and a firm's website, blog and public social profiles count when they are about the business. An examiner can ask what a fee page or a performance chart said on a given date. This page sets out what the rules ask for, what they ask of the system that keeps the records, and where WRL fits. It is not legal advice; your compliance team decides how the rules apply to your firm.

## What the rules ask you to keep

### Broker-dealers

SEC Rule 17a-4(b)(4) under the Securities Exchange Act requires a firm to preserve "originals of all communications received and copies of all communications sent" that relate to "its business as such", including communications that fall under a self-regulatory organization's rules on communications with the public. They are kept for at least three years, the first two "in an easily accessible place".

FINRA Rule 2210(b)(4)(A) applies that to retail and institutional communications, which include a firm's website and its posts. The firm keeps them for the 17a-4(b) period, "in a format and media that comply with SEA Rule 17a-4", and the record has to include:

- a copy of the communication and the dates of its first and, if there is one, last use
- the name of the registered principal who approved it and the date of the approval

Under Rule 2210(b)(1)(A) a principal approves each retail communication before it is used. Posts on an "online interactive electronic forum" are the exception in Rule 2210(b)(1)(D)(ii): they need no approval beforehand, but the firm supervises them the way it supervises correspondence. FINRA Rule 4511 adds a six-year period for FINRA records that have no other period, in the same 17a-4 format.

### Investment advisers

Rule 204-2(a)(11)(i) under the Advisers Act requires "a copy of each advertisement" the adviser disseminates, directly or indirectly. Under Rule 204-2(e)(3)(i) the copy is kept for five years from the end of the fiscal year in which the adviser last disseminated it, the first two years in an office of the adviser.

## The record system is a separate requirement

Rule 17a-4(f) sets out what the electronic system that holds these records has to do. It keeps each record either with "a complete time-stamped audit trail" of every change and deletion, or in a "non-rewriteable, non-erasable format". It also checks its own storage, can produce a copy of any record with its audit trail, and comes with further conditions on access for regulators.

WRL is not built or offered as that system. It keeps no 17a-4(f) audit trail of a record's changes, makes no undertaking to regulators, and keeps captures for as long as your account exists (see [Data Retention](/security/data-retention/)). Firms keep their archive, from their archiving vendor or their own, as the system of record. WRL produces a record that goes into it.

## What a WRL capture adds

A screenshot taken by a staff member, or a crawl by your archive, shows what your own systems recorded. A WRL capture is made by a party outside the firm and can be checked by anyone:

- WRL loads the public page in a real browser and records the screenshot, the rendered HTML and the server's response headers.
- It hashes each file, signs the hashes with Ed25519 and gets an RFC 3161 timestamp from DigiCert for the time of capture.
- Anyone with the verification link can check the capture without an account, and `npx @w-r-l/verify` checks the downloaded bundle offline.

That helps with the dates Rule 2210 asks for. A daily capture of a page shows when its text changed, so the first and last use of a version can be read from the captures instead of from memory. When an examiner or a client disputes what a page said, the capture is evidence your firm couldn't have edited afterwards.

## Set it up

1. List the pages that carry regulated content: fee and pricing pages, performance pages, disclosures, the pages of each product, the firm's public social profiles.
2. Create a [schedule](/schedules/) for each, for example daily (`"cron": "0 6 * * *"`). The schedule list shows for each run whether the HTML or the screenshot changed since the run before.
3. Add a [webhook](/webhooks/) for `capture.complete`. When it arrives, download the WACZ bundle (`GET /v1/captures/{id}/artifacts/wacz`) and the certification PDF (`GET /v1/captures/{id}/certificate`), and file both in your archive with the page's name and the capture's time. The bundle then sits in your 17a-4 system like any other record, and its signature still verifies there.
4. Open the screenshot of a page's first capture before you rely on the schedule. Some sites put a sign-in or bot check in front of their pages, and WRL captures what a visitor who isn't signed in sees.

A capture that depends on what a signed-in user sees, such as a feed inside a social network, is out of reach for WRL; your social media archiving tool covers those.

## Related

- [Legal Evidence](/legal-evidence/): how WRL captures map to the Federal Rules of Evidence and to eIDAS
- [FINRA rules for social media posts](/use-cases/finra-social-media/)
- [Verification](/verification/): what each check on a capture means
