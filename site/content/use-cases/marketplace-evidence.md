---
layout: layouts/doc.njk
title: Capture Evidence of a Seller or Listing
description: Keep verifiable, timestamped evidence of an online listing, seller profile or review before it changes or disappears, with an optional eIDAS qualified timestamp.
---

# Capture evidence of a seller or listing

You're in a dispute with an online seller, you found a counterfeit or illegal listing, or a review or profile matters to a complaint. The page can change or vanish once the other side notices. A screenshot alone is easy to dispute.

A WRL capture loads the page in a real browser, records what it showed, signs it, and has an independent authority timestamp it. Anyone can check the capture from its verification page, and the WACZ bundle holds the screenshot, the rendered HTML and the server's response headers.

## Capture the pages

[Sign in](https://api.webresourceledger.com/auth/login?from=docs) and paste the URL into the capture form in the web UI. Capture each page that matters on its own: the listing, the seller's profile, the reviews, the terms you relied on. A capture takes a few seconds.

Capture the same page again later if you need to show that it changed or was taken down. Each capture keeps its own time and signature.

## Check the screenshot

Some marketplaces put a bot check in front of their pages. WRL doesn't get around those: when it sees one ("Just a moment..."), the capture fails with "The site showed a bot check instead of the page" and doesn't count against your quota. Try again later, or capture the page another way. Open the screenshot of every capture that completed anyway, before you rely on it.

## Qualified timestamps for EU proceedings

Every capture carries a standard RFC 3161 timestamp. If you may need the evidence in an EU member state, turn on Qualified Timestamps (eIDAS) in Settings before you capture. Captures then also carry a timestamp from a qualified trust service provider. Under eIDAS Article 41(2), such a timestamp is presumed accurate, which shifts the burden to whoever disputes the time. The first 50 qualified timestamps each month are free, then €0.10 each.

[Legal Evidence](/legal-evidence/) explains how WRL captures map to the US Federal Rules of Evidence and to eIDAS. Whether a court admits a capture is up to the court; WRL gives you the technical record, not legal advice.

## Share the evidence

Send the verification link (`https://api.webresourceledger.com/v1/verify/{id}`) to your lawyer, the platform's complaints team or the other party. It works without an account. For an offline check, the [`@w-r-l/verify`](/verification/) CLI verifies the downloaded WACZ bundle against WRL's published signing key.
