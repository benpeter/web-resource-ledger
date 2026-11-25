# Decisions

- Past 50 MB the capture no longer fails. Like the request cap since phase
  0178, WRL blocks the requests after that point and captures the page as
  partial. `render.sizeLimitReached` says so (`true` or `false` on every new
  capture), signed into `captureQuality`, on the verification page and in MCP
  `get_capture`. The check sits in the route handler, so it holds for the
  whole capture, scrolling included, not only until load.
- The sum still counts announced sizes (`Content-Length`). Measuring real
  bytes needs a CDP call per response; the cap is a guard for the browser
  side, not for Worker memory, so an estimate is enough.
- The Worker's own limit is on the rendered HTML: `readHtml()` reads
  `document.documentElement.outerHTML.length` in the page and fails the
  capture above 15 million characters (`MAX_HTML_CHARS`), before
  `page.content()` brings the HTML into the Worker. The largest HTML in R2 on
  2026-11-25 was 3.7 MB in production and 8.9 MB on staging. The error is
  not retried: the same page gives the same HTML.
- Screenshots are already bounded by the 8000 px height cap, so they get no
  new limit here.
- The alert: an hourly GitHub workflow (`worker-health-alert.yml`) asks
  Cloudflare's GraphQL analytics for `wrl` and `wrl-staging` invocations that
  ended in `exceededMemory` or `exceededCpu` in the last hour and emails the
  operator through Resend, like the deploy-failure email. It runs outside the
  Worker, so a Worker that runs out of memory can't keep it from being sent.
  Workers Observability alerts would need Workers Logs turned on, which WRL
  doesn't use (logs go to Coralogix). Token: `CF_ANALYTICS_TOKEN`, a user
  token with Account Analytics Read only.
