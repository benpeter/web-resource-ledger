# Decisions

- Static SVG files instead of loosening the CSP. Rendering Mermaid in the page
  would need the inline script (or a self-hosted copy of Mermaid, several MB)
  plus `'unsafe-inline'` in `style-src`, because Mermaid writes inline styles.
  A docs site of a product that sells integrity should not relax its CSP for
  pictures, and static images load faster and work without JavaScript.
- The sources stay editable: `site/diagrams/<name>.mmd`, rendered by
  `npm run docs:diagrams` (`scripts/render-diagrams.mjs`) with the repo's
  existing `@playwright/test` Chromium and Mermaid 11.4.1, the version the
  page used. No new dependency.
- Labels are SVG text (`htmlLabels: false`): an SVG shown through `<img>` may
  not render `foreignObject` HTML labels. Width and height come from the
  viewBox, so the image has a size before it loads.
- Each image links to its SVG for the full-size view, and on screens wider than
  767 px a diagram may use the empty space right of the 42rem text column
  (same width rule as the compare page's wide mode). In the column alone the
  labels shrank to about 6 px.
- The whitepaper architecture diagram is laid out left to right; top to bottom
  it was 3495 px wide.
- Content fixed while rendering them, since nobody had seen them rendered:
  Workers KV holds OAuth state, the one-time first key and rate limit counters,
  not sessions (D1 since phase 0004); the "Browser Extension User" is a
  dashboard user (the extension is backlog #54); the personal data flow now has
  the emailed sign-in link (`email_users`, `login_tokens` as hashes); the
  sequence diagram had `;` in a message, which Mermaid reads as the end of a
  statement, so that diagram could not have rendered anyway.
- `test/docs-diagrams-sync.test.js` (in `npm run test:sync`): no docs page has
  a mermaid block, every source is shown on a page, and every image has alt
  text, a source and an SVG without script or `foreignObject` and with a size.
  It can't check that an SVG matches its source; rerun `npm run docs:diagrams`
  after editing one.
- The dead inline script and the Prism `mermaid` passthrough are gone, which
  also ends the CSP error on every docs page.
