## Gru Review — Technology Radar

**Verdict: APPROVE**

### Mermaid v11 from jsDelivr CDN

Sound. Mermaid v11 is current stable (released 2024). jsDelivr is production-grade with multi-CDN redundancy. Using `mermaid@11` (semver range rather than pinned patch) is appropriate for a docs site -- minor/patch updates flow through automatically without manual maintenance.

### Client-side rendering vs build-time

The rationale holds. Build-time rendering via an Eleventy plugin would pull in a Puppeteer/Chromium build dependency -- directly contradicting the project's "lean and mean" and "prefer vanilla solutions" principles. Client-side CDN rendering also fixes the three already-broken Mermaid blocks in the existing whitepaper at zero additional cost. This is the correct tradeoff.

### CDN dependency risk

Acceptable. The degradation path is correct: jsDelivr unavailability → diagrams render as readable code blocks. No build dependency means no build failures from CDN issues. For a documentation site this is standard practice.

### One minor note (no action required)

The plan uses `type="module"` for the CDN script load -- correct for Mermaid v10+. SRI hashing is omitted, which is a minor omission but incompatible with the `mermaid@11` semver range (SRI requires a pinned hash tied to a specific file). Not a blocker for a docs site.

No technology concerns. Proceed.
