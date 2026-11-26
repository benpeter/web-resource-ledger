---
layout: layouts/doc.njk
title: Evidence for DMCA and DSA Takedowns
description: What to capture before you send a DMCA or DSA takedown notice and after your own content is removed, what the law asks of each notice, and how WRL fits.
---

# Evidence for DMCA and DSA takedowns

A takedown notice that works removes the page it complains about. From then on neither side can show what the page said. The rights holder who sent the notice has no infringing copy left to point to, and the person who posted the content can no longer show what they had published. This page sets out what US copyright law and the EU Digital Services Act ask of a notice and of a reply to one, what each side should capture and when, and where WRL fits. It is not legal advice; ask a lawyer how these rules apply to your case.

## What a notice has to contain

### United States: 17 U.S.C. § 512(c)(3)

What people call a DMCA notice is a notification under section 512 of the US Copyright Act. It covers copyright only: the US Copyright Office says "Only a copyright owner or the owner's authorized agent can submit a takedown notice under section 512." To be effective, the notice has to be in writing, go to the provider's designated agent, and include "substantially the following" (section 512(c)(3)(A)):

- a physical or electronic signature of someone authorized to act for the owner of the right
- identification of the copyrighted work, or "a representative list" when one notice covers several works on the same site
- identification of the infringing material, with "information reasonably sufficient to permit the service provider to locate the material"
- contact details for the sender
- a statement of "a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law"
- a statement that the notice is accurate and, "under penalty of perjury", that the sender is authorized to act for the owner

A provider that wants the liability protection of section 512(c) then "responds expeditiously to remove, or disable access to, the material".

### European Union: Digital Services Act, Article 16

Under Article 16 of the Digital Services Act (Regulation (EU) 2022/2065), hosting providers need a mechanism that lets "any individual or entity" report content they consider illegal. That covers more than copyright: recital 12 lists "the sale of non-compliant or counterfeit products" and "the non-authorised use of copyright protected material" among its examples. The mechanism has to allow notices that contain all of these (Article 16(2)):

- "a sufficiently substantiated explanation of the reasons" why the sender considers the content illegal
- "a clear indication of the exact electronic location of that information, such as the exact URL or URLs"
- the sender's name and email address (reports of child sexual abuse offences are the exception)
- a statement of the sender's "bona fide belief" that what the notice says is "accurate and complete"

The provider then tells the sender its decision and how to contest it "without undue delay" (Article 16(5)).

## If you send the notice

Both laws make you say where the material is, and those are the pages that go away. Capture them before you send anything:

- each URL you will list in the notice, one capture per URL
- the pages that show who posted it: the uploader's or seller's profile, and for a listing the page with its price and terms (see [Capture evidence of a seller or listing](/use-cases/marketplace-evidence/))
- the page where you published your own work, because a DMCA notice has to identify that work

Put each capture's verification link next to its URL in the notice, where the form has room for it. Whoever reviews the notice can then see what the URL showed on the day you reported it, even if the page has changed since.

Keep capturing after you send it. A [schedule](/schedules/) that captures the URL once a day from the day you found it shows the day the content went away, and the dashboard marks each scheduled capture "Changed" or "Unchanged" against the one before. When the URL answers with an error such as 404, or with a removal message, WRL captures that answer and signs it like any other page, unless the page is empty: then the capture fails.

You need the captures again if the uploader contests the removal. Under section 512(g) the person who posted the material can answer with a counter-notice, a written statement that the removal was a mistake. The provider then has to put the material back "not less than 10, nor more than 14, business days" after it receives the counter-notice, unless you tell it first that you have "filed an action seeking a court order" against that person.

## If your content was taken down

The provider has to tell you. In the US it takes "reasonable steps promptly to notify the subscriber that it has removed or disabled access to the material" (section 512(g)(2)(A)). In the EU, Article 17 gives you "a clear and specific statement of reasons" for a removal, whether the provider calls the content illegal or says it breaks its terms. The statement says whether the decision followed an Article 16 notice, names the legal or contractual ground, and lists "the possibilities for redress". Keep that message. WRL captures public pages, so it cannot capture an email or a notice inside your account.

