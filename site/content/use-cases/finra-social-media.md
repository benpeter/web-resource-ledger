---
layout: layouts/doc.njk
title: FINRA Rules for Social Media Posts
description: What FINRA's social media guidance asks of firms' posts and linked pages, and how a signed, timestamped WRL capture records what a public page showed.
---

# FINRA rules for social media posts

A member firm's posts on social networks are communications with the public under FINRA Rule 2210, and the firm keeps records of them like any other. FINRA has explained how the rules apply in three Regulatory Notices: 10-06 (2010), 11-39 (2011) and 17-18 (April 2017). This page sums up the parts that decide what to keep, and shows where a WRL capture helps. It is not legal advice.

## What FINRA asks for

### Keep the records

Notices 10-06 and 11-39 remind firms that communications relating to their "business as such" have to be retained under SEC Rule 17a-4(b)(4), on social media as anywhere else. Notice 11-39 adds that whether a post must be kept depends on its content, not on the device or service used to send it. Notice 10-06 says a firm has to be able to keep those records before it lets its people communicate through social media at all.

### Approve static posts, supervise interactive ones

Notice 10-06 treats static content, such as a profile or a post that stays up, as an advertisement that needs a principal's approval before it is posted. Rule 2210(b)(1)(A) requires that approval for each retail communication before use. Since February 2013 the rule itself spells out the exception: Rule 2210(b)(1)(D)(ii) exempts posts on an "online interactive electronic forum", which the firm supervises like correspondence instead.

### Third-party content

Notice 17-18 says FINRA generally doesn't treat a customer's or anyone else's post on a firm's page as the firm's communication. It becomes the firm's when the firm or its people paid for or helped prepare it ("entanglement") or endorsed or approved it ("adoption").

### Links

Under Notice 11-39, as Notice 17-18 restates it, a firm may not link to a third-party site that it knows or has reason to know contains false or misleading content. A firm that adopts or is entangled with the content of a linked site is responsible for it under the rules.

## Where WRL helps

The records themselves belong in your archive (see [Website records for SEC and FINRA rules](/use-cases/sec-finra-website-records/) for what Rule 17a-4(f) asks of that system, and why WRL is not it). A WRL capture adds a copy of a public page that someone outside your firm made, signed and timestamped, and that anyone can check from its verification link without an account.

That fits three moments:

- When a post or profile goes up, capture its public page once the principal has approved it. The capture shows what was published and when, next to the approval in your records.
- When you link to someone else's page, capture that page as you post the link. If the page changes later, the capture shows what it said when you chose to link to it, which is the moment the rule on links is about.
- When a third party posts on your page, capture the page when your supervision reviews it, so you have a record of the post as you saw it, whether you leave it up or take it down.

Paste the URL into the [web UI](https://api.webresourceledger.com/ui?from=docs) or send it to `POST /v1/captures`. A capture takes 20 to 60 seconds. For a page that changes often, a daily [schedule](/schedules/) records each version.

## What WRL can't capture

WRL captures what a visitor who isn't signed in sees. Many social networks show such a visitor a sign-in page or only part of a post, and some put a bot check in front of their pages. Open the screenshot of every capture before you rely on it. Feeds, direct messages and anything else that needs an account are for your social media archiving tool.

## Related

- [Website records for SEC and FINRA rules](/use-cases/sec-finra-website-records/)
- [Legal Evidence](/legal-evidence/): how WRL captures map to the Federal Rules of Evidence and to eIDAS
- [Capture evidence of a seller or listing](/use-cases/marketplace-evidence/)
