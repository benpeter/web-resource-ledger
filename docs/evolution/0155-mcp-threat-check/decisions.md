# Decisions

- `capture_url` checks the URL right after the SSRF check and refuses a flagged one
  with the REST text ("URL flagged by content security screening") as a tool
  error, before any capture row exists. `batch_capture` validates every URL first,
  checks the valid ones in one `checkUrls` fan-out (as the REST batch handler
  does), rejects flagged URLs per item and captures the rest.
- Both store the result on the capture (`threat_check` 'pass' or 'unavailable'),
  and both log `threatcheck.block` and `threatcheck.api_fail` with `via: 'mcp'`,
  so the existing "Threat Check API Failures" alert covers MCP too.
- The check fails open as on REST: without an API key or when Web Risk is down,
  the capture goes ahead with 'unavailable'.
- Impact before the fix: an MCP capture of a listed URL loaded the page in the
  capture browser and stored it; the daily re-scan (complete captures whose last
  check is older than 24 hours, including never-checked ones) quarantined it up to
  a day later.
- Production has 610 captures without a stored check, all scheduled captures and
  older ones (the scheduler checks before capturing but doesn't store the result).
  The daily re-scan checks them; storing it in the scheduler would save one Web
  Risk call per URL per day and isn't done here.
- The tests call `handleMcp` with `GOOGLE_WEB_RISK_API_KEY` set on a copy of the
  env and answer Web Risk through `fetchMock`; the shared test config has no key.
- Docs found on the way: the security overview and whitepaper still said nine
  alert rules (incident-response was fixed in phase 0146), and the subprocessor
  pages named GitHub as the only sign-in and left Pirsch out of the summary.
