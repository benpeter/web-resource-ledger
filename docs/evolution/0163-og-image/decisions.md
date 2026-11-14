# Decisions

- One image, `landing/public/assets/og-image.png` (1200x630, the size Open Graph
  and X large cards expect), named by absolute URL from the landing page, the five
  policy pages and the docs layout. Docs pages share the landing card instead of
  one image per page: a per-page image would need a render step in the docs build
  for little gain.
- The card repeats the landing hero ("Web evidence you can prove.") on the
  landing dark background with the light logo, and names the three formats a
  reader of evidence links looks for: Ed25519, RFC 3161, WACZ.
- `og:image:width`, `og:image:height` and `og:image:alt` go with it, so crawlers
  can lay out the card before fetching the image and screen readers in apps that
  show it get a description.
- Only the home page asks for the large card. The policy pages and the docs keep
  `twitter:card` `summary`, which shows the image as a thumbnail; they are
  reference pages, not pages to promote.
- The card source (`card.html`) sits in this folder, not in the served site. The
  outcome note gives the command that renders it; the render matches the
  committed PNG byte for byte.
