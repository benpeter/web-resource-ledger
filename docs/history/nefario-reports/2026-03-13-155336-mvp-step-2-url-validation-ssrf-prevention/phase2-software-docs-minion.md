# Domain Plan Contribution: software-docs-minion

## Recommendations

### The core tension: YAGNI/KISS vs. security auditability

This project's philosophy is "more code, less blah blah" and "lean and mean." But URL validation is not ordinary code. It is the single control standing between the system and SSRF exploitation. The security minion called it "the existential threat." That changes the documentation calculus.

The principle I recommend: **document the threat, not the implementation.** Each validation check exists because of a specific attack vector. A future auditor (or future-you six months from now) needs to understand *which attack each check defends against* -- not how `URL.parse()` works. This is a textbook case of "document the why, not the what."

### Recommendation 1: JSDoc on every validation function, focused on the threat it mitigates

Each exported function and each significant internal check should have a JSDoc comment that names the attack vector it prevents and, where useful, cites the CWE or the specific bypass technique. This is not documentation for documentation's sake -- it is the link between "why does this code exist" and "what breaks if someone removes it."

The existing codebase already does this well. `index.js` line 23 has `// SECURITY: Use static message -- never reflect request.method or url.pathname` with a CWE reference. `responses.js` has a block comment explaining the detail message convention and its security reasoning. The URL validation module should follow the same pattern but more densely, because every function in this module exists for a security reason.

Concretely, the JSDoc should include:
- **What attack it prevents** (one line, e.g., "Prevents SSRF via hex-encoded loopback addresses (CWE-918)")
- **Why this specific check is necessary** if it is non-obvious (e.g., "JavaScript's URL parser normalizes `0x7f000001` to `127.0.0.1` but only after construction -- the raw hostname string must be checked separately")
- **What happens if this check is removed** (e.g., "Without this, `http://0x7f000001/` bypasses the private IP block and reaches internal services")

What JSDoc should NOT include: restatements of what the code does ("parses the URL and checks the scheme"), general explanations of SSRF, or lengthy prose. The code should be readable on its own; the comments explain the threat model.

### Recommendation 2: Tests as the primary documentation of blocked vectors

The test file for this module will be the most thorough documentation of what is blocked and why. Each test name should read as a sentence describing the bypass vector it exercises. This is standard practice for security-critical modules and is already aligned with the project's "more code, less blah blah" philosophy.

The test file IS the blocked-vectors catalog. A separate standalone document listing all blocked vectors would duplicate the test suite and go stale. Instead, the test file should be organized by attack category with descriptive `describe` blocks and `it` names that a security auditor can scan without running the tests.

Example structure:
```javascript
describe('URL validation', () => {
  describe('scheme allowlist', () => {
    it('rejects file:// URLs', ...);
    it('rejects javascript: URLs', ...);
    it('rejects data: URLs', ...);
    it('allows http:// URLs', ...);
    it('allows https:// URLs', ...);
  });

  describe('private IP blocking', () => {
    it('rejects 127.0.0.1 (loopback)', ...);
    it('rejects hex-encoded loopback (0x7f000001)', ...);
    it('rejects octal-encoded loopback (0177.0.0.1)', ...);
    it('rejects decimal-encoded loopback (2130706433)', ...);
    // ...
  });
});
```

Reading the test names alone should produce a complete picture of the security boundary.

### Recommendation 3: No standalone security document -- yet

A standalone document listing all blocked vectors (a "security controls inventory") is a useful artifact for formal security audits. But right now, the project has no external auditors, no compliance requirements, and no users beyond the operator. Creating this document now would be speculative documentation that duplicates what the tests already express.

The right trigger to create it: when the project gets its first external security review, or when the URL validation module grows beyond what a single test file can clearly communicate. Until then, the tests plus in-code JSDoc are sufficient and stay in sync with the implementation automatically.

This follows YAGNI directly: don't write the audit document until there is an audit.

### Recommendation 4: A threat-model comment block at the top of the module

One block comment at the top of `src/url-validation.js` that states the module's purpose and threat model in 5-10 lines. This is the "context" that code alone cannot provide. It should answer:
- What is this module's job? (Validate URLs before browser rendering to prevent SSRF)
- What trust boundary does it enforce? (Untrusted caller input -> validated URL safe for browser navigation)
- What categories of attack does it defend against? (List the categories, not every vector)
- Where are the tests? (Point to the test file)

This block comment is the entry point for someone encountering this module for the first time. It provides the "30-second orientation" that lets them understand the file's role before reading any function.

### Recommendation 5: Evolution log `decisions.md` captures the "why not" choices

The module will involve design decisions: why allowlist instead of denylist for schemes, why resolve DNS before browser navigation instead of relying on browser-level controls, why block `0.0.0.0` explicitly. These belong in `docs/evolution/0003-url-validation/decisions.md` (or whatever the next sequence number is), not in the code.

