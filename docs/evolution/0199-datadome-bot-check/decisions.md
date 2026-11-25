# Decisions

- Three staging rounds on 2026-11-25 (Dallas sessions): nytimes.com and
  etsy.com both failed every time with "The site answered HTTP 403 and the page
  showed nothing (blank page)". The NYT attempt took 503 ms for 9 requests and
  about 100 KB: a block page, not a page that failed to render.
- Both sites are behind DataDome. A request with a headless Chrome user agent
  gets `HTTP 403`, `server: DataDome`, `x-datadome: protected` and a 771-byte
  page with `var dd={'rt':'c','cid':...}` and a script from
  `ct.captcha-delivery.com`, which puts the captcha in an iframe. The blank-page
  check counts text, images, video, canvas and svg, not iframes, so the
  captcha page looked blank, and the check runs before the bot check.
- `classifyBotCheck` recognises DataDome with two signals, like Cloudflare:
  the `dd` config object (with `cid`) and a script or iframe from
  `captcha-delivery.com`. The script alone is not enough.
- When the render check finds a blank page, WRL reads the bot-check signals
  before failing, and fails with "Bot check: DataDome challenge (...)" when
  they match. Other render failures (browser error pages) stay as they were.
- The failure message names the vendor: "The site showed a DataDome bot check
  instead of the page". Not retried, not counted, as for Cloudflare.
- WRL still does not answer or wait out a captcha. DataDome's captcha does not
  clear by itself, so there is no wait for it.
