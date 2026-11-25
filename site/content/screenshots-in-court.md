---
layout: layouts/doc.njk
title: Are Screenshots Admissible in Court?
description: What US and EU courts ask of a screenshot of a web page, why plain screenshots get challenged, and what makes a web capture harder to dispute.
---

# Are screenshots admissible in court?

Often, yes. Courts in the US and in EU countries admit screenshots of web pages all the time. Getting one admitted is rarely the hard part. The hard part is showing that it is what you say it is: that this URL showed this content at this time, and that nobody changed it since. This page explains what courts look at, why plain screenshots get challenged, and what makes a capture of a web page harder to dispute.

This is general information, not legal advice. Rules differ by country, court and case; ask a lawyer about yours.

## What a US court asks first

Under the Federal Rules of Evidence, whoever offers a screenshot has to authenticate it. Rule 901(a) asks for "evidence sufficient to support a finding that the item is what the proponent claims it is." For a screenshot, the claim is usually that a given URL showed this content at a given time.

Rule 901(b) lists ways to meet that bar. For web pages, three come up most:

- Testimony of a witness with knowledge, Rule 901(b)(1): usually the person who took the screenshot says it matches what they saw.
- Distinctive characteristics, Rule 901(b)(4): the URL, dates, names and content fit the claim.
- A process or system that produces an accurate result, Rule 901(b)(9): for example an automated capture tool, described by someone who knows how it works.

Since December 2017, Rules 902(13) and 902(14) also let electronic records and copies authenticate themselves through a written certification from a qualified person, so nobody has to take the stand just to lay the foundation. The committee notes to Rule 902(14) name hash values as the typical way to show a copy matches the original.

The bar for authentication is low, so the fight usually moves to weight. A judge can admit a screenshot and the other side can still argue that it was edited, misdated or cropped, and the judge or jury decides how much to believe it. The opinion most often cited on authenticating electronic evidence, *Lorraine v. Markel American Insurance Co.*, 241 F.R.D. 534 (D. Md. 2007), goes through each of these rules.

## Why plain screenshots get challenged

A screenshot is an image file, and three things about it are easy to attack.

It can be changed. Anyone can edit the text of a page in the browser's developer tools before taking the screenshot, or edit the image afterwards, and the image does not show it.

Its date proves little. The file date and the clock on the screen come from the computer that took it, and whoever controls that computer can set them.

It shows one view. A screenshot has no page source, no link targets and no record of what the browser loaded, so it cannot answer questions about what else was on the page or where the content came from.

Once the page has changed or gone, the person who took the screenshot is often the only evidence that it is accurate. Their memory, their methods and their interest in the outcome are then what the other side cross-examines.

## What makes a web capture harder to dispute

Each of those weaknesses has a technical answer:

| What the other side asks | What answers it |
|---|---|
| Could it have been edited? | A hash of every file, recorded when the page was captured, and a digital signature over those hashes. Any later change makes the check fail. |
| When was it taken? | A timestamp from an independent timestamp authority (RFC 3161), bound to the hashes, so the person who made the capture cannot backdate it. |
| How was it made? | An automated capture by a documented process, with the capture conditions written down: browser, time, settings, and what went wrong if anything did. |
| What else was on the page? | The page itself, not only a picture of it: HTML, images, scripts and network traffic in a standard web archive format such as WARC or WACZ. |
| Can someone else check it? | Verification that anyone can run, without trusting the party who made the capture. |

None of this replaces a witness or a Rule 902(13) or 902(14) certification. It gives the witness or the person signing the certification something specific to point to, and it leaves the other side little to argue about.

## In the EU: qualified timestamps

Many EU legal systems let the judge weigh evidence freely, so a screenshot is not thrown out for being a screenshot. The same doubts about editing and dates still decide how much it counts.

The eIDAS Regulation (Regulation (EU) No 910/2014) adds a rule that matters here. Article 41(1) says an electronic timestamp cannot be refused as evidence only because it is electronic or not qualified. Article 41(2) gives a qualified electronic timestamp, issued by a trust service provider on the EU Trusted List, "the presumption of the accuracy of the date and the time it indicates and the integrity of the data to which the date and time are bound." The other side then has to prove the timestamp wrong, instead of you having to prove it right, and Article 41(3) makes that hold in every EU member state.

## How WRL fits

Web Resource Ledger (WRL) captures a page from its URL in a browser on WRL's servers and packages it as a WACZ file: the page's HTML and network traffic as WARC, screenshots, a SHA-256 hash of each file, an Ed25519 signature over those hashes, and an RFC 3161 timestamp from DigiCert. Accounts can add an eIDAS-qualified timestamp. Each capture also records which Cloudflare data center and country the browser loaded the page from.

Anyone can check a capture from its verification link, without an account, or on their own machine with `npx @w-r-l/verify`. Each capture also comes with a certification PDF that describes the capture process, written to support a Rule 902(13) foundation. A qualified person still has to adopt and sign that certification. [Legal Evidence](/legal-evidence/) explains how each part maps to the rules.

WRL has limits worth knowing before a case depends on it. It loads each page in a fresh browser, so it cannot capture what only a signed-in user sees. It does not provide witnesses or testimony; [Page Vault](/compare/page-vault/) does. And it can only capture a page from now on: for what a page showed last year, the [Wayback Machine](/compare/wayback-machine/) may have a copy.

## Further reading

- [Legal Evidence](/legal-evidence/): how WRL captures map to FRE 901 and 902 and to eIDAS Article 41
- [Verification](/verification/): what each check confirms and how to run it
- [How WRL compares](/compare/), and side by side with the [Wayback Machine](/compare/wayback-machine/), [Page Vault](/compare/page-vault/) and [PageFreezer](/compare/pagefreezer/)
