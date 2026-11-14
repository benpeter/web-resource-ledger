# Outcome

- Red first (2b32e34), then green (83ca490).
- `landing/public/assets/og-image.png`; `og:image`, `og:image:width`,
  `og:image:height` and `og:image:alt` in `landing/public/{index,privacy,terms,
  security,content-policy,refund-policy}.html` and `site/_includes/layouts/base.njk`;
  `twitter:image` on the home page.
- Tests: `test/og-image-sync.test.js` (in `npm run test:sync`) checks the PNG's
  size from its header, that every landing page with Open Graph tags and the docs
  layout name it with size and alt text, and the home page's large card.
- Docs: CHANGELOG.

To change the card, edit `card.html` here and render it from this folder:

```sh
node -e "const { chromium } = require('@playwright/test'); (async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + process.cwd() + '/card.html');
  await p.waitForLoadState('networkidle');
  await p.screenshot({ path: '../../../landing/public/assets/og-image.png' });
  await b.close(); })();"
```

## Backlog changes

- #68: the Open Graph image is done; the title tag review, ghost-button contrast
  and DMCA FAQ items stay open there.