Code comments explain "why this check exists." The evolution log explains "why we chose this approach over the alternatives." This separation keeps the code focused and gives the evolution log the architectural reasoning it is designed to capture.

## Proposed Tasks

### Task 1: Write the module-level threat model comment

**What**: Write a 5-10 line block comment at the top of `src/url-validation.js` that establishes the module's security purpose, the trust boundary it enforces, and the attack categories it defends against.

**Deliverables**: Block comment in `src/url-validation.js` header.

**Dependencies**: Must be written as the module file is created (part of implementation, not a separate step). The implementer should write this before writing any validation functions -- it frames the intent.

**Guidance for the implementer**: Follow the existing style in `responses.js` (lines 1-5), which uses a block comment to establish the convention before any code. The URL validation header should be similarly concise and convention-setting.

### Task 2: JSDoc on every exported function and significant internal check

**What**: Each exported function gets a JSDoc block naming the attack vector(s) it prevents. Internal helper functions that are non-obvious get inline `// SECURITY:` comments in the same style as `index.js` line 23.

**Deliverables**: JSDoc and inline comments in `src/url-validation.js`, written during implementation.

**Dependencies**: Written as part of implementation. Not a separate documentation task -- the security comments are integral to the code.

**Guidance for the implementer**: The rule of thumb is: if removing a check would create a security vulnerability, the check needs a comment explaining which vulnerability. If the check is obvious from the code (e.g., `if (scheme !== 'http' && scheme !== 'https')`), the comment can be shorter. If the check defends against a non-obvious bypass (e.g., hex-encoded IPs), the comment should name the specific bypass.

### Task 3: Structure test file as a readable security catalog

**What**: Organize the test file with `describe` blocks by attack category and `it` names that read as complete sentences describing the vector. A security reviewer should be able to read the test names (without the test bodies) and understand the full scope of what is blocked.

**Deliverables**: Test file structure in `test/url-validation.test.js`.

**Dependencies**: Written during test implementation. This is guidance for how the test-minion (or implementer) structures the tests, not a separate task.

**Guidance for the test author**: Each `describe` block maps to an attack category from the threat model. Each `it` names the specific vector. Group "rejects" and "allows" together so the allowlist boundary is clear. Consider adding a brief comment at the top of each `describe` block citing the relevant threat ID from the security minion's STRIDE analysis (T1, T9, T11, etc.) to maintain traceability.

### Task 4: Capture design decisions in evolution log

**What**: Document the key design decisions for the URL validation module in the evolution log for this phase: why allowlist over denylist, why DNS pre-resolution, why DNS pinning, why block `0.0.0.0` separately, why the specific private IP ranges chosen, and alternatives that were rejected.

**Deliverables**: `docs/evolution/NNNN-url-validation/decisions.md` (where NNNN is the next sequence number).

**Dependencies**: The evolution log directory and `prompt.md` must be created before implementation begins (per CLAUDE.md rules). `decisions.md` is written during implementation as decisions are made. `outcome.md` is written after.

**Note**: This is a CLAUDE.md requirement, not an optional documentation task. Flagging it here to ensure the implementer does not skip it.

## Risks and Concerns

### Risk 1: Documentation and code diverge

The biggest risk with security documentation is staleness. If someone adds a new bypass check but does not update the JSDoc, the documentation becomes misleading. Mitigation: keep documentation in the code (JSDoc + test names), not in external documents. Code review should enforce "new check = new comment explaining why." The evolution log captures the initial decisions and does not need ongoing maintenance.

### Risk 2: Over-documenting to the point of noise

The YAGNI instinct might be overridden by security anxiety, leading to verbose comments that restate the code. The implementer should ask: "Would a competent developer reading this code without my comment misunderstand what attack it prevents?" If yes, comment. If no (the code is self-explanatory), skip the comment or keep it to a single `// SECURITY:` line.

### Risk 3: Test names become the audit document but are not readable

If tests are named poorly (`it('blocks bad URLs')` instead of `it('rejects hex-encoded loopback 0x7f000001')`), they fail as documentation. The test naming convention should be established early and enforced in review. The test file structure is as much a documentation artifact as a testing artifact for this module.

### Risk 4: Evolution log entry gets skipped

This has happened before (the feedback memory notes this explicitly). The implementer or orchestrator must create the evolution log directory and `prompt.md` before starting implementation, and `decisions.md` / `outcome.md` before the PR is finalized. This is a project requirement, not discretionary.

## Additional Agents Needed

None. The current team (security-minion for threat model, test-minion for test design, and the implementing agent) is sufficient for the documentation needs of this module. The documentation strategy here is deliberately code-centric: JSDoc in the source, descriptive test names, and evolution log entries. No standalone documentation artifacts need a dedicated documentation pass.

The one caveat: if a future phase introduces a formal security review or compliance requirement, that would trigger the creation of a standalone security controls inventory document. But per YAGNI, that document should not be created now.
