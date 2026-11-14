---
layout: layouts/doc.njk
title: Email Notifications
description: Which emails WRL sends about captures, limits, invoices and weekly activity, when each one goes out, and how to change the address or turn them off.
---

# Email Notifications

WRL sends emails about your account from `notifications@webresourceledger.com`. Each kind can be turned on or off on the **Notifications** page of the [dashboard](https://api.webresourceledger.com/ui?from=docs). All of them are on for a new account.

For events your own code should act on, use [webhooks](/webhooks/) instead: the `capture.failed` webhook fires for every failed capture, while the failure email goes out at most once a month.

## Where the emails go

A new account's address is the one you signed in with: your primary GitHub email, if GitHub has verified it, or the address an emailed sign-in link was sent to. Until you set an address of your own, a GitHub account's address follows its primary GitHub email each time you sign in.

To use another address, enter it on the **Notifications** page. WRL sends a verification link to it, and the emails keep going to the old address until you open that link.

## The emails

| Notification | When it is sent |
|---|---|
| **Capture failures** | A capture failed after its attempts (WRL makes up to four), whether it came from the dashboard, the API, MCP or a schedule. At most one a month; later failures in the same month send no email. The email names the URL and the reason. |
| **Approaching limit** | An account without a payment method has used 160 of its 200 free captures this month. Once a month. |
| **Limit reached** | An account without a payment method had a capture refused because the 200 free captures or the 10 GB of storage for the month are used up. Once a month. A batch that is only larger than the captures left gets a `429` but no email. See [Limits & Quotas](/limits/). |
| **Invoice generated** | Stripe finalized an invoice for your account, with the amount due. |
| **Payment failure** | A payment for an invoice failed. |
| **Weekly digest** | Mondays at 09:00 UTC, for the seven days before, in weeks with at least one capture. It lists the results of each active schedule and of the other captures. |

Sign-in links and address verification emails are always sent; they have no setting.

## Turning emails off

Every notification email has an unsubscribe link, and mail clients that support one-click unsubscribe show a button for it. It turns off that one kind of email, not the others. To turn it back on, or to change several at once, use the **Notifications** page of the dashboard.
