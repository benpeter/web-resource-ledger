---
layout: layouts/doc.njk
title: WRL vs PageFreezer
description: How WRL and PageFreezer differ for archiving web pages as evidence, where PageFreezer is the better choice, and where WRL fits instead.
---

# WRL and PageFreezer

[PageFreezer](https://pagefreezer.com) is an enterprise archiving and compliance platform. It crawls whole websites daily or more often, archives social media accounts and collaboration tools such as Teams, Slack and Workplace, and is FedRAMP authorized for website archiving and SOC 2 certified. Its WebPreserver browser extension collects social media evidence for investigators. Organisations with record-keeping duties use it to keep a complete history of what they published.

WRL (Web Resource Ledger) captures single pages when you ask, through an API. Each capture is signed and timestamped by an independent authority, and anyone can check it without an account. This page sets the two side by side.

## At a glance

| | WRL | PageFreezer |
|---|---|---|
| What it archives | Web pages you send it, one URL at a time or in batches of up to 20 | Whole websites, social media accounts, collaboration tools |
| Recurring captures | Up to 10 schedules, hourly or slower | Daily or more frequent crawls |
| Social media | Public pages only | More than eight platforms, through their APIs |
| Signature on each capture | Ed25519, over a SHA-256 hash of every file | SHA-256 digital signature |
| Timestamp | RFC 3161 from DigiCert; eIDAS-qualified as an option | From a time stamp authority synchronized with a Stratum-1 time server |
| Checking a capture | Public verification page, or `npx @w-r-l/verify` on your own machine | Inside the PageFreezer platform |
| Format | WACZ (WARC inside) | WARC, PDF, native files |
| Compliance certifications | None | FedRAMP (website archiving), SOC 2 |
| API | REST API and MCP server | Partner API |

Facts about PageFreezer were checked against its public pages in November 2026; see [How WRL compares](/compare/) for the full table.

## Where PageFreezer is the better choice

You have to keep a record of everything you publish. Financial firms, public bodies and regulated companies often must archive their own websites and social media in full. PageFreezer crawls whole sites on a schedule and archives social accounts and collaboration tools through their APIs, with compliance dashboards and reports for the people who answer to regulators. WRL captures the pages you name and offers small schedules, at most ten, hourly or slower.

You need social media and chat archived as data. PageFreezer pulls posts, comments, edits and deletions from more than eight social platforms, and messages from Teams, Slack and Workplace. WRL captures public web pages only and cannot capture what a signed-in user sees.

Your procurement asks for certifications. PageFreezer is FedRAMP authorized for website archiving and SOC 2 certified. WRL has neither; its [security pages](/security/) describe what it does instead.

## Where WRL is different

Anyone can check a capture. PageFreezer verifies its archives inside its own platform. A WRL capture has a public verification page that needs no account, and the open-source `@w-r-l/verify` tool checks the hashes, the Ed25519 signature and the timestamp on your own machine, without asking WRL whether the capture is genuine. That helps when the person who has to trust the capture is on the other side of a dispute.

The timestamp authority is named. Every WRL capture is timestamped by DigiCert under RFC 3161, and accounts can add an eIDAS-qualified timestamp, which under Article 41(2) of the eIDAS Regulation is presumed accurate in every EU member state. PageFreezer describes its time stamp authority as "RFC 3136 compliant", which reads like a typo for RFC 3161, and does not say whether a third party runs it.

It is built for single pages and for software. Sending a URL to WRL takes one API call or one request from an AI agent through the MCP server, and a capture usually completes in 20 to 60 seconds. That suits evidence work: a page that a seller, a competitor or a public body shows today, captured before it changes.

It starts free and the price is public. 200 captures a month cost nothing; after that a capture costs €0.05 down to €0.015, depending on volume. There is no contract to sign first.

## Using both

They answer different questions. PageFreezer keeps a complete archive of what your own organisation published. WRL captures specific pages, often other people's, as evidence anyone can check. An organisation can run PageFreezer for its own records and use WRL when a single page has to stand up on its own.

## Further reading

- [Are screenshots admissible in court?](/screenshots-in-court/)
- [Legal Evidence](/legal-evidence/): how WRL captures map to FRE 901 and 902 and to eIDAS Article 41
- [Verification](/verification/): what each check confirms
- [How WRL compares](/compare/) with ten tools and approaches
