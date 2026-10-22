---
layout: layouts/doc.njk
title: Document a Compliance Survey Across Many Websites
description: Capture the same kind of page across many organisations, such as privacy notices or accessibility statements, and attach a verifiable, timestamped record of each one to your findings.
---

# Document a compliance survey across many websites

You check the same kind of page across many organisations: privacy notices, accessibility statements, price lists, published contracts. Your findings say what each page showed on a given day, and someone may question them later.

WRL gives you a signed, timestamped capture of every page you checked, with a public verification link you can put next to each finding. A reviewer can open the link and see the capture and its checks without an account or trust in your systems.

## Step 1: Build the list

Put one URL per line in `urls.txt`, in the order of your survey. Keep a second column with the organisation name in your own spreadsheet. WRL only needs the URLs.

## Step 2: Capture all pages

Submit the list in batches of 20 (see [Batch Captures](/batch/)) and write each capture ID next to its URL:

```bash
split -l 20 urls.txt batch-
for f in batch-*; do
  jq -R '{url: .}' "$f" | jq -s '{urls: .}' |
  curl -s -X POST https://api.webresourceledger.com/v1/captures/batch \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- | jq -r '.items[] | select(.id) | "\(.url)\t\(.id)"' >> captures.tsv
done
```

## Step 3: Add the evidence to your findings

For each capture ID, the verification page is `https://api.webresourceledger.com/v1/verify/{id}`. Add that link to the row of your spreadsheet or report. It shows the screenshot, the capture time and the result of each integrity check.

Look at the screenshots before you rely on them. Some sites show a bot check or a cookie wall instead of the page. Recapture those, and note in your findings where a page couldn't be captured.

## Step 4: Repeat the survey

To show whether pages changed, run the same list again later and compare. For a few pages you watch over time, a [schedule](/schedules/) captures each one on a cron cadence (at most hourly) without a script. You can then list a page's captures with `GET /v1/captures?url=...` and see each version with its date.

## How much it costs

The free tier covers 200 captures and 10 GB of storage a month, which is enough for a survey of up to 200 pages. With a payment method there is no monthly cap, and captures cost €0.05 each, less at volume. See [Limits & Quotas](/limits/).
