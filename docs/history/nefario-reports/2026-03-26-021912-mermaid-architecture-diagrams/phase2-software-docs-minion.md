# Domain Plan Contribution: software-docs-minion

## Recommendations

### Navigation placement

The current nav has a clear structure: **Getting Started > feature guides > API Reference > Security & Compliance**. The flow is onboarding-first, then usage topics, then reference, then trust/compliance.

An "Architecture" page fits best **after API Reference and before Security & Compliance**. Rationale:

- Architecture is a reference/understanding topic, not a usage guide. Placing it between Getting Started and Authentication would interrupt the "do things" flow with a "understand things" page.
- Readers who reach API Reference have already learned the endpoints. Architecture explains *how those endpoints work internally* -- the natural next question.
- It sits as a bridge between "how to use it" (API Reference) and "why to trust it" (Security), which is exactly what an integrity chain diagram addresses.

The nav entry should be:

```js
{ title: "Architecture", url: "/architecture/" },
```

Inserted at line 13 in `site/_data/site.js`, after `{ title: "API Reference", url: "/api-reference/" }` and before the Security & Compliance comment.

### Single page, not split

Both diagrams belong on a single page. Reasons:

1. **The existing pages are substantial single-topic pages** (Verification is ~148 lines, Authentication is ~167 lines). Two Mermaid diagrams with explanatory prose will be well within the same range -- no need to split.
2. **The diagrams are complementary**: the sequence diagram shows the user-facing flow, the flowchart shows the internal pipeline. A reader interested in architecture wants both. Splitting forces navigation for no benefit.
3. **The nav is already 21 entries.** Adding one entry is fine; adding two for closely related content creates clutter.

Structure the page with a brief intro, then two H2 sections -- one per diagram.

### Frontmatter conventions

Every content page follows the same pattern:

```yaml
---
layout: layouts/doc.njk
title: Page Title
description: One-sentence description used for SEO/meta.
---
```

The `doc.njk` layout expects only `content` (rendered from markdown). It wraps output in `<div class="docs-content"><article class="docs-prose">`. No additional frontmatter fields are needed.

### Heading and prose conventions

From the existing pages:

- **H1 matches `title`** exactly (e.g., `title: Authentication` / `# Authentication`)
- **H2 for major sections** (e.g., `## Using Your API Key`, `## How to verify`)
- **H3 for subsections** within an H2 (e.g., `### Scopes`, `### Command-line`)
- **Opening paragraph** immediately after H1: a concise 1-2 sentence summary of what the page covers and why it matters
- **Cross-links** use relative URLs with trailing slash (e.g., `[Authentication](/authentication/)`)
- **Code blocks** use language-tagged fences
- **Tables** use standard GFM pipe syntax
- **`<details>/<summary>`** used for deep-dive content that most readers can skip (see Verification and Authentication pages)
- **Blockquote notes** use `> **Note:**` prefix
- **Horizontal rules** (`---`) separate major topic shifts
- **No "What's next" cards** on interior pages -- only on the Getting Started (index) page

### Content file

Create `site/content/architecture.md`. The URL will be `/architecture/` based on Eleventy's default behavior (consistent with all other pages).

## Proposed Tasks

1. **Create `site/content/architecture.md`** with:
   - Frontmatter: `layout: layouts/doc.njk`, `title: Architecture`, `description` summarizing both diagrams
   - `# Architecture` heading
   - Brief intro paragraph (2-3 sentences: "This page shows how WRL processes captures and maintains the integrity chain. Two diagrams: user interaction flow and internal pipeline.")
   - `## User Interaction Flow` -- sequence diagram + explanatory prose
   - `## Capture Pipeline & Integrity Chain` -- flowchart + explanatory prose
   - Cross-links to Verification and API Reference pages where relevant

2. **Update `site/_data/site.js`** -- add `{ title: "Architecture", url: "/architecture/" }` after API Reference, before the Security comment

3. **Update the "What's next" card grid on `site/content/index.md`** -- add an Architecture card. Suggested position: after API Reference, before Security. Text: `**[Architecture](/architecture/)**\nHow WRL processes captures, signs bundles, and maintains the integrity chain.`

## Risks and Concerns

1. **Mermaid rendering in the docs site**: The docs site uses Eleventy with the `doc.njk` layout. Mermaid code fences (` ```mermaid `) will render as plain `<code>` blocks unless the site has Mermaid JS loaded or a build plugin. **Check whether the site includes Mermaid rendering** (look for `mermaid.min.js` or a markdown-it-mermaid plugin in the Eleventy config). If not, rendering must be added -- either client-side (Mermaid JS script tag) or build-time (plugin). This is a blocker that needs resolution before the diagrams will display.

2. **Diagram accuracy**: The diagrams must reflect the actual system behavior. The implementation minion creating the diagrams needs to read the actual capture pipeline code (queue handling, WACZ assembly, signing, timestamping) to ensure accuracy. Do not diagram from documentation alone -- read the source.

3. **Diagram complexity**: Mermaid diagrams that try to show everything become unreadable. Each diagram should show the essential flow (5-8 steps) with annotations pointing to detailed docs pages. The `<details>` pattern used on other pages could work for additional technical detail beneath each diagram.

4. **Mobile rendering**: Mermaid diagrams can overflow on narrow screens. The `docs-prose` CSS may need a horizontal scroll wrapper for the diagram containers.

## Additional Agents Needed

None -- the implementation can be handled by the agents already involved. The Mermaid rendering question (Risk 1) should be investigated during implementation by whoever creates the page.
