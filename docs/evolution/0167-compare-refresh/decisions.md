# Decisions

- The landing comparison already shows three criteria where others do better
  (social media, scheduled bulk monitoring, expert witness), so that item needed
  no change.
- Every new claim comes from the vendor's own pages, checked on 2026-11-14, not
  from the March research. That research had gone stale: it said ProofSnap had no
  API, and ProofSnap now has a REST API, an MCP server, schedules and optional
  eIDAS-qualified timestamps. It also linked a Bellingcat article as being about
  DEPT; the article is about Bellingcat's Auto Archiver.
- ProofSnap gets a table column between Page Vault and MirrorWeb, with green
  badges where it matches WRL (signing, timestamps, verifier, eIDAS, API) and
  "Not documented" where its pages say nothing, as the methodology asks. Its
  note gives prices, since the page compares paid services by what they cost.
- DEPT gets a note, not a column. Its capture tool, evidx, publishes no pricing,
  API or format documentation, so most cells would read "Not documented". The
  note describes evidx and DEPT's Zeitwerk timestamping service.
- The archive.today context cites Wikipedia's request for comment (closed
  2026-02-20) as the primary source and says what happened without judging the
  site: links removed because of a denial-of-service script and evidence of
  altered archived pages. It explains what the signing rows compare.
- "When to use something else" gains an entry for pages behind a login: WRL
  captures in a fresh browser on its servers and takes no cookies or credentials,
  so ProofSnap's extension and evidx are the honest pointers.
- The docs description said 13 tools, the landing links said 10 and 14, and the
  table compared WRL with 9 (now 10 with ProofSnap). Both pages now give the
  table's number, and `test/compare-sync.test.js` derives it from the table.
- The intro and methodology say which cells are from March and which from
  November. Re-checking the March columns is #93; what ProofSnap's API means for
  WRL's positioning is a decision for Ben (#92).