A counter-notice under section 512(g)(3) has your signature, name, address and telephone number, and a statement "under penalty of perjury" that you have "a good faith belief that the material was removed or disabled as a result of mistake or misidentification". It has to identify the material and "the location at which the material appeared before it was removed"; a capture from before the removal records both. In it you also consent to the jurisdiction of a US federal district court and agree to accept service of process from the person who sent the notice.

Section 512(f) applies to both sides: a person who "knowingly materially misrepresents" that material is infringing, or that it "was removed or disabled by mistake or misidentification", is liable for the damages that causes.

In the EU, an online platform has to take your complaint about the decision, free of charge, for "at least six months" after it told you (Article 20). Micro and small enterprises are exempt unless they are very large online platforms (Article 19). You can also go to a certified out-of-court dispute settlement body (Article 21), or to court at any stage.

WRL can only capture a page from now on, so the capture that helps most is the one you made before the removal. What to capture, in order:

1. Before anything happens, create schedules for the pages your business depends on: shop listings, a channel or profile page, the posts that bring in most of your visitors. Each capture shows what you had published at that time.
2. When you learn of the removal, capture the URL straight away. The capture records what the URL shows now, including a removal message if the platform puts one there.
3. Before you reply, capture the pages your reply relies on while they are still online. That can be the page with the license you used the work under, the earlier publication you say is the original, or the clause of the platform's terms that the statement of reasons cites.
4. If the content comes back, capture it again, so that the day it came back is on record too.

If you have no capture from before the removal, the [Wayback Machine](/compare/wayback-machine/) may have a copy.

## Why a screenshot alone is weak

A screenshot is an image file made on your own computer. The page's text can be edited in the browser before the screenshot is taken, the file's date comes from a clock you control, and once the page is gone there is nothing to compare it with. [Are screenshots admissible in court?](/screenshots-in-court/) goes through what courts ask of one.

WRL loads the page in a browser on its own servers, so the capture doesn't depend on your computer. It records the screenshot, the rendered HTML and the server's response headers, hashes each file, signs the hashes with Ed25519 and gets an RFC 3161 timestamp from DigiCert, an independent timestamp authority. Anyone with the verification link can check the capture without an account; [Verification](/verification/) explains each check.

Whether a platform, a dispute settlement body or a court accepts a capture is up to them. [Legal Evidence](/legal-evidence/) explains how captures map to the US Federal Rules of Evidence and to eIDAS.

## Set it up

1. [Sign in](https://api.webresourceledger.com/ui?from=docs) and paste a URL into the capture form. For many URLs, open **Capture a list of URLs or a sitemap** and paste up to 200, one per line; the dashboard submits them at your rate limit (10 captures a minute unless raised). With the API, [`POST /v1/captures/batch`](/batch/) takes up to 20 URLs per request.
2. Open the screenshot of each capture before you rely on it. WRL doesn't get around bot checks, and it cannot capture what only a signed-in user sees. Its browsers have so far all been in the United States, so a capture shows what a visitor there gets: content that a platform has blocked in only one country may still show up in the capture.
3. Create a [schedule](/schedules/) for each URL you want watched, for example daily (`"cron": "0 6 * * *"`). An account can have 10 schedules, and a schedule runs once an hour at most.
4. For a dispute in the EU, turn on Qualified Timestamps (eIDAS) in Settings before you capture. Captures then also have a timestamp from a qualified trust service provider, which eIDAS Article 41(2) presumes to be accurate. The first 50 a month are free, then €0.10 each.
5. Keep each capture's verification link (`https://api.webresourceledger.com/v1/verify/{id}`) with your notice or your reply, and download the WACZ bundle and the certification PDF for your own files.

The free tier covers 200 captures and 10 GB of storage a month; see [Limits & Quotas](/limits/).

## Related

- [Legal Evidence](/legal-evidence/): how WRL captures map to the Federal Rules of Evidence and to eIDAS
- [Are screenshots admissible in court?](/screenshots-in-court/)
- [Capture evidence of a seller or listing](/use-cases/marketplace-evidence/)
- [Verification](/verification/): what each check on a capture means
