## Task: Update WRL landing page with legal-evidence positioning

You are updating the WRL landing page at `landing/public/index.html` with precise legal-evidence framing. This is a static HTML file with no JS framework.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/declarative-roaming-hamster

### Changes required

**1. Hero tagline (line 105)** -- Two small wording changes:

Current:
```
Capture any web page and get back a signed, timestamped bundle that anyone can independently verify -- no account, no trust required.
```

Change to:
```
Capture any web page and get a signed, timestamped evidence bundle that anyone can independently verify -- no account, no trust in us required.
```

Changes: "get back a" -> "get a" (tighter), "bundle" -> "evidence bundle" (reinforces evidence framing), "no trust required" -> "no trust in us required" (more precise, positions against proprietary competitors).

**2. Legal Evidence use-case card (lines 155-158)** -- Replace the existing card content with a rule-specific list format:

```html
<article class="card use-case-card" aria-labelledby="use-case-legal">
  <h3 id="use-case-legal">Legal Evidence</h3>
  <p>Screenshots get challenged. WRL captures produce signed, timestamped evidence bundles designed to support authentication under federal and EU evidence standards:</p>
  <ul class="use-case-details">
    <li><strong>FRE 901(b)(9)</strong> -- automated process producing verifiable results, no human in the chain of custody</li>
    <li><strong>FRE 902(14)</strong> -- SHA-256 hash integrity as the digital identification process</li>
    <li><strong>eIDAS Art. 41(2)</strong> -- optional qualified timestamps with legal presumption of accuracy across all EU member states</li>
  </ul>
  <p class="use-case-cta"><a href="https://docs.webresourceledger.com/legal-evidence/">How WRL supports evidence authentication &rarr;</a></p>
</article>
```

IMPORTANT language rules for the Legal Evidence card:
- Use "designed to support authentication" NOT "legally admissible" or "court-ready"
- Use "process producing verifiable results" NOT "accurate results" for 901(b)(9)
- Do NOT mention FRE 902(13) -- the certification document (R41) has not shipped
- Do NOT use "FRCP compliant" or "meets legal requirements"
- The eIDAS bullet must say "optional" because qualified timestamps are an account-level opt-in feature

**3. Add "Learn more" links to the OTHER THREE use-case cards** to maintain visual parity with the legal card's new link. Add a similar `<p class="use-case-cta">` to each:

- Compliance Archiving: link to `https://docs.webresourceledger.com/verification/` with text "How verification works &rarr;"
- AI Agent Grounding: link to `https://docs.webresourceledger.com/mcp/` with text "MCP server documentation &rarr;"
- Journalism and Research: link to `https://docs.webresourceledger.com/verification/` with text "How verification works &rarr;"

**4. Add CSS for the new list and CTA elements.** In `landing/public/css/landing.css`, add styles for `.use-case-details` and `.use-case-cta` after the existing `.use-case-card` rules. The list should:
- Have no bullet markers (list-style: none) -- the bold rule numbers serve as markers
- Use compact spacing (margin-bottom on li items)
- Use the same muted color as card paragraph text
- The CTA paragraph should be smaller font size and have top margin to separate from card body

**5. Meta description (line 7)** -- Update to:
```
Web evidence you can prove. Capture web pages with Ed25519 signatures, RFC 3161 timestamps, and optional eIDAS-qualified timestamps. Signed WACZ bundles anyone can independently verify.
```

**6. OG description (line 15)** -- Update to match:
```
Capture web pages with Ed25519 signatures, RFC 3161 timestamps, and optional eIDAS-qualified timestamps. Signed WACZ bundles anyone can independently verify.
```

**7. Structured data featureList (lines 59-66)** -- Add three items to the existing array:
- "eIDAS-qualified timestamps (optional)"
- "FRE 901/902 evidence authentication support"

(Note: "RFC 3161 timestamps" is already in the featureList)

### What NOT to do
- Do NOT add a separate "Evidence Standards" section to the landing page
- Do NOT add FRE/eIDAS references to the hero heading ("Web evidence you can prove." stays unchanged)
- Do NOT touch the "How It Works" section or the pricing section
- Do NOT mention FRE 902(13) anywhere
- Do NOT use the phrases "legally admissible", "court-ready", "FRCP compliant", "meets legal requirements", "certified", or "notarized"
- Do NOT change the hero heading

### Deliverables
- Modified `landing/public/index.html`
- Modified `landing/public/css/landing.css`

When done, report: file paths with change scope and line counts, 1-2 sentence summary of what was produced.
