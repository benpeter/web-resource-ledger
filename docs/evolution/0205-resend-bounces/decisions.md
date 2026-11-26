# Decisions

- `POST /v1/resend/webhook`, signed the Svix way (HMAC-SHA256 over
  `id.timestamp.body` with the base64 part of the `whsec_` secret, 5 minutes
  of tolerance, several `v1,` values for secret rotation). Redeliveries are
  dropped by `svix-id` in KV for 7 days, as for Stripe events.
- Permanent bounce: `email_verified = 0` for every tenant whose notification
  address it is (case-insensitive). Notification email stops, and so does
  email sign-in with that address, whose link couldn't arrive either.
  Verifying the address again undoes it. Temporary bounces are only logged.
- Complaint: all six notification types off for that address; the address
  stays verified, because it works and its owner may still sign in with it.
- Other events are acknowledged with 200 and ignored.
- Not done from #63: verify by click (verification already works by link),
  digest cadences other than weekly, SMS and push. None has been asked for.
- The webhook itself is created in the Resend dashboard (the API keys WRL
  holds may only send), one for production and one for staging, with the
  signing secret as `RESEND_WEBHOOK_SECRET`.
