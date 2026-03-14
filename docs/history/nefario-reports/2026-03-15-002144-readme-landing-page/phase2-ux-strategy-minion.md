# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. The current README has exactly the wrong information architecture

The current README is structured as a setup manual: Prerequisites, Setup, Signing Key Setup, Key Rotation, Development, Deploy, API. A first-time visitor to the GitHub page encounters infrastructure commands before they have any idea what the product does or why they should care.

The one-liner in line 3 ("Tamper-evident archival of web resources...") is good but immediately followed by a technology disclosure ("Built on Cloudflare Workers with R2 storage and Browser Rendering") that answers a question nobody has asked yet. This is a textbook heuristic violation: the system is matching its internal model rather than the user's mental model (Nielsen H2).

**The cognitive load profile of the current README:**
- Lines 1-6: What is it? (good -- 2 lines)
- Lines 7-97: How do I set it up? (bad -- 91 lines before anyone can evaluate whether they want to)
- Lines 98-100: What can it do? (catastrophic -- the API section is a one-line pointer to a YAML file)

A visitor scanning this README must hold an entire Cloudflare infrastructure context in working memory before reaching the section that shows what WRL actually does. That is 100% extraneous cognitive load.

### 2. The "show first vs. set up first" tension has a well-established solution

This is a false dilemma. The answer is progressive disclosure with a clear escape hatch.

The JTBD analysis reveals two distinct visitor types with different jobs:

- **Evaluator** (most common first visit): "When I find a new tool on GitHub, I want to quickly understand what it does and see it working, so I can decide whether to invest time setting it up." This person needs: positioning, concrete examples, and trust signals -- in that order.

- **Implementer** (second visit or decided user): "When I've decided to use WRL, I want to get it running with minimal friction, so I can integrate it into my workflow." This person needs: prerequisites, setup steps, and operational details.

The README should serve the Evaluator first and the Implementer second. Here is why: the Evaluator leaves if they can't evaluate. The Implementer has already decided to invest time and will scroll or click a link. The cost of scrolling past examples to reach setup is much lower than the cost of scrolling past setup to find out what the tool does.

**The structure I recommend:**

1. **Positioning block** (5-8 lines max): Name, one-liner, 2-3 sentence expansion of the value proposition. No technology names.
2. **Usage examples** (compact, 3 examples): Capture a URL, retrieve artifacts, verify a bundle. Each is one curl command plus one response snippet. Annotated with brief inline comments.
3. **"Getting Started" bridge** (1 paragraph): A single transition paragraph that says: "The examples above use a running WRL instance. To deploy your own:" followed by a link to the Setup section. This is the escape hatch.
4. **Setup section**: Prerequisites, install, configure, deploy. This is the existing content restructured.
5. **API reference pointer**: Brief summary table plus link to openapi.yaml.
6. **Project links**: Contributing, security, license, evolution log.

### 3. The usage examples must be scannable, not comprehensive

The planning question correctly identifies the risk: if examples become a wall of curl + JSON, the reader reaches neither the "aha moment" nor the setup section. Apply Krug's "get rid of half the words, then get rid of half of what's left."

**Hard constraints for examples:**

- Maximum 3 examples. Capture, retrieve, verify. These map to the product's three core jobs (R1, R2, R3 from MVP.md).
- Each example is one curl command (2-4 lines with line breaks) plus a trimmed response (5-8 lines max). Strip response fields that don't help comprehension -- show `id`, `status`, `verified`, artifact URLs. Omit `createdAt`, `completedAt`, security headers, full signing metadata.
- Use a placeholder base URL like `$WRL_URL` so readers aren't confused by `wrl.example.com` (which they might try to hit).
- Annotate with a one-line comment above each example explaining the job: "Capture a web page", "Retrieve the screenshot and HTML", "Verify the capture's integrity".
- No error examples in the README. Errors are documentation, not landing page material.

**Total vertical space for all three examples: 40-50 lines.** If it exceeds 50 lines, cut response bodies further. The reader needs to see the shape of the interaction, not parse every field.

### 4. The auth asymmetry is actually a UX asset -- surface it explicitly

The auth model (POST requires Bearer token, GET requires nothing because the capture ID is the secret) is genuinely interesting and needs exactly one sentence of explanation. It is a design decision that reduces friction for the verification use case (the core value prop). Do not bury this in the setup section.

Place it as a brief callout between the capture example and the retrieve example:

> Capture requires an API key. Retrieval and verification are auth-free -- the capture ID acts as the access secret. Anyone with the ID can retrieve artifacts and verify integrity. Store your capture IDs.

This serves two functions: it explains why the retrieve curl has no auth header (preventing a "wait, did they forget the auth?" confusion), and it communicates the security model in one sentence. It also reinforces the "store your capture IDs" message that is critical given the no-list-endpoint design.

### 5. Setup should be restructured as two tiers

The current setup mixes essential and optional steps. The signing key setup (lines 38-81) is a significant cognitive load block that includes key generation, production secrets, local dev secrets, security warnings, key rotation procedures, and a public key endpoint description. A first-time user trying to get WRL running does not need key rotation procedures.

