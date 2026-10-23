# Decisions

- The page is Wikipedia's "Link rot" article. It loads quickly, has no cookie
  banner or bot check, is stable, and its subject is the problem WRL addresses.
- Captured on 2026-10-23 as cap_af88b2740dea4903b3eb98fdf68e1390. It completed with render quality full and passes
  all four verification checks.
- It was captured with the legacy CAPTURE_API_KEY (tenant `default`), because
  Ben's tenant had reached its October free limit (partly from the double counting
  fixed in phase 0120). The verification page is public either way, and the
  `default` tenant is excluded from analytics.
- The link goes to the public verification page
  (`api.webresourceledger.com/v1/verify/{id}`), not to the dashboard, since a
  visitor has no account.
- One line under the hero hint, styled like the hint, so it doesn't compete with
  the two buttons.
