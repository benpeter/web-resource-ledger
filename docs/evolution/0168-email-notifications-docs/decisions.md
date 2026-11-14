# Decisions

- A page of its own, `site/content/notifications.md`, under Reference next to
  Webhooks, rather than a section in Limits & Quotas: three of the six emails
  have nothing to do with limits, and someone holding an email looks for the
  email, not for the limit.
- Each row names the email by the label the dashboard's Notifications page shows
  ("Capture failures", "Weekly digest", ...), so the page and the toggles match.
- Every statement comes from the code, not from older notes:
  - the capture failure email is deduplicated per account and month
    (`PERIOD_DEDUP_TYPES` in `src/email-dispatch.js`), so the page says "at most
    one a month" and points to the `capture.failed` webhook, which fires every
    time
  - approaching limit is checked when a capture completes, at 80% of the 200 free
    captures (`src/index.js`), once a month
  - limit reached goes only to accounts without a payment method, for the
    capture or the storage limit, and not for a batch that is only larger than
    the captures left (`limitReachedEmailData()` in `src/quotas.js`)
  - invoice generated follows Stripe's `invoice.finalized`, payment failure
    `invoice.payment_failed` (`src/billing.js`)
  - the weekly digest runs at `0 9 * * MON` (UTC) over the seven days before,
    only for accounts with a capture in that week (`handleWeeklyDigest()`)
  - the unsubscribe link carries one notification type and turns off only that
    one (`src/unsubscribe.js`)
  - GitHub sign-in stores the primary email only when GitHub has verified it,
    and updates it on later sign-ins until the account sets its own address
    (`src/oauth.js`)
- Internal limits that don't change what an account sees stay out, such as the
  digest's 50 accounts per run.
- `test/notifications-sync.test.js` reads the notification types from
  `DEFAULT_PREFS` and their labels from the dashboard code and requires each one
  on the page, so a seventh type can't ship without docs.