**Tier 1 -- Minimum viable setup** (must-be, per Kano):
- Prerequisites (Node, Wrangler, Cloudflare account)
- `npm install`
- Create KV namespace and R2 bucket
- Set `CAPTURE_API_KEY`
- `wrangler deploy` or `npm run dev`

**Tier 2 -- Signing setup** (performance feature, per Kano):
- Generate signing key
- Set production and dev secrets
- Brief note that captures without signing still work

**Tier 3 -- Operations** (progressive disclosure):
- Key rotation
- Public key endpoint
- Should be a separate section or linked document

This tiered approach means the reader can get a working (unsigned) WRL instance in about 6 commands. Signing is clearly an upgrade, not a prerequisite. Key rotation is maintenance, not setup.

### 6. The "How it works" section should be absent from the README

I am deliberately recommending against a "How it works" or architecture section in the README. This is a common README pattern that adds cognitive load without serving either the Evaluator or the Implementer. The Evaluator wants to see what WRL does, not how it does it internally. The Implementer wants setup commands.

Architecture and design rationale belong in `docs/` (which this project already has in excellent detail via the evolution log). A brief "How this project is built" line can point there for the curious.

### 7. Technology stack disclosure should be minimal and deferred

The current line 6 ("Built on Cloudflare Workers with R2 storage and Browser Rendering") serves the Implementer but harms the Evaluator. The Evaluator does not care about R2 storage. They care about "immutable", "tamper-evident", and "verifiable".

Move technology details to the prerequisites/setup section where they become actionable context rather than premature detail. In the positioning block, a phrase like "Runs on Cloudflare Workers -- zero-ops, edge-distributed" is sufficient for the reader who wants to know the deployment model.


## Proposed Tasks

### Task 1: Write the positioning block
Draft the opening 5-8 lines: name, tagline, expanded value proposition. No technology names except the deployment model (Cloudflare Workers). Test it against the Evaluator JTBD: can I understand what WRL does and why I might want it in under 10 seconds of scanning?

### Task 2: Write the three usage examples
Draft compact curl examples for capture, retrieve, and verify. Include the auth asymmetry callout between capture and retrieve. Apply the hard constraints: 3 examples, 40-50 lines total, trimmed responses, `$WRL_URL` placeholder. Each example gets a one-line purpose comment.

### Task 3: Write the "Getting Started" bridge paragraph
One paragraph that transitions from "here's what it does" to "here's how to run your own". Include a note that a Cloudflare account with specific features is required. Link to the setup section.

### Task 4: Restructure setup as two tiers
Rewrite setup as Tier 1 (minimum viable -- get it running without signing) and Tier 2 (signing setup). Move key rotation and public key endpoint to a separate Operations section or defer to docs/.

### Task 5: Write the project links footer
Brief section with links to: openapi.yaml (API reference), CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, docs/evolution/ (design rationale), LICENSE.

### Task 6: Assemble and validate the complete README
Combine all sections. Validate total length (target: under 150 lines, hard cap 200). Validate scannability: can a reader get the "aha moment" without scrolling below the fold on a standard GitHub rendering (~40 lines visible)? Validate that no section requires context from a later section (no forward references).


## Risks and Concerns

### Risk 1: Examples using `wrl.example.com` will confuse readers
**Severity: Major.** The OpenAPI spec uses `wrl.example.com` as the server URL. If the README examples use this URL, some readers will attempt to hit it. Use an environment variable placeholder (`$WRL_URL`) or explicitly state "replace with your deployed URL". The former is cleaner because it also makes the examples copy-pasteable by anyone who has set the variable.

### Risk 2: The trimmed JSON responses may omit fields that matter to specific readers
**Severity: Minor.** The recommendation to show 5-8 line responses means fields like `createdAt`, `completedAt`, WACZ metadata, and signing details are omitted. Mitigate by linking to the OpenAPI spec immediately after the examples section. The examples serve recognition, not recall -- readers need to see the shape, not memorize the schema.

### Risk 3: Setup instructions may be stale or incomplete if the README doesn't own them
**Severity: Moderate.** If setup is restructured or partially deferred to docs, there is a risk of information splitting. The README should remain the single entry point for setup and contain enough to get a working instance. Do not fragment setup across multiple files -- that adds navigation friction. Operations (key rotation, key endpoint) can be split off; initial setup should not be.

### Risk 4: The README serves dual audiences (end users and contributors) and may satisfy neither
**Severity: Moderate.** The current README has no clear audience. The proposed structure optimizes for end users (API consumers and self-hosters). Contributors are served by CONTRIBUTING.md (which already exists and is good). The README should link to CONTRIBUTING.md rather than duplicating contributor information.

### Risk 5: The "capture ID is the secret" design creates a UX trap that the README should flag clearly
**Severity: Major (for user experience, not for the README task itself).** The no-list-endpoint design means lost IDs are permanently lost captures. The README must communicate this clearly and early. The auth asymmetry callout I recommended in Recommendation 4 handles this, but it must not be edited out for brevity. This is a must-be element.


## Additional Agents Needed

**software-docs-minion** should write the actual content. My contribution defines the information architecture, cognitive load constraints, and section-level specifications. The docs specialist should draft the prose, particularly the positioning block and the bridge paragraph, which require precise word economy.

No additional specialists are needed beyond what is likely already planned. The task is documentation restructuring, not design or implementation.
