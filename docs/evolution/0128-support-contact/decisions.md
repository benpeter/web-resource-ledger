# Decisions

- Requests (data rights, deletion, refunds, takedowns, subprocessor objections,
  compromised accounts) now go to hello@webresourceledger.com. The domain's
  Cloudflare Email Routing already forwards every address, so nothing new had to
  be set up.
- The operator identity keeps bp@ben-peter.com: the footer line on every landing
  page and in the dashboard, the controller block in the privacy policy, and the
  operator block in the FRE 902(13) certificate. These identify the legal
  operator, so they stay personal.
- The support page states that no plan includes an SLA and points anyone who
  needs one to email, which matches the landing page's "custom volume pricing
  and SLA" offer for enterprise.
- Docs headings get id attributes through Eleventy's built-in IdAttributePlugin.
  Links with anchors (`/limits/#why-captures-fail` from phase 0121 and an older
  link to the Rule 902(13) section) landed at the top of the page before.
  `checkDuplicates` is off because the generated API reference already repeats
  some operation ids.
- Privacy, refund and content policy effective dates move to 2026-10-23, since
  their contact address changed.
