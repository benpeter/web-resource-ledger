# Margo — Complexity Review

## Verdict: ADVISE

The plan is proportional to the problem. Two concerns worth addressing before execution.

---

### Finding 1: Separate `mermaid-init.js` file is unnecessary overhead

**What**: Task 1 creates a new file `site/js/mermaid-init.js` for ~15 lines of Mermaid initialization logic, then adds two script tags to `base.njk` (one for CDN, one for init).

**Why it is accidental complexity**: The init logic (find `pre > code.language-mermaid` blocks, replace them, call `mermaid.run()`) is trivially small. A separate file means an extra HTTP request, an extra file to maintain, and two script tags instead of one. The existing `clipboard.js` is a reasonable precedent for small standalone scripts, but the Mermaid init is even simpler and tightly coupled to the CDN load -- it has no reason to exist independently.

**Simpler alternative**: Inline the init logic as a single `<script type="module">` block in `base.njk` that imports Mermaid from CDN and runs init. One script tag, zero extra files, zero extra requests. Example shape:

```html
<script type="module">
  const nodes = document.querySelectorAll('pre code.language-mermaid');
  if (nodes.length) {
    const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    // ... replace nodes, call mermaid.run()
  }
</script>
```

This also gets lazy loading for free -- the 160KB Mermaid library is only fetched on pages that actually have Mermaid blocks. The plan's current approach loads the CDN script on every page regardless.

**Severity**: Non-blocking. Either approach works. The inline version is simpler, smaller, and avoids loading Mermaid on pages that don't need it.

---

### Finding 2: Three sequential tasks for a single-PR change

**What**: The plan splits work into 3 tasks with sequential dependencies (Task 1 -> Task 2 -> Task 3), requiring 3 agent invocations.

**Why it is accidental complexity**: Task 1 is ~15 lines of JS + 2 lines in a template. Task 3 is adding one line to a JS array and one card to a markdown file. Neither justifies a separate agent delegation. The overhead of agent startup, context loading, and handoff coordination exceeds the work itself.

**Simpler alternative**: Merge Tasks 1 and 3 into Task 2. The software-docs-minion creating the architecture page can also add the inline Mermaid init script and the nav entry -- these are mechanically simple changes that require no specialized frontend knowledge. This reduces to 1 task with 1 approval gate.

However, if nefario's orchestration model requires distinct tasks for distinct files, keeping Task 1 separate is defensible (it touches the base layout, which affects all pages). Task 3 as a separate task is harder to justify -- it is two one-line edits.

**Severity**: Non-blocking. The 3-task split works but pays unnecessary coordination cost. At minimum, fold Task 3 into Task 2.

---

### What the plan gets right

- **CDN over npm dependency**: Correct call. No build-time Mermaid plugin, no new npm dependency, no build complexity. Aligns with the project's vanilla-first principle.
- **Client-side over build-time rendering**: Fixes the 3 existing unrendered Mermaid blocks in the whitepaper for free. Zero build pipeline changes.
- **Single page over multiple pages**: One page with two diagrams is proportional. No unnecessary page hierarchy.
- **Conceptual level over endpoint-level**: Avoids duplicating the API Reference. Right abstraction level for the audience.
- **No test task**: Correct exclusion for static documentation content.
- **Redaction rules embedded in prompt**: Security constraints are inline, not a separate review layer. Efficient.

---

### Complexity Budget

| Item | Column | Cost |
|------|--------|------|
| Mermaid CDN (external dependency) | Managed | 1 |
| **Total** | | **1** |

Proportional. This is a documentation page with a rendering dependency, not an architectural change.
