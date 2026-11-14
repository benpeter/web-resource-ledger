# Decisions

- The empty list now says what a capture gives (screenshot, HTML, WACZ archive,
  signed and timestamped, a public link anyone can check), offers an example URL,
  and links the API quick start and the MCP setup guide. Visitors from directory
  listings may arrive without a page in mind; the list should show what WRL does
  and how developers start.
- The example button fills the URL box and focuses it; it doesn't capture. A
  capture counts against the free allowance, so the user starts it with Enter or
  the Capture button. The example is Wikipedia's "Link rot" article, the page the
  landing page's demo capture shows.
- The links go to the docs start page (the API quick start) and the MCP guide, the
  two ways in that the directory listings (MCP registry, SaaSHub, DevHunt) point
  developers to.
- `submit_emptyState(filtered)` returns the content and is unit-tested;
  `submit_renderEmptyState` builds the DOM from it inside the same `.capture-empty`
  element, so the code that removes the guidance when the first capture appears
  still works. A list filtered to one schedule keeps its own text, without the
  example or links.
- No email and no new tracking. Whether this changes anything shows in D1: new
  accounts with at least one capture.
