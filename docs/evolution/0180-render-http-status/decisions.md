# Decisions

- The capture records the status of the page's own response as the browser
  got it: `render.httpStatus`, signed into the WACZ `captureQuality`. It is
  the last navigation response of the main frame, so a redirect target or a
  bot check that reloads the page replaces the earlier status. A `response`
  listener collects it, because `page.goto()` returns nothing when it times
  out and the partial path needs the status too.
- A capture of an error answer still completes. A 404 or 410 page is often
  what someone wants on record, and WRL can't tell a block page from an
  error page the site means. So the capture says what it shows instead of
  failing: a "Site answer" row on the verification page, a line in MCP
  `get_capture` and `verify_capture`, the status in the dashboard's capture
  details. `renderQuality` is unchanged: the page did load.
- MCP and the dashboard give the status on every capture that has one, 200
  included. An agent or a person checking a capture gets a plain fact either
  way. The verification page adds its row only for 400 and above, since it is
  what third parties see and a row for every 200 would be noise.
- The blank-page failure names the status when it was an error ("The site
  answered HTTP 403 and the page showed nothing (blank page)"). That is the
  one fact WRL has, and it stops short of claiming a bot block. Whether
  nytimes.com and etsy.com (backlog #100) are that case will show in the
  logs now: `render.default.render_check_fail` carries `httpStatus`.
- Known block pages are not named (Akamai "Access Denied", DataDome). That
  needs the data this change starts to collect; backlog #100 keeps it.
- The docs now say that the headers artifact comes from a request of WRL's
  own, without a browser and without following redirects. It always did;
  nothing said so, and the samsung.com capture looked contradictory because
  of it.
- `@w-r-l/verify` is untouched. The CLI doesn't print `captureQuality` at
  all today, so the status is in the signed bundle for anyone who reads
  `datapackage.json`, and showing it in the CLI would be a package release
  of its own (backlog #87 is the pending one).
- Fixed on the way: the `renderQuality` description in `openapi.yaml` still
  said 500 requests after phase 0178.
