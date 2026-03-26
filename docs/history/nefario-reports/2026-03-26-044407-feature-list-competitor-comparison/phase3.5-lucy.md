# Lucy Review: Feature List and Competitor Comparison

## Verdict: ADVISE

The plan is well-structured, traceable to issue #144, and respects project conventions. Three issues need correction before execution; none are blocking individually, but uncorrected they will produce visible bugs or requirement gaps.

---

## Findings

### 1. [DRIFT] Missing feature items from success criteria

**Requirement** (prompt.md line 6-7): The feature list must include "capture", "scheduled captures", "CLI verification tool", and "webhooks" -- all explicitly named in the success criteria. The prompt also says the developer subsection should include "links to relevant docs pages."

**Plan** (Task 1, lines 96-108): The 8 features listed are Ed25519 Signatures, Independent Timestamps, Public Verification, eIDAS Timestamps, REST API, MCP Server, WACZ Format, Self-Hostable. Missing from explicit feature items:
- **"capture"** as a core capability (arguably implicit, but it is the product's primary function)
- **"scheduled captures"** -- named in success criteria, only mentioned parenthetically inside REST API description ("Batch captures, webhooks, scheduled captures")
- **"CLI verification tool"** -- explicitly required in the developer benefits, not present
- **webhooks** -- explicitly required in the developer benefits, only mentioned parenthetically

The prompt says "links to relevant docs pages" for the developer subsection. The plan includes one link to the compare page but no links from individual feature items to their respective docs pages (e.g., MCP Server -> `/mcp/`, Webhooks -> `/webhooks/`).

**Fix**: Either add CLI verification tool and webhooks as standalone feature items (replacing or supplementing existing ones), or restructure so all success-criteria items are visibly addressed. Add doc page links to developer feature items.

### 2. [CONVENTION] Background alternation broken by section insertion

**Current landing page sections**: Use Cases (`--white`) -> How It Works (`--muted`) -> Pricing (`--white`).

**Proposed order** (Task 1, lines 57 and 117): Use Cases (`--white`) -> Features (`--muted`) -> How It Works (`--muted`) -> Compare (`--white`) -> Pricing (`--white`).

This creates two consecutive `--muted` sections (Features + How It Works) and two consecutive `--white` sections (Compare + Pricing). The plan itself says "alternating bg" at line 57 but the specified classes do not achieve alternation.

**Fix**: Flip the backgrounds. Features should be `--muted`, How It Works flipped to `--white`, Compare to `--muted`, Pricing stays `--white`. Or swap the Compare section background to `--muted`. The point is: verify the full sequence produces actual alternation and update the Task 1 prompt accordingly.

### 3. [SCOPE] Docs comparison table column count mismatch

**Plan heading** (Task 2, line 278): "7 columns". **Actual enumeration** (lines 279-287): 8 items listed (Tool, Cryptographic Signing, Independent Timestamps, Public Verification, API Access, Standard Format, eIDAS Qualified, Open Source). The success criteria (line 592) also says "8 columns."

This is a labeling error in the prompt text that will confuse the executing agent.

**Fix**: Change "7 columns" to "8 columns" at line 278.

---

## Traceability Check

| Requirement (from prompt.md) | Plan Element | Status |
|---|---|---|
| Feature list on landing (capture, signing, timestamps, verification, WACZ, MCP, scheduled captures) | Task 1: 8 features | PARTIAL -- "scheduled captures" buried in sub-text, "capture" implicit |
| Developer benefits (REST API, MCP, Ed25519, WACZ, CLI verification tool, webhooks) with doc links | Task 1: features grid | GAP -- CLI verification tool missing, webhooks not standalone, no doc links |
| Comparison table covers 9+ competitors | Task 2: 9 competitors + Manual | PASS |
| Table columns (integrity, signing, timestamps, verification, API, format, eIDAS) | Task 2: 8 columns | PASS (exceeds: adds Open Source) |
| Factual accuracy (no strawmanning) | Task 2: methodology section, qualified language | PASS |
| Mobile responsive | Task 1 + Task 2: card-stack pattern | PASS |
| Landing summary + docs full version + cross-links | Task 1 + Task 2: links between pages | PASS |
| Pure HTML + CSS, no JS | Task 1 + Task 2: explicitly prohibited | PASS |
| Match design-system.css | Task 1 + Task 2: uses design system vars, does not modify design-system.css | PASS |
| Evolution log | Task 3 | PASS |

## Scope Check

No YAGNI violations detected. The plan appropriately defers docs SEO infrastructure, avoids separate features page on docs, and limits landing comparison to 4 competitors. The structured data additions (featureList update, applicationSubCategory, offers) in Task 2 are a minor scope expansion but directly serve the discoverability goal of the issue. The "Open Source" column is not in the original success criteria columns but is a reasonable addition given the competitive landscape (Webrecorder's open-source nature is a key differentiator).

## CLAUDE.md Compliance

- Evolution log: PASS (Task 3 follows the required structure)
- No JS frameworks: PASS
- YAGNI: PASS
- KISS: PASS (lightweight patterns chosen over complex ones)
- Fail loudly: N/A (no runtime code)
- design-system.css not modified: PASS (explicitly prohibited in both task prompts)
- `.njk` precedent exists: PASS (`api-reference.njk` confirms the pattern)

## Summary

Three issues to fix before delegating:
1. Add CLI verification tool and webhooks as visible feature items; add doc page links to developer features
2. Fix the background alternation sequence across all 5 sections
3. Correct "7 columns" to "8 columns" in Task 2 prompt

None of these require re-architecture. They are prompt corrections that take minutes.
