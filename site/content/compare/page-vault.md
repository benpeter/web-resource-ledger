---
layout: layouts/doc.njk
title: WRL vs Page Vault
description: How WRL and Page Vault differ for capturing web pages as evidence, where Page Vault is the better choice, and where WRL fits instead.
---

# WRL and Page Vault

[Page Vault](https://page-vault.com) is built for US litigation. A legal team browses with Page Vault Browser, a remote browsing application, or sends pages to Page Vault On Demand, a managed capture service, and gets back documents ready for a case. Page Vault also provides affidavits and expert witness testimony, and its captures have been admitted in more than ten documented federal cases.

WRL (Web Resource Ledger) is an API. Software, a script or an AI agent sends it a URL; WRL captures the page in a browser on its servers, signs the result and has it timestamped by an independent authority, and anyone can check the capture later without asking WRL. This page sets the two side by side.

## At a glance

| | WRL | Page Vault |
|---|---|---|
| Who captures | Your software, through the API or MCP server | A person in Page Vault Browser, or Page Vault's team |
| Signature on each capture | Ed25519, over a SHA-256 hash of every file | SHA-256 hashing |
| Timestamp | RFC 3161 from DigiCert, an independent authority; eIDAS-qualified as an option | Page Vault's own timestamps |
| Checking a capture | Public verification page, or `npx @w-r-l/verify` on your own machine | Page Vault's expert witness service |
| Affidavit or testimony | No | Yes |
| Court track record | New | More than ten documented federal cases |
| Format | WACZ (WARC inside), an open web archive format | Proprietary, PDF |
| Social media | Public pages only | Six platforms |
| Recurring captures | Schedules, hourly or slower | Recurring captures (since 2025) |
| API | REST API and MCP server | None |

Facts about Page Vault were checked against its public pages in November 2026; see [How WRL compares](/compare/) for the full table.

## Where Page Vault is the better choice

You need a person to stand behind the evidence. Page Vault provides affidavits and expert witnesses who can explain its process to a court. WRL provides a certification PDF that describes its process, but a qualified person on your side still has to adopt and sign it, and WRL does not testify.

The case is in a US court and the other side is likely to fight the evidence. Page Vault's captures have been through that in federal cases; WRL's are new to it. A cryptographic proof is strong, but a judge has to be shown what it means, and Page Vault's people do that for you.

You want a capture service rather than a tool. With Page Vault On Demand, Page Vault's team captures the pages for you. WRL expects you, or your software, to send the URLs.

The evidence is on social media. Page Vault captures six social platforms. WRL captures public web pages and cannot capture what only a signed-in user sees.

## Where WRL is different

Anyone can check a capture without trusting the company that made it. Each WRL capture has SHA-256 hashes of every file, an Ed25519 signature over them and an RFC 3161 timestamp from DigiCert. The verification page and the open-source `@w-r-l/verify` tool check all of that on their own, and the timestamp comes from a third party, so not even WRL could backdate a capture. With Page Vault, the evidence for a capture's integrity is Page Vault's hashing, its own timestamps and its witnesses.

It works in the EU as well. Accounts can add an eIDAS-qualified timestamp, which under Article 41(2) of the eIDAS Regulation is presumed accurate in every EU member state. [Legal Evidence](/legal-evidence/) explains both the US and the EU rules.

It is built for software. WRL takes a URL through a REST API or an MCP server, captures batches of up to 20 URLs, runs schedules and sends webhooks. That suits work where many pages are captured without a person clicking through each one: monitoring sellers, documenting a compliance survey, or an AI agent that saves its sources.

The format is open. A WRL capture is a WACZ file, the web archive format Webrecorder created and the Library of Congress recognises, and it opens in [ReplayWeb.page](https://replayweb.page) without WRL. ReplayWeb.page shows the captured HTML without the page's stylesheets and images; the signed screenshot shows how the page looked.

The price is public. 200 captures a month are free; after that a capture costs €0.05 down to €0.015, depending on volume.

## Using both

Capturing with WRL does not rule out Page Vault later. If pages you captured with WRL become part of US litigation and you want a witness, Page Vault can capture the ones still online with its own process. For pages that have changed or gone since, the signed WACZ files and their certification PDFs are the record, and a lawyer or expert can work from them.

## Further reading

- [Are screenshots admissible in court?](/screenshots-in-court/)
- [Legal Evidence](/legal-evidence/): how WRL captures map to FRE 901 and 902 and to eIDAS Article 41
- [Verification](/verification/): what each check confirms
- [How WRL compares](/compare/) with ten tools and approaches
