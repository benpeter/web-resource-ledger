# Hold: Act 5 requires Stripe account

**Set:** 2026-03-23

The orchestrator will pause automatically after phase 0057 (E2E test suite,
`act_last: true`) completes. Do NOT send `~/wrl-go` until:

1. Ben has set up a Stripe account
2. Stripe API keys are provisioned and stored in 1Password (WRL vault)
3. Keys are deployed as worker secrets (`STRIPE_SECRET_KEY`, etc.)

Act 5 starts with phase 0058 (Stripe usage-based billing), which requires
live Stripe credentials.

**To resume:** `touch ~/wrl-go`
