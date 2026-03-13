You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a tested URL validation module (`src/url-validation.js`) that blocks known SSRF bypass vectors for a Cloudflare Worker that fetches arbitrary user-supplied URLs via Browser Rendering (headless browser). This is the most security-critical component in the system.

## Your Planning Question

Given that this Worker fetches arbitrary user-supplied URLs via Cloudflare Browser Rendering (a headless browser), what SSRF bypass vectors beyond the issue's list should the validation module cover? Specifically:
(a) Are there Cloudflare-specific internal IPs or metadata endpoints (analogous to AWS 169.254.169.254) that need blocking?
(b) Should we block additional schemes beyond http/https (e.g., `javascript:`, `data:`, `blob:`, `file:`) even though the URL constructor would reject most of them?
(c) What is the correct validation order -- normalize first, then check scheme, then check credentials, then resolve DNS, then check IP? Does order matter for security?
(d) For DNS pinning: what is the threat model for DNS rebinding in the Cloudflare Workers context specifically? Does the Browser Rendering API accept a pre-resolved IP, or do we need a different pinning mechanism?
(e) For redirect chain validation: should the module follow redirects itself, or should it provide a per-hop validation function that the caller invokes? What are the TOCTOU risks in each approach?

## Issue Bypass Vectors to Cover
- Hex-encoded IP (`http://0x7f000001/`)
- Octal IP (`http://0177.0.0.1/`)
- Decimal IP (`http://2130706433/`)
- IPv6-mapped IPv4 (`http://[::ffff:127.0.0.1]/`)
- IPv6 ULA (`http://[fc00::1]/`)
- DNS-to-loopback redirect
- Redirect to private IP after initial validation
- Embedded credentials (`http://user@169.254.169.254/`)
- Double-encoded paths

## Context
- Cloudflare Worker with `nodejs_compat` flag enabled
- Browser Rendering binding configured in wrangler.toml (`[browser] binding = "BROWSER"`)
- Plain JavaScript, ESM modules, no frameworks
- RFC 9457 error responses pattern established in `src/responses.js`
- YAGNI/KISS philosophy -- don't overbuild
- The module should be standalone and auditable in isolation

## Private IP Ranges to Block (from issue)
- IPv4: 10/8, 172.16/12, 192.168/16, 169.254/16, 127/8
- IPv6: fc00::/7, fe80::/10, ::1, ::ffff:127.0.0.1

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase2-security-minion.md`
