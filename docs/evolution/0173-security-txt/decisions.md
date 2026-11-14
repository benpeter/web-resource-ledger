# Decisions

- One file, on the landing site: `landing/public/.well-known/security.txt`. The
  landing Worker serves `public/` through its assets binding, like `robots.txt`
  and `llms.txt`; `wrangler dev` served the file with `text/plain;
  charset=utf-8`, as RFC 9116 asks.
- The API host (and the verify hosts, through their path allowlist) and the
  docs host answer `/.well-known/security.txt` with a 301 to the landing file.
  RFC 9116 allows redirects; one copy can't drift. `HEAD` gets the same answer
  (`HEAD_PATHS`), since scanners use it.
- Fields: `Contact` is the GitHub advisory form, the channel `SECURITY.md`
  already names, so the file adds no new address to watch. `Policy` points to
  `SECURITY.md`, `Canonical` to the landing address, `Preferred-Languages: en,
  de`. No `Encryption` (no PGP key) and no `Acknowledgments` page.
- `Expires` is required and should be under a year away: 2027-11-01.
  `test/security-txt-sync.test.js` fails from 30 days before that date, so CI
  asks for the renewal while the file is still valid.
- `test/docs-diagrams-sync.test.js` said the docs CSP is in `site/_headers`;
  since `run_worker_first` the header comes from `site/src/index.js` (same
  value). Comment corrected.
