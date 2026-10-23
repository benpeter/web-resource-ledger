---
layout: layouts/doc.njk
title: Support
description: How to get help with WRL. GitHub issues for bugs, email for account, billing and data requests. Support is best effort and no plan includes an SLA.
---

# Support

WRL is run by one person. Support is best effort: emails usually get an answer within a few working days, but no response time is guaranteed.

## Where to ask

| You want to | Where |
|---|---|
| Report a bug or ask for a feature | [GitHub issues](https://github.com/benpeter/web-resource-ledger/issues). Issues are public, so leave out API keys and any URL you don't want to share. |
| Ask about your account, billing or a refund | [hello@webresourceledger.com](mailto:hello@webresourceledger.com) |
| Export or delete your data | [hello@webresourceledger.com](mailto:hello@webresourceledger.com). [Data Retention](/security/data-retention/) explains what deletion removes. |
| Report a capture that breaks the [Content Policy](https://webresourceledger.com/content-policy) | [hello@webresourceledger.com](mailto:hello@webresourceledger.com) |
| Report a security vulnerability | Privately through [GitHub Security Advisories](https://github.com/benpeter/web-resource-ledger/security/advisories/new), not in a public issue |

## Before you write

The docs answer the most common questions:

- **Why did a capture fail?** The capture's `error` field says why, and [Why Captures Fail](/limits/#why-captures-fail) lists every message.
- **Why was a request refused?** [Limits & Quotas](/limits/) explains rate limits and the monthly allowance.
- **How do I check a capture?** See [Verification](/verification/).

If you write about a specific capture, include its ID (it starts with `cap_`). The logs can then be searched without a round of follow-up questions.

## Service level

No plan includes an SLA, for uptime or for response times. Failed captures are retried and their reasons are recorded, but there is no availability guarantee. If you need a contractual SLA, email [hello@webresourceledger.com](mailto:hello@webresourceledger.com).
