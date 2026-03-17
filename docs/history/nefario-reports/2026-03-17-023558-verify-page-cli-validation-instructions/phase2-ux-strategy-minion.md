# Domain Plan Contribution: UX Strategy

## Planning Question

Where on the page do CLI instructions go without cluttering the trust interface for casual users? Should they be static or dynamic (pre-filled with the actual capture's hash/ID)? Third disclosure section vs nested inside existing crypto details? Or should they live on a separate documentation page instead of the verify page itself?

---

## Recommendations

### 1. Keep CLI instructions OFF the verify page entirely

**The verify page is a trust artifact, not a documentation page.** Its job-to-be-done for the two audiences is clear and distinct:

- **Casual users** (90%+ of page loads): "I want to confirm this capture is legitimate." Their job is done the moment they see the green checkmark, the URL, the date, and the screenshot. Every additional element on this page is noise that dilutes the trust signal.
- **Technical users** (minority): "I want to independently reproduce the verification." Their job begins when they leave the page and enter their terminal. They need reference documentation, not an inline tutorial.

Adding CLI instructions to the verify page commits a fundamental Kano model error: it takes a must-be feature (clean trust confirmation) and degrades it by cramming in a performance feature (verifiability instructions) that serves a different audience at a different moment in their journey.

**The cognitive load argument is decisive.** The verify page currently has a tight visual hierarchy: banner (primary signal) -> metadata (context) -> checks (detail) -> screenshot (evidence) -> two disclosure sections (deep detail). Each layer serves the same job: "Is this capture trustworthy?" CLI instructions serve a different job entirely: "How do I reproduce this myself?" Mixing jobs in one interface violates the principle of minimal information -- irrelevant content diminishes relevant content (Nielsen heuristic #8, aesthetic and minimalist design).

### 2. CLI instructions belong in project documentation (README or dedicated VERIFICATION.md)

The README already has a "Verify the bundle" section (Step 4) that shows `curl` usage. CLI verification instructions are a natural extension of this documentation pattern. A `VERIFICATION.md` (or a section within the README) is the right home because:

- **It matches where technical users look.** Developers who want to reproduce cryptographic verification start at the repo, not the verify page. They need to understand the algorithm, the key endpoints, the data format, and the toolchain -- none of which belongs in a trust UI.
- **It can be thorough without penalty.** Documentation pages can show multi-step procedures, explain prerequisites (`openssl`, `jq`, etc.), show both the happy path and edge cases, without worrying about cognitive load on casual users.
- **It can be versioned alongside the code.** When the verification algorithm changes (v0.1.0 vs v0.2.0, TSA addition), the docs update in the same PR. An in-page tutorial would require code changes to the verify page template for documentation-only updates.

### 3. If a link is deemed necessary on the verify page, it belongs inside the existing "Cryptographic details" disclosure

If the team decides there must be *some* pointer from the verify page to CLI instructions, the only acceptable placement is a single text link at the bottom of the existing "Cryptographic details" `<details>` section. Not a third disclosure. Not a separate section. A single line:

> "Verify independently: [CLI verification guide](link-to-docs)"

**Why inside cryptographic details and not a new section:**

- **Progressive disclosure is already working.** The page has two disclosure layers (Capture details, Cryptographic details). Users who open "Cryptographic details" have self-selected as technically curious. They are the exact audience for a verification guide link. Adding a third disclosure section creates visual clutter for everyone (three disclosure summaries instead of two) while serving only the subset who already opened the second one.
- **No new UI elements.** A text link inside an existing section adds zero cognitive load to users who never open it. A new `<details>` section adds a visible summary line that every user sees and must evaluate ("Is this relevant to me?"). That evaluation is wasted effort for 90%+ of visitors.
- **Semantic correctness.** CLI verification is a continuation of the cryptographic details story, not a parallel concern. Nesting it inside the crypto section communicates "this is for people who care about the crypto" without making everyone else think about it.

### 4. Dynamic (pre-filled) vs. static: static, with one exception

**The instructions themselves should be static** -- they describe a procedure, not instance-specific data. "Download the WACZ, extract the hash, verify with openssl" is the same for every capture. Making instructions dynamic (template-substituting capture IDs and hashes into code blocks) creates several problems:

- **Maintenance burden.** Every template string in verify-page.js is a potential XSS surface. The page already carefully uses `textContent` for user-controlled data. Interpolating capture data into code blocks (which look like they should be copied verbatim) adds risk.
- **False precision.** Pre-filled commands suggest "just paste and run" but the user still needs to install tools, understand the output, and handle errors. Pre-filling creates an illusion of simplicity that breaks on first contact with reality.
- **YAGNI.** The current page serves zero CLI commands. Adding a template engine for one link is over-engineering.

**The exception:** if the link points to documentation that can accept query parameters (e.g., `VERIFICATION.md?id=cap_xxx`), the page could append the capture ID to the link. This lets docs pages optionally pre-fill examples. But this is a documentation concern, not a verify page concern.

### 5. What the documentation page should contain (content strategy, not implementation)

For the documentation to actually serve the "independent verification" job:

- **Prerequisites**: What tools are needed (openssl, jq, curl, unzip). Version requirements.
- **Step-by-step procedure**: Download WACZ -> extract datapackage.json and datapackage-digest.json -> recompute bundle hash -> fetch public key -> verify Ed25519 signature -> (optionally) verify RFC 3161 timestamp.
- **The hash algorithm**: Canonical JSON serialization of datapackage.json, then SHA-256. This is the non-obvious step.
- **Key archive endpoint**: How to find the right historical key for older captures.
- **What "verified" means and what it doesn't**: The page says "not verified cryptographically" for timestamps -- the docs should explain what IS verified (messageImprint match) and what ISN'T (TSA certificate chain).
- **Example with real output**: One worked example showing actual command output at each step.

---

## Proposed Tasks

Since this is advisory, these are strategic recommendations rather than implementation tickets:

1. **Do not add CLI instructions to verify-page.js.** This is a non-action that should be an explicit decision, not an oversight.

2. **Create VERIFICATION.md in the repo root** (or add a "Manual Verification" section to README.md) documenting the offline verification procedure. This is a documentation task, not a UI task.

3. **Optionally, add a single link inside the "Cryptographic details" disclosure** pointing to the verification docs. This is a minimal code change: one `<a>` element appended after the TSA rows.

4. **Do not build dynamic/pre-filled CLI commands.** Static docs with the capture ID as the only variable (which users can substitute themselves) is sufficient.

---

## Risks and Concerns

### Risk: Scope creep from "just a link" to "inline tutorial"
The most likely failure mode is that "add CLI instructions to the verify page" starts as a link and gradually accumulates into an inline tutorial with copy-to-clipboard buttons, syntax-highlighted code blocks, and step indicators. Each addition is individually reasonable but collectively they transform the verify page from a trust artifact into a developer tool. **Mitigation:** Establish the principle that the verify page's job is "confirm trust" and nothing else. Verification instructions are documentation, not UI.

### Risk: Technical users can't find the docs
If CLI verification docs live only in the repo README, users who arrive at the verify page from a shared link may never find them. They see the cryptographic details but have no path to "how do I check this myself?" **Mitigation:** The single link inside cryptographic details solves this. It's invisible to casual users but discoverable by the exact audience who needs it.

### Risk: Documentation drift
A standalone VERIFICATION.md will drift from the actual verification algorithm as the code evolves. **Mitigation:** This is inherent to documentation and not worse than embedding docs in the verify page template (which would also drift, but be harder to review in PRs). Standard mitigation: update docs in the same PR as algorithm changes.

### Risk: The verify page already has two disclosures; a link adds a third "thing to process"
Even a single link inside the crypto disclosure adds one more element. For the 5% of users who open it, that's one more decision: "Should I click this?" **Mitigation:** This is acceptable. Users who have already opened "Cryptographic details" have opted into complexity. A link at the bottom of that section is the lowest possible additional load.

### Concern: "Not verified cryptographically" for timestamps
The current timestamp label honestly discloses the limitation. CLI docs should maintain this honesty. If the docs show an openssl command for TSA certificate chain verification (which the server cannot do on Workers), that's actually a value-add -- it closes the verification gap that the server acknowledges. This is a strength of the documentation approach: it can go further than the automated checks.

---

## Additional Agents Needed

- **user-docs-minion**: To write the actual VERIFICATION.md content. The procedure involves canonical JSON, Ed25519, SHA-256, and RFC 3161 -- this needs careful technical writing that is accurate about what each step proves.
- **security-minion**: To review the verification procedure for correctness and to flag if any step in the documented procedure could mislead users about the strength of the verification (e.g., "verified" when the TSA chain is not checked).
- **software-docs-minion**: If the verification docs integrate into the existing README structure rather than a standalone file, software-docs-minion should review for consistency with established documentation patterns.
