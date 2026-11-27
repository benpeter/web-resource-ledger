# Decisions

- Stripe Embedded Checkout (`ui_mode: embedded`), not Stripe Elements. Issue
  #147 named Elements; Embedded Checkout keeps the same Checkout session, so
  the subscription, the billing anchor on the 1st and the
  `checkout.session.completed` webhook stay as they are. With Elements WRL
  would create the subscription and confirm the payment method itself.
- `embedded`, not `embedded_page`: Stripe renamed the value in API version
  2026-03-25.dahlia, and WRL pins 2025-04-30.basil, which rejects
  `embedded_page` (checked against the staging test account). Stripe.js comes
  from `js.stripe.com/basil/stripe.js` to match, and uses
  `initEmbeddedCheckout`.
- `redirect_on_completion: if_required`: card payments finish on the page and
  `onComplete` refreshes the billing view (twice, after 2 and 6 seconds,
  because WRL learns of the payment method by webhook). A payment method that
  needs its own page sends the user to `return_url`, the billing view, as the
  hosted flow did.
- The API stays backwards compatible: without `"uiMode": "embedded"` the
  answer is `{url}` as before, and an embedded request also gets `{url}` when
  `STRIPE_PUBLISHABLE_KEY` is not set, so the dashboard still works on a
  deployment without the key.
- `STRIPE_PUBLISHABLE_KEY` returns as a plain `[vars]` value (it is public by
  design); phase 0159 had removed it because nothing read it.
- CSP for `/ui`: the directives Stripe lists for Checkout and Stripe.js,
  without `maps.googleapis.com`, which Stripe.js uses for address
  suggestions; without it an address is typed in full. Stripe.js loads only when "Set up billing" is
  clicked, so the dashboard loads nothing from Stripe otherwise.
- The billing portal ("Manage billing") still redirects: Stripe has no
  embedded portal.
