# Decisions

- Found by bisecting a staging capture's `indexes/index.cdxj` in
  ReplayWeb.page against the index py-wacz 0.6.0 (`wacz create`) writes for the
  same WARC. The record type was not the cause: py-wacz's index replays the
  page from WRL's `resource` record. Two index details were, and each one alone
  kept the page from replaying:
  - `filename` was `archive/data.warc`. WACZ names WARC files relative to
    `archive/`, so the replay tool looked for `archive/archive/data.warc`.
  - The headers `metadata` record has the page's URL and timestamp. The replay
    tool keeps one entry per URL and timestamp, and the headers line came last,
    so it replaced the page.
- The headers record stays in the WARC and leaves the index. The index exists
  for replay lookups, and nothing in WRL or `@w-r-l/verify` reads index lines
  (verify checks the file's hash only). Sorting it before the page line would
  also have worked, but only because of the order the replay tool happens to
  store lines in.
- The ReplayWeb.page Resources list stays empty for py-wacz's own files too,
  so it was not used as a check; the test was whether the page itself loads.
- Older bundles keep their index: the index is hashed into the signed digest,
  so rewriting it would break the signature. The CHANGELOG says they don't
  replay.
- The pages that mention ReplayWeb.page now say it shows the HTML without
  stylesheets and images, since WRL doesn't store those (#52 measured storing
  them and shelved it).
