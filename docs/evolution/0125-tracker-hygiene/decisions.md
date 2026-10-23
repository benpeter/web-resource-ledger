# Decisions

- Checked against production before changing anything. The latest qualified
  capture's `datapackage-digest.json` names two timestamp authorities:
  `http://timestamp.digicert.com` (standard) and
  `https://timestamp.sectigo.com/qualified` (eIDAS). A test request to the
  Sectigo endpoint without credentials returns a granted token. So the public
  pages were right: DigiCert for every capture, Sectigo for qualified ones.
  "AlfaSign since 2026-03-27" in the vault notes was wrong; AlfaSign was
  researched and never wired in. No page needed a change.
- Licenses are also consistent: the service is PolyForm Shield 1.0.0, the
  verify CLI (`packages/verify`) is Apache 2.0. The vault note was outdated.
  `packages/verify/package.json` said "SEE LICENSE IN LICENSE"; it now names
  `Apache-2.0` so npm shows it. That reaches npm with the next tagged release.
- `wrangler.toml` said the qualified TSA credential is "set via wrangler secret
  put". Sectigo needs none; the comment now says the secret is only sent if set.
- `docs/backlog.md` is frozen with a note that open items moved to a private
  tracker. Done items are struck with the evidence (both Workers have
  `QUALIFIED_TSA_AUTH` and `RESEND_API_KEY`), and two premature items are marked
  dropped.
- Disaster recovery (GH #149) is not struck. The issue was closed by pointing
  to the compliance documentation issue, but no backup or restore procedure
  exists, so it stays open in the private tracker.
- `.claude/PLAN.local.md`, which an older note wanted deleted, no longer exists.
