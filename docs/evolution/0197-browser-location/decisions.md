# Decisions

## What "where" means

Cloudflare Browser Rendering gives no location for a session: the
`@cloudflare/playwright` types have none, and the docs name none. What a site
sees is where the browser goes out to the web, so WRL asks the web: the
browser loads `https://www.cloudflare.com/cdn-cgi/trace`, which answers with
the Cloudflare data center that served it (`colo=LAX`) and the country of the
browser's address (`loc=US`). The phase 0196 experiment (198250f, on the
autoconsent investigation) used the same page and saw SJC, DFW and LAX.

Only a three-letter data center code and a two-letter country code are kept
(`parseCloudflareTrace`); anything else gives no location rather than a wrong
one.

## Once per session, in a context of its own

A session keeps its place, so the location is read once per session and kept
in memory per isolate (up to 50 sessions), keyed by `browser.sessionId()`.
The read uses a fresh browser context without the capture's route handler, so
it adds nothing to the capture's request count, its WARC or its HTTP status,
and is closed before the capture's context opens. It has 6 seconds; a failed
or slow read gives no location and the capture goes on. On a new session it
falls inside `stages.contextSetupMs`.

## In captureSettings, not render

`render.httpStatus` (phase 0180) went into `render` and `captureQuality`. The
location goes into `captureSettings`, next to `consent`, because
`captureSettings` already reaches every surface that should show it: the
capture body (also for quarantined captures), the verification response, and
the WACZ `datapackage.json`, where it is signed. `render` is not in the
verification response. `captureSettings` is now built when the renderer
reports a consent step or a location.

## Surfaces

- API: `captureSettings.browserLocation` on `GET /v1/captures/{id}` and
  `GET /v1/verify/{id}`; schema `BrowserLocation` in openapi.yaml.
- WACZ: signed in `datapackage.json` with `captureSettings`.
- Verification page: "Captured from" under Capture details. The row is built
  as HTML, so the script shows it only when both values match the code
  patterns.
- Dashboard: "Captured From" in the capture details.
- MCP `get_capture` and `verify_capture`: "Captured from: LAX, US (Cloudflare
  data center)".
- Certification PDF: "Captured From:" under 3.1 Capture Identification.
- Logs: `colo`, `country`, `locationMs`, `locationCached` on
  `render.default.session_acquired`, and `colo` on
  `render.default.consent_result`, also for captures that fail.
- Docs: verification page section, MCP examples, SWGDE 7.5 table ("physical
  location of access") and the network paragraphs, INTERNALS, coralogix events.

The server-side text comes from `src/browser-location.js`; the verify page
and dashboard scripts, which run in the browser, have the same check inline.

## Not done

- Choosing the place. Cloudflare offers no option for it.
- A city name for the code. Cloudflare has more than 300 data centers; the
  docs explain the code instead.
- Webhook payloads don't carry `captureSettings` today and don't get it here.
