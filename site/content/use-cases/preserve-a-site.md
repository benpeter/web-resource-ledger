---
layout: layouts/doc.njk
title: Preserve a Website Before It Goes Offline
description: Capture every page of a website as signed, timestamped WACZ evidence before the domain expires or the site is taken down, and keep a verification link for each page.
---

# Preserve a website before it goes offline

A domain is about to expire, a project is ending, or a site will be taken down. You want a copy of each page, and proof of what the page showed on the day you saved it.

Each WRL capture stores a screenshot, the rendered HTML and the HTTP response headers in a WACZ bundle. WRL signs the bundle with Ed25519 and has an independent RFC 3161 authority timestamp it, so anyone can later check that the capture wasn't changed and when it was made. Every capture also has a verification page you can link to.

## Step 1: List the pages

Most sites publish their pages in `sitemap.xml`. WRL reads a sitemap (or a sitemap index and up to 10 of its child sitemaps) and lists up to 200 page URLs from it.

WRL captures the URLs you give it. It doesn't follow links, so pages missing from the sitemap need to be added by hand.

## Step 2: Submit the pages in batches

In the [web UI](https://api.webresourceledger.com/ui), open **Capture a list of URLs or a sitemap**, enter the sitemap's URL and choose **Load sitemap**. It lists up to 200 pages; remove the ones you don't need and choose **Capture all**. The dashboard submits them at your rate limit (10 captures a minute unless raised), so keep the page open until it says it's done.

With the API, read the sitemap with `POST /v1/sitemap` and send the URLs to the batch endpoint. Each URL counts against the per-minute rate limit, so send at most 10 a minute. This loop does that and keeps every capture ID with its URL:

```bash
curl -s -X POST https://api.webresourceledger.com/v1/sitemap \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/sitemap.xml"}' | jq -r '.urls[]' > urls.txt

split -l 10 urls.txt batch-
for f in batch-*; do
  jq -R '{url: .}' "$f" | jq -s '{urls: .}' |
  curl -s -X POST https://api.webresourceledger.com/v1/captures/batch \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- | jq -r '.items[] | select(.id) | "\(.id)\t\(.url)"' >> captures.tsv
  sleep 60
done
```

## Step 3: Check the results

Each capture takes a few seconds to a minute. Poll `GET /v1/captures/{id}/status` until it says `complete` or `failed`, or list everything you captured today:

```bash
curl "https://api.webresourceledger.com/v1/captures?created_after=2026-10-22T00:00:00Z&limit=100" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Open a few screenshots before the site goes away. Some sites put a bot check in front of their pages; WRL doesn't get around those, and the capture fails with "The site showed a bot check instead of the page". Retry those later, or save them another way while you still can.

## Step 4: Keep the links

The verification page for a capture is `https://api.webresourceledger.com/v1/verify/{id}`. It needs no account, so you can put the links in a spreadsheet, a report, or a message to whoever needs the copy. The WACZ bundle opens in [ReplayWeb.page](https://replayweb.page), and the [`@w-r-l/verify`](/verification/) CLI checks a bundle offline.

## How much it costs

The free tier covers 200 captures and 10 GB of storage a month. A page can take several megabytes, so larger sites may need a payment method; then captures cost €0.05 each, with lower rates at volume. See [Limits & Quotas](/limits/).

## Use it together with the Wayback Machine

The [Wayback Machine](https://web.archive.org) is free and public, and its "Save Page Now" form adds a page to the archive anyone can browse. WRL captures stay private to your account until you share a link, and each one is signed and timestamped. If the site matters to the public, saving it in both places costs little.
